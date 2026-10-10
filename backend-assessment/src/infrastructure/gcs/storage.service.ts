import { Storage } from "@google-cloud/storage";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";
import type { Readable } from "node:stream";

export class StorageService {
  private storage: Storage | null = null;
  private bucketName: string;

  constructor() {
    this.bucketName = env.GCS_BUCKET_NAME || "";
    if (this.bucketName) {
      try {
        this.storage = new Storage();
      } catch (error) {
        logger.warn({ err: error }, "Failed to initialize Google Cloud Storage client");
        this.storage = null;
      }
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.bucketName && this.storage);
  }

  public async uploadFile(
    localFilePath: string,
    destinationName: string,
  ): Promise<string | null> {
    if (!this.isConfigured()) {
      logger.debug("GCS is not configured, skipping file upload");
      return null;
    }

    try {
      const bucket = this.storage!.bucket(this.bucketName);
      await bucket.upload(localFilePath, {
        destination: destinationName,
        metadata: {
          contentType: "text/csv",
        },
      });

      const gcsUri = `gs://${this.bucketName}/${destinationName}`;
      logger.info({ gcsUri }, "File successfully uploaded to GCS");
      return gcsUri;
    } catch (error) {
      logger.error({ err: error, destinationName }, "Failed to upload file to GCS");
      throw error;
    }
  }

  public getFileStream(destinationName: string): Readable {
    if (!this.isConfigured()) {
      throw new Error("GCS is not configured");
    }

    const bucket = this.storage!.bucket(this.bucketName);
    const file = bucket.file(destinationName);
    return file.createReadStream();
  }
}

export const storageService = new StorageService();

