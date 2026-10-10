import { Storage } from "@google-cloud/storage";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import type { StorageProvider, StorageReference } from "./storage.types";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

export class GcsStorageProvider implements StorageProvider {
  public readonly name = "gcs" as const;
  private storage: Storage | null = null;
  private bucketName: string;

  constructor() {
    this.bucketName = env.GCS_BUCKET_NAME || "";
    if (this.bucketName) {
      try {
        this.storage = new Storage({
          projectId: env.GCP_PROJECT_ID || undefined,
        });
      } catch (error) {
        logger.warn(
          { err: error },
          "Failed to initialize GCS client; GCS provider will be marked unavailable",
        );
        this.storage = null;
      }
    }
  }

  public isAvailable(): boolean {
    return Boolean(this.bucketName && this.storage);
  }

  public async store(
    filePath: string,
    originalFilename: string,
    mimeType?: string,
  ): Promise<StorageReference> {
    if (!this.isAvailable()) {
      throw new Error(
        "Google Cloud Storage is not configured or unavailable. " +
          "Please verify GCS_BUCKET_NAME and Application Default Credentials (gcloud auth application-default login), " +
          "or set STORAGE_PROVIDER=stub for local development.",
      );
    }

    if (!existsSync(filePath)) {
      throw new Error(`File to store does not exist at path: ${filePath}`);
    }

    const sanitizedName = path
      .basename(originalFilename)
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectKey = `orders/${Date.now()}-${randomUUID()}-${sanitizedName}`;

    try {
      const bucket = this.storage!.bucket(this.bucketName);
      await bucket.upload(filePath, {
        destination: objectKey,
        metadata: {
          contentType: mimeType || "application/octet-stream",
        },
      });

      const fileStats = await stat(filePath);
      const gcsUri = `gs://${this.bucketName}/${objectKey}`;

      logger.info(
        { provider: "gcs", gcsUri, originalFilename, objectKey },
        "File successfully uploaded to Google Cloud Storage",
      );

      return {
        provider: "gcs",
        objectKey,
        originalFilename,
        location: gcsUri,
        sizeBytes: fileStats.size,
        storedAt: new Date(),
        metadata: {
          bucket: this.bucketName,
          contentType: mimeType || "application/octet-stream",
        },
      };
    } catch (error) {
      logger.error(
        { err: error, objectKey, originalFilename },
        "Failed to upload file to Google Cloud Storage",
      );
      throw error;
    }
  }

  public async getStream(objectKey: string): Promise<Readable> {
    if (!this.isAvailable()) {
      throw new Error("GCS provider is not configured");
    }

    const bucket = this.storage!.bucket(this.bucketName);
    const file = bucket.file(objectKey);
    return file.createReadStream();
  }

  public async getFilePath(objectKey: string): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error("GCS provider is not configured");
    }

    const os = await import("node:os");
    const destPath = path.join(os.tmpdir(), `gcs-${path.basename(objectKey)}`);
    const bucket = this.storage!.bucket(this.bucketName);
    const file = bucket.file(objectKey);
    await file.download({ destination: destPath });
    return destPath;
  }

  public async delete(objectKey: string): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error("GCS provider is not configured");
    }

    const bucket = this.storage!.bucket(this.bucketName);
    const file = bucket.file(objectKey);
    await file.delete({ ignoreNotFound: true });
    logger.info({ objectKey }, "File deleted from GCS");
  }
}

