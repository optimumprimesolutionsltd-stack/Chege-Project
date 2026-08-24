/**
 * The health endpoint gates deploys on Render: the previous instance keeps
 * serving until the new one answers here. It previously returned a hardcoded
 * "ok" without touching anything, so an instance that could not reach Postgres
 * still reported healthy and Render cut live traffic over to it.
 *
 * These tests exist to keep that from quietly regressing - a health check that
 * cannot fail is worse than none, because it is trusted.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));

vi.mock("@workspace/db", () => ({ db: { execute: mockExecute } }));

vi.mock("../../lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import healthRouter from "../health.js";

function appWithHealth() {
  const app = express();
  app.use("/api", healthRouter);
  return app;
}

describe("GET /api/healthz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports ok when the database answers", async () => {
    mockExecute.mockResolvedValue({ rows: [{ "?column?": 1 }] });

    const response = await request(appWithHealth()).get("/api/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("reports 503 when the database is unreachable", async () => {
    mockExecute.mockRejectedValue(new Error("getaddrinfo ENOTFOUND db"));

    const response = await request(appWithHealth()).get("/api/healthz");

    // Render must see a failure here, otherwise it promotes a deploy that
    // cannot serve a single real request.
    expect(response.status).toBe(503);
    expect(response.body.status).not.toBe("ok");
  });

  it("actually queries the database rather than answering blind", async () => {
    mockExecute.mockResolvedValue({ rows: [] });

    await request(appWithHealth()).get("/api/healthz");

    expect(mockExecute).toHaveBeenCalled();
  });
});
