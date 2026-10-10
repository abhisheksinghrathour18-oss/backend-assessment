import { describe, it, expect, afterAll } from "vitest";
import { StubStorageProvider } from "../../src/infrastructure/storage/stub-storage.provider";
import { GcsStorageProvider } from "../../src/infrastructure/storage/gcs-storage.provider";
import { StorageService } from "../../src/infrastructure/storage/storage.service";
import { writeFile, readFile, unlink, rmdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

describe("Storage Providers", () => {
  const tempTestDir = path.resolve("./test-storage-stub");

  afterAll(async () => {
    try {
      if (existsSync(tempTestDir)) {
        await rmdir(tempTestDir, { recursive: true } as any);
      }
    } catch {
      // ignore
    }
  });

  describe("StubStorageProvider", () => {
    it("stores an uploaded file locally and preserves exact contents", async () => {
      const stub = new StubStorageProvider(tempTestDir);
      const testSourceFile = path.resolve("test-source-file.csv");
      const sampleContent = "order_id,customer_id\n123,456\n";

      await writeFile(testSourceFile, sampleContent, "utf-8");

      try {
        const ref = await stub.store(testSourceFile, "original-name.csv", "text/csv");

        expect(ref.provider).toBe("stub");
        expect(ref.originalFilename).toBe("original-name.csv");
        expect(existsSync(ref.location)).toBe(true);

        const storedContent = await readFile(ref.location, "utf-8");
        expect(storedContent).toBe(sampleContent);
        expect(ref.sizeBytes).toBe(Buffer.byteLength(sampleContent));

        // Test stream retrieval
        const stream = await stub.getStream(ref.objectKey);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.from(chunk));
        }
        expect(Buffer.concat(chunks).toString("utf-8")).toBe(sampleContent);

        // Test deletion
        await stub.delete(ref.objectKey);
        expect(existsSync(ref.location)).toBe(false);
      } finally {
        if (existsSync(testSourceFile)) {
          await unlink(testSourceFile);
        }
      }
    });

    it("throws an error when trying to store a non-existent file", async () => {
      const stub = new StubStorageProvider(tempTestDir);
      await expect(
        stub.store("does-not-exist.csv", "missing.csv"),
      ).rejects.toThrow("does not exist");
    });

    it("prevents path traversal in originalFilename", async () => {
      const stub = new StubStorageProvider(tempTestDir);
      const testSourceFile = path.resolve("test-traversal.csv");
      await writeFile(testSourceFile, "data", "utf-8");

      try {
        const ref = await stub.store(
          testSourceFile,
          "../../../../etc/passwd",
          "text/csv",
        );
        expect(ref.location.startsWith(tempTestDir)).toBe(true);
      } finally {
        if (existsSync(testSourceFile)) {
          await unlink(testSourceFile);
        }
      }
    });
  });

  describe("GcsStorageProvider", () => {
    it("provides an actionable error message when GCS is unconfigured", async () => {
      const gcs = new GcsStorageProvider();
      if (!gcs.isAvailable()) {
        await expect(
          gcs.store("any-file.csv", "any.csv"),
        ).rejects.toThrow("Google Cloud Storage is not configured or unavailable");
      }
    });
  });

  describe("StorageService", () => {
    it("defaults to StubStorageProvider in local environment", () => {
      const service = new StorageService();
      expect(service.getProvider().name).toBe("stub");
      expect(service.isAvailable()).toBe(true);
    });
  });
});
