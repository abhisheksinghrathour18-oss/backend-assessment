import type { Readable } from "node:stream";
import type { StorageProvider, StorageReference } from "./storage.types";
import { StubStorageProvider } from "./stub-storage.provider";
import { GcsStorageProvider } from "./gcs-storage.provider";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

export class StorageService {
  private provider: StorageProvider;

  constructor(customProvider?: StorageProvider) {
    if (customProvider) {
      this.provider = customProvider;
    } else {
      const selected = env.STORAGE_PROVIDER.toLowerCase();
      if (selected === "gcs") {
        this.provider = new GcsStorageProvider();
        logger.info("StorageService initialized with GCS provider");
      } else {
        this.provider = new StubStorageProvider();
        logger.info("StorageService initialized with local Stub provider");
      }
    }
  }

  public getProvider(): StorageProvider {
    return this.provider;
  }

  public isAvailable(): boolean {
    return this.provider.isAvailable();
  }

  public async store(
    filePath: string,
    originalFilename: string,
    mimeType?: string,
  ): Promise<StorageReference> {
    return this.provider.store(filePath, originalFilename, mimeType);
  }

  public async getStream(objectKey: string): Promise<Readable> {
    return this.provider.getStream(objectKey);
  }

  public async getFilePath(objectKey: string): Promise<string> {
    return this.provider.getFilePath(objectKey);
  }

  public async delete(objectKey: string): Promise<void> {
    return this.provider.delete(objectKey);
  }
}

export const storageService = new StorageService();

