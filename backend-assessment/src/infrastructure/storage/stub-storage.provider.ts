import { createReadStream, mkdirSync, existsSync } from "node:fs";
import { copyFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import type { StorageProvider, StorageReference } from "./storage.types";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

export class StubStorageProvider implements StorageProvider {
  public readonly name = "stub" as const;
  private readonly storageDir: string;

  constructor(customStorageDir?: string) {
    this.storageDir = path.resolve(
      process.cwd(),
      customStorageDir || env.STORAGE_STUB_DIR || "./storage",
    );
    mkdirSync(this.storageDir, { recursive: true });
  }

  public isAvailable(): boolean {
    return true;
  }

  public async store(
    filePath: string,
    originalFilename: string,
    mimeType?: string,
  ): Promise<StorageReference> {
    if (!existsSync(filePath)) {
      throw new Error(`File to store does not exist at path: ${filePath}`);
    }

    // Generate collision-safe object key and sanitize filename against path traversal
    const sanitizedName = path
      .basename(originalFilename)
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectKey = `${Date.now()}-${randomUUID()}-${sanitizedName}`;
    const destinationPath = path.resolve(this.storageDir, objectKey);

    // Prevent directory traversal attacks
    if (!destinationPath.startsWith(this.storageDir)) {
      throw new Error("Invalid destination path: potential directory traversal");
    }

    // Copy the file to the local storage directory (preserving exact contents)
    await copyFile(filePath, destinationPath);
    const fileStats = await stat(destinationPath);

    logger.info(
      {
        provider: "stub",
        objectKey,
        originalFilename,
        sizeBytes: fileStats.size,
      },
      "File stored successfully in local stub storage",
    );

    return {
      provider: "stub",
      objectKey,
      originalFilename,
      location: destinationPath,
      sizeBytes: fileStats.size,
      storedAt: new Date(),
      metadata: {
        mimeType: mimeType || "application/octet-stream",
      },
    };
  }

  public async getStream(objectKey: string): Promise<Readable> {
    const targetPath = path.resolve(this.storageDir, path.basename(objectKey));
    if (!existsSync(targetPath)) {
      throw new Error(`Object not found in stub storage: ${objectKey}`);
    }

    return createReadStream(targetPath);
  }

  public async getFilePath(objectKey: string): Promise<string> {
    const targetPath = path.resolve(this.storageDir, path.basename(objectKey));
    if (!existsSync(targetPath)) {
      throw new Error(`Object not found in stub storage: ${objectKey}`);
    }
    return targetPath;
  }

  public async delete(objectKey: string): Promise<void> {
    const targetPath = path.resolve(this.storageDir, path.basename(objectKey));
    if (existsSync(targetPath)) {
      await unlink(targetPath);
      logger.info({ objectKey }, "File deleted from stub storage");
    }
  }
}

