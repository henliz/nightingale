import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";

export interface VaultPart {
  partNumber: number;
  etag: string;
}

// one interface, two adapters: memory for tests, s3 for real use against minio/docker-compose
// same pattern as the pipeline package (fake adapter first, real one wired in later)
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

// talks to minio locally (docker-compose), same api works against real s3 later
//
// heads up: real s3/minio multipart upload requires every part except the last to be
// at least 5mb. drill clips (90s max, 16khz mono wav) land well under that, so this only
// works as long as the whole file fits in one part. fine for v0, revisit the chunk size
// if clips get bigger or this gets wired to bigger files (ARCHITECTURE.md section 5)
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

  async createMultipartUpload(vaultKey: string) {
    const res = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: vaultKey }),
    );
    if (!res.UploadId) throw new Error("minio didn't return an upload id");
    return { uploadId: res.UploadId };
  }

  async uploadPart(vaultKey: string, uploadId: string, partNumber: number, body: Uint8Array) {
    const res = await this.client.send(
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: vaultKey,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body,
      }),
    );
    if (!res.ETag) throw new Error("minio didn't return an etag");
    return { etag: res.ETag };
  }

  async completeMultipartUpload(vaultKey: string, uploadId: string, parts: VaultPart[]) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: vaultKey,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [...parts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ ETag: p.etag, PartNumber: p.partNumber })),
        },
      }),
    );
  }

  async getObject(vaultKey: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: vaultKey }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error(`empty object ${vaultKey}`);
    return bytes;
  }
}
