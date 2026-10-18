import { createHash } from "node:crypto";
import { CreateBucketCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface VaultPart {
  partNumber: number;
  etag: string;
}

// one interface, two adapters: memory for tests, s3 for real use against the vault in
// docker-compose. same pattern as the pipeline package (fake adapter first, real one wired in later)
export interface VaultStore {
  createMultipartUpload(vaultKey: string): Promise<{ uploadId: string }>;
  uploadPart(
    vaultKey: string,
    uploadId: string,
    partNumber: number,
    body: Uint8Array,
  ): Promise<{ etag: string }>;
  completeMultipartUpload(vaultKey: string, uploadId: string, parts: VaultPart[]): Promise<void>;
  getObject(vaultKey: string): Promise<Uint8Array>;
}

// keeps everything in memory, just concatenates parts in order on complete
// good for fast tests, nothing here needs docker running
export class MemoryVaultStore implements VaultStore {
  private uploads = new Map<string, { vaultKey: string; parts: Map<number, Uint8Array> }>();
  private objects = new Map<string, Uint8Array>();

  async createMultipartUpload(vaultKey: string) {
    const uploadId = crypto.randomUUID();
    this.uploads.set(uploadId, { vaultKey, parts: new Map() });
    return { uploadId };
  }

  async uploadPart(_vaultKey: string, uploadId: string, partNumber: number, body: Uint8Array) {
    const upload = this.uploads.get(uploadId);
    if (!upload) throw new Error(`no such upload ${uploadId}`);
    upload.parts.set(partNumber, body);
    return { etag: `fake-etag-${partNumber}` };
  }

  async completeMultipartUpload(vaultKey: string, uploadId: string, parts: VaultPart[]) {
    const upload = this.uploads.get(uploadId);
    if (!upload) throw new Error(`no such upload ${uploadId}`);
    const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    const chunks = ordered.map((p) => {
      const chunk = upload.parts.get(p.partNumber);
      if (!chunk) throw new Error(`missing part ${p.partNumber} for upload ${uploadId}`);
      return chunk;
    });
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const assembled = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      assembled.set(chunk, offset);
      offset += chunk.length;
    }
    this.objects.set(vaultKey, assembled);
    this.uploads.delete(uploadId);
  }

  async getObject(vaultKey: string) {
    const obj = this.objects.get(vaultKey);
    if (!obj) throw new Error(`no such object ${vaultKey}`);
    return obj;
  }
}

export interface S3VaultStoreConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

// talks to the s3-compatible vault from docker-compose (seaweedfs locally), same api
// works against real s3 later
//
// parts are held in memory and written as ONE object on complete, not as an s3
// multipart upload. s3 (seaweedfs included) rejects a multipart upload whose non-final
// parts are under 5 mb (EntityTooSmall), and the pi's 2 mb parts made every ~2.5 mb
// photo 500 (oct 17 2026). drill captures are a few mb, holding them briefly is fine.
// the resumable part-by-part contract with the device is unchanged
export class S3VaultStore implements VaultStore {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3VaultStoreConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region ?? "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  // the vault doesn't come with the bucket pre-made, nothing else creates it either.
  // call this once on startup instead of discovering a bucket-not-found error on
  // the very first upload
  async ensureBucket() {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") throw err;
    }
  }

  private pending = new Map<string, { vaultKey: string; parts: Map<number, Uint8Array> }>();

  async createMultipartUpload(vaultKey: string) {
    const uploadId = crypto.randomUUID();
    this.pending.set(uploadId, { vaultKey, parts: new Map() });
    return { uploadId };
  }

  async uploadPart(vaultKey: string, uploadId: string, partNumber: number, body: Uint8Array) {
    const upload = this.pending.get(uploadId);
    if (!upload || upload.vaultKey !== vaultKey) throw new Error(`no upload ${uploadId} for ${vaultKey}`);
    upload.parts.set(partNumber, new Uint8Array(body));
    return { etag: `"${createHash("md5").update(body).digest("hex")}"` };
  }

  async completeMultipartUpload(vaultKey: string, uploadId: string, parts: VaultPart[]) {
    const upload = this.pending.get(uploadId);
    if (!upload || upload.vaultKey !== vaultKey) throw new Error(`no upload ${uploadId} for ${vaultKey}`);
    const chunks = [...parts]
      .sort((a, b) => a.partNumber - b.partNumber)
      .map((p) => {
        const bytes = upload.parts.get(p.partNumber);
        if (!bytes) throw new Error(`part ${p.partNumber} of ${uploadId} never arrived`);
        return bytes;
      });
    const body = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: vaultKey, Body: body }));
    this.pending.delete(uploadId);
  }

  async getObject(vaultKey: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: vaultKey }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error(`empty object ${vaultKey}`);
    return bytes;
  }
}
