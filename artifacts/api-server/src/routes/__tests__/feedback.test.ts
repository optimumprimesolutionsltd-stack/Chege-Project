import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import feedbackRouter from "../feedback.js";

function buildApp(user: { id: string; email?: string } | null = { id: "user-1", email: "person@example.com" }) {
  const app = express();
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => user !== null;
    req.user = user ?? undefined;
    req.log = { error: vi.fn() };
    next();
  });
  app.use(express.json());
  app.use("/api", feedbackRouter);
  return app;
}

describe("POST /api/feedback", () => {
  const originalUrl = process.env.FEEDBACK_CRM_URL;
  const originalKey = process.env.FEEDBACK_CRM_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.FEEDBACK_CRM_URL = "https://crm.example.test/receiveProductFeedback";
    process.env.FEEDBACK_CRM_KEY = "test-key";
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env.FEEDBACK_CRM_URL = originalUrl;
    process.env.FEEDBACK_CRM_KEY = originalKey;
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("requires an authenticated user", async () => {
    const response = await request(buildApp(null)).post("/api/feedback").send({ message: "Great app" });
    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects an empty message", async () => {
    const response = await request(buildApp()).post("/api/feedback").send({ message: "" });
    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("relays a valid submission to the CRM tagged as jamvi", async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: true });

    const response = await request(buildApp())
      .post("/api/feedback")
      .send({ message: "Would love a dark mode", rating: 4, context: "settings" });

    expect(response.status).toBe(201);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe("https://crm.example.test/receiveProductFeedback");
    expect(init.headers.authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      product: "jamvi",
      message: "Would love a dark mode",
      rating: 4,
      context: "settings",
      submittedBy: "person@example.com",
    });
  });

  it("answers 503 when the CRM relay is not configured", async () => {
    delete process.env.FEEDBACK_CRM_URL;
    delete process.env.FEEDBACK_CRM_KEY;

    const response = await request(buildApp()).post("/api/feedback").send({ message: "Hello" });

    expect(response.status).toBe(503);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("answers 502 when the CRM rejects the submission", async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 403 });

    const response = await request(buildApp()).post("/api/feedback").send({ message: "Hello" });

    expect(response.status).toBe(502);
  });
});
