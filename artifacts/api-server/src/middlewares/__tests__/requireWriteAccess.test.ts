/**
 * A viewer sees everything and records nothing.
 *
 * This is a security boundary, and the reason it is enforced in one middleware
 * rather than in each handler is that a per-route list is one omission away
 * from letting a viewer record money in somebody else's chama. These tests
 * pin the boundary itself, not any particular route.
 */

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireWriteAccess } from "../requireWriteAccess";

function appAs(role: string | undefined) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (role) {
      (req as unknown as { group: unknown }).group = { id: 7, role, isPrivate: false };
    }
    next();
  });
  app.use(requireWriteAccess);
  // A generous surface, so a pass through the middleware is what is measured
  // rather than the shape of any one route.
  app.all("/{*splat}", (_req, res) => {
    res.json({ reached: true });
  });
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe("a viewer", () => {
  it("reads freely", async () => {
    const response = await request(appAs("viewer")).get("/expenses");

    expect(response.status).toBe(200);
    expect(response.body.reached).toBe(true);
  });

  it.each([
    ["post", "/expenses"],
    ["put", "/budget-categories/4"],
    ["patch", "/members/1"],
    ["delete", "/contributions/9"],
  ])("cannot %s %s", async (method, path) => {
    const agent = request(appAs("viewer")) as unknown as Record<string, (p: string) => request.Test>;
    const response = await agent[method](path).send({});

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/view-only/i);
  });

  it("is refused with 403 rather than 402", async () => {
    // 402 would say this is about money. It is not: viewing is free, and
    // paying would not grant write access to somebody else's budget either.
    const response = await request(appAs("viewer")).post("/expenses").send({});

    expect(response.status).toBe(403);
  });

  it("can still switch workspace, or it could never leave", async () => {
    const response = await request(appAs("viewer")).post("/workspaces/select").send({ groupId: 1 });

    expect(response.status).toBe(200);
  });

  it("can still pay for their own subscription", async () => {
    // Billing belongs to the person, not to the budget they are looking at.
    const response = await request(appAs("viewer")).post("/payments/stk-push").send({});

    expect(response.status).toBe(200);
  });

  it("can still ask a question, which changes nothing", async () => {
    const response = await request(appAs("viewer")).post("/ai/ask").send({ question: "how are we doing?" });

    expect(response.status).toBe(200);
  });

  it("is not let through by a path that merely starts with an allowed one", async () => {
    const response = await request(appAs("viewer")).post("/paymentsomething").send({});

    expect(response.status).toBe(403);
  });
});

describe("everybody else", () => {
  it.each(["owner", "admin", "member"])("writes as before: %s", async (role) => {
    const response = await request(appAs(role)).post("/expenses").send({});

    expect(response.status).toBe(200);
  });

  it("passes through when no workspace is selected, for the routes that decide that themselves", async () => {
    const response = await request(appAs(undefined)).post("/workspaces").send({});

    expect(response.status).toBe(200);
  });
});
