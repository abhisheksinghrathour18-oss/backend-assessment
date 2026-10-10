import type { Readable } from "node:stream";

export interface StorageReference {
  provider: "stub" | "gcs";
  objectKey: string;
  originalFilename: string;
  location: string;
  sizeBytes?: number;
  storedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface StorageProvider {
  readonly name: "stub" | "gcs";
  store(
    filePath: string,
    originalFilename: string,
    mimeType?: string,
  ): Promise<StorageReference>;
  getStream(objectKey: string): Promise<Readable>;
  getFilePath(objectKey: string): Promise<string>;
  delete(objectKey: string): Promise<void>;
  isAvailable(): boolean;
}

