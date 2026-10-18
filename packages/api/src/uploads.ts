import { createHash } from "node:crypto";
import type { AssetKind, PhotoPurpose } from "@nightingale/schema";
import { HttpError } from "./http-error.js";
import type { VaultPart, VaultStore } from "./vault.js";

interface UploadSession {
  captureId: string;
  vaultKey: string;
  uploadId: string;
  expectedSha256: string;
  kind: AssetKind;
  photoPurpose?: PhotoPurpose;
  parts: VaultPart[];
  nextPartNumber: number;
  status: "uploading" | "complete" | "failed";
}

export interface InitAssetInput {
  kind: AssetKind;
  sha256: string;
  photoPurpose?: PhotoPurpose;
}

function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

// tracks in-flight uploads in memory, keyed by assetId. durable persistence (so this
// survives an api restart mid-upload) is a later milestone, this is just enough to prove
// the chunked/resumable contract end to end (ARCHITECTURE.md section 12, milestone 1)
export function createUploadTracker(vault: VaultStore) {
  const sessions = new Map<string, UploadSession>();

  function requireSession(assetId: string): UploadSession {
    const session = sessions.get(assetId);
    if (!session) throw new HttpError(404, `no such asset ${assetId}`);
    return session;
  }

  async function initAsset(captureId: string, input: InitAssetInput) {
    const assetId = crypto.randomUUID();
    const vaultKey = `${captureId}/${assetId}`;
    const { uploadId } = await vault.createMultipartUpload(vaultKey);
    sessions.set(assetId, {
      captureId,
      vaultKey,
      uploadId,
      expectedSha256: input.sha256,
      kind: input.kind,
      photoPurpose: input.photoPurpose,
      parts: [],
      nextPartNumber: 1,
      status: "uploading",
    });
    return { assetId, vaultKey, nextPartNumber: 1 };
  }

  async function uploadPart(assetId: string, partNumber: number, body: Uint8Array) {
    const session = requireSession(assetId);
    if (session.status !== "uploading") {
      throw new HttpError(409, `asset ${assetId} isn't accepting parts anymore (${session.status})`);
    }
    // sequential on purpose: resuming just means "ask the server what's next and keep going"
    // instead of reinventing a gap-filling protocol, see ARCHITECTURE.md section 5
    if (partNumber !== session.nextPartNumber) {
      throw new HttpError(409, `expected part ${session.nextPartNumber}, got ${partNumber}`);
    }
    const { etag } = await vault.uploadPart(session.vaultKey, session.uploadId, partNumber, body);
    session.parts.push({ partNumber, etag });
    session.nextPartNumber += 1;
    return { partNumber, nextPartNumber: session.nextPartNumber };
  }

  function getStatus(assetId: string) {
    const session = requireSession(assetId);
    return {
      assetId,
      vaultKey: session.vaultKey,
      kind: session.kind,
      status: session.status,
      receivedParts: session.parts.map((p) => p.partNumber),
      nextPartNumber: session.nextPartNumber,
    };
  }

  async function complete(assetId: string) {
    const session = requireSession(assetId);
    if (session.parts.length === 0) throw new HttpError(409, "no parts uploaded yet");

    await vault.completeMultipartUpload(session.vaultKey, session.uploadId, session.parts);
    const assembled = await vault.getObject(session.vaultKey);
    const actualSha256 = sha256Hex(assembled);

    if (actualSha256 !== session.expectedSha256) {
      session.status = "failed";
      throw new HttpError(
        409,
        `sha256 mismatch for ${assetId}: expected ${session.expectedSha256}, got ${actualSha256}`,
      );
    }

    session.status = "complete";
    return {
      assetId,
      captureId: session.captureId,
      vaultKey: session.vaultKey,
      kind: session.kind,
      sha256: actualSha256,
      verified: true,
      bytes: assembled,
    };
  }

  return { initAsset, uploadPart, getStatus, complete };
}
