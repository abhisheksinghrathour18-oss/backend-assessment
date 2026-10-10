import { describe, it, expect } from "vitest";
import { StorageService } from "../../src/infrastructure/gcs/storage.service";

describe("StorageService", () => {
  it("gracefully falls back when GCS_BUCKET_NAME is not configured", async () => {
    const service = new StorageService();
    if (!service.isConfigured()) {
      const result = await service.uploadFile("non-existent.csv", "destination.csv");
      expect(result).toBeNull();
      expect(service.isConfigured()).toBe(false);
    }
  });
});

