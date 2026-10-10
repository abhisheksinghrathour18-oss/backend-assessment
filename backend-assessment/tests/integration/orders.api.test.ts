
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app";

describe("API integration tests", () => {
  it("GET /health returns 200 and service status", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "backend-assessment",
    });
  });

  it("returns 404 for an unknown endpoint", async () => {
    const response = await request(app).get("/unknown-route");

    expect(response.status).toBe(404);
  });
});
