// rust side of the http contract in @nightingale/schema + packages/api, see
// ARCHITECTURE.md section 4: "the only contract between them is HTTP"
//
// this is just the client, no queue/retry/state machine yet, that's milestone 7.
// for now it reads a whole file, chunks it, and pushes it through init -> parts -> complete

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

pub struct UploadClient {
    base_url: String,
    http: reqwest::blocking::Client,
}

// the api (packages/api) is a js/ts server, so its json is camelCase, not rust's
// usual snake_case. rename_all handles the translation on the way in
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitAssetResponse {
    pub asset_id: String,
    pub vault_key: String,
    pub next_part_number: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartResponse {
    pub part_number: u32,
    pub next_part_number: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteResponse {
    pub asset_id: String,
    pub vault_key: String,
    pub sha256: String,
    pub verified: bool,
}

#[derive(Serialize)]
struct InitAssetRequest<'a> {
    kind: &'a str,
    sha256: &'a str,
    // when recording started, lets the server skip chunks it already transcribed live
    #[serde(rename = "capturedAt", skip_serializing_if = "Option::is_none")]
    captured_at: Option<u64>,
    // this pi's clock right now. it has no clock battery and can be minutes off, the
    // server uses the difference to correct capturedAt
    #[serde(rename = "deviceNow")]
    device_now: u64,
}

impl UploadClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            // the server transcribes + condenses audio before it answers /complete, a 30s
            // chunk can take a while on a slow connection, reqwest's default 30s is too tight
            http: reqwest::blocking::Client::builder()
                .timeout(std::time::Duration::from_secs(180))
                .build()
                .expect("reqwest client"),
        }
    }

    pub fn init_asset(
        &self,
        capture_id: &str,
        kind: &str,
        sha256: &str,
    ) -> Result<InitAssetResponse> {
        self.init_asset_at(capture_id, kind, sha256, None)
    }

    pub fn init_asset_at(
        &self,
        capture_id: &str,
        kind: &str,
        sha256: &str,
        captured_at: Option<u64>,
    ) -> Result<InitAssetResponse> {
        let url = format!("{}/captures/{}/assets", self.base_url, capture_id);
        let res = self
            .http
            .post(url)
            .json(&InitAssetRequest {
                kind,
                sha256,
                captured_at,
                device_now: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0),
            })
            .send()?;
        if !res.status().is_success() {
            return Err(format!("init asset failed: {}", res.status()).into());
        }
        Ok(res.json()?)
    }

    pub fn upload_part(
        &self,
        asset_id: &str,
        part_number: u32,
        bytes: &[u8],
    ) -> Result<PartResponse> {
        let url = format!(
            "{}/assets/{}/parts/{}",
            self.base_url, asset_id, part_number
        );
        let res = self.http.put(url).body(bytes.to_vec()).send()?;
        if !res.status().is_success() {
            return Err(format!("part {} upload failed: {}", part_number, res.status()).into());
        }
        Ok(res.json()?)
    }

    pub fn complete(&self, asset_id: &str) -> Result<CompleteResponse> {
        let url = format!("{}/assets/{}/complete", self.base_url, asset_id);
        let res = self.http.post(url).send()?;
        if !res.status().is_success() {
            return Err(format!("complete failed: {}", res.status()).into());
        }
        Ok(res.json()?)
    }

    // reads the whole file into memory, which is fine for a 90s clip (v0 clip sizes are a
    // couple mb at most). streaming off disk is only worth it if that assumption changes
    pub fn upload_file(
        &self,
        capture_id: &str,
        kind: &str,
        path: &Path,
        chunk_size: usize,
    ) -> Result<CompleteResponse> {
        self.upload_file_at(capture_id, kind, path, chunk_size, None)
    }

    pub fn upload_file_at(
        &self,
        capture_id: &str,
        kind: &str,
        path: &Path,
        chunk_size: usize,
        captured_at: Option<u64>,
    ) -> Result<CompleteResponse> {
        let bytes = fs::read(path)?;
        let sha256 = hex::encode(Sha256::digest(&bytes));

        let init = self.init_asset_at(capture_id, kind, &sha256, captured_at)?;
        let mut next_part = init.next_part_number;

        for chunk in bytes.chunks(chunk_size.max(1)) {
            let part = self.upload_part(&init.asset_id, next_part, chunk)?;
            next_part = part.next_part_number;
        }

        self.complete(&init.asset_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use httpmock::prelude::*;
    use serde_json::json;

    #[test]
    fn uploads_a_small_file_in_two_chunks() {
        let server = MockServer::start();
        let bytes = b"fake audio bytes, a short fictional drill clip".to_vec();
        let sha256 = hex::encode(Sha256::digest(&bytes));

        let init_mock = server.mock(|when, then| {
            when.method(POST).path("/captures/cap_1/assets");
            then.status(201).json_body(json!({
                "assetId": "asset_1",
                "vaultKey": "cap_1/asset_1",
                "nextPartNumber": 1
            }));
        });
        let part1_mock = server.mock(|when, then| {
            when.method(PUT).path("/assets/asset_1/parts/1");
            then.status(200)
                .json_body(json!({ "partNumber": 1, "nextPartNumber": 2 }));
        });
        let part2_mock = server.mock(|when, then| {
            when.method(PUT).path("/assets/asset_1/parts/2");
            then.status(200)
                .json_body(json!({ "partNumber": 2, "nextPartNumber": 3 }));
        });
        let complete_mock = server.mock(|when, then| {
            when.method(POST).path("/assets/asset_1/complete");
            then.status(200).json_body(json!({
                "assetId": "asset_1",
                "vaultKey": "cap_1/asset_1",
                "sha256": sha256,
                "verified": true
            }));
        });

        let path = std::env::temp_dir().join("nightingale_upload_test.bin");
        fs::write(&path, &bytes).unwrap();

        let client = UploadClient::new(server.base_url());
        let result = client.upload_file("cap_1", "audio", &path, 30).unwrap();

        fs::remove_file(&path).ok();

        assert_eq!(result.asset_id, "asset_1");
        assert!(result.verified);
        init_mock.assert();
        part1_mock.assert();
        part2_mock.assert();
        complete_mock.assert();
    }

    #[test]
    fn surfaces_an_error_when_init_fails() {
        let server = MockServer::start();
        server.mock(|when, then| {
            when.method(POST).path("/captures/cap_1/assets");
            then.status(500);
        });

        let client = UploadClient::new(server.base_url());
        let result = client.init_asset("cap_1", "audio", &"a".repeat(64));

        assert!(result.is_err());
    }
}
