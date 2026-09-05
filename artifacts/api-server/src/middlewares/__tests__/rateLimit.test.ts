/**
 * The rate limiter.
 *
 * The behaviour worth pinning is not "it refuses after N" - it is which
 * requests count. Counting successful sign-ins would punish people for using
 * the app, which matters here more than in most places: mobile subscribers in
 * Kenya sit behind carrier-grade NAT, so the "connection" being limited is
 * frequently a whole neighbourhood rather than one person.
 */

import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit, resetRateLimits } from "../rateLimit";

function appWith(
  middleware: ReturnType<typeof rateLimit>,
  handler: express.RequestHandler = (_req, res) => {
    res.json({ ok: true });
  },
) {
  const app = express();
  app.use(express.json());
  app.post("/thing", middleware, handler);
  return app;
}

beforeEach(() => {
  resetRateLimits();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-05T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("counting every request", () => {
  const limiter = rateLimit({
    name: "test-all",
    windowMs: 60_000,
    max: 2,
    message: "Slow down.",
  });

  it("allows up to the limit and then refuses", async () => {
    const app = appWith(limiter);

    await expect(request(app).post("/thing").send({})).resolves.toMatchObject({ status: 200 });
    await expect(request(app).post("/thing").send({})).resolves.toMatchObject({ status: 200 });

    const refused = await request(app).post("/thing").send({});
    expect(refused.status).toBe(429);
    expect(refused.body.error).toBe("Slow down.");
  });

  it("says how long to wait", async () => {
    const app = appWith(limiter);
    await request(app).post("/thing").send({});
    await request(app).post("/thing").send({});

    const refused = await request(app).post("/thing").send({});
    expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);
    expect(Number(refused.headers["retry-after"])).toBeLessThanOrEqual(60);
  });

  it("forgets the count once the window has passed", async () => {
    const app = appWith(limiter);
    await request(app).post("/thing").send({});
    await request(app).post("/thing").send({});
    await expect(request(app).post("/thing").send({})).resolves.toMatchObject({ status: 429 });

    vi.setSystemTime(new Date("2026-09-05T09:01:01Z"));

    await expect(request(app).post("/thing").send({})).resolves.toMatchObject({ status: 200 });
  });
});

describe("counting only failures", () => {
  const limiter = rateLimit({
    name: "test-failures",
    windowMs: 60_000,
    max: 2,
    countsAgainstLimit: (status) => status >= 400,
    message: "Too many attempts.",
  });

  it("never counts a request that succeeded", async () => {
    const app = appWith(limiter);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(request(app).post("/thing").send({})).resolves.toMatchObject({ status: 200 });
    }
  });

  it("counts failures and refuses once they add up", async () => {
    const app = appWith(limiter, (_req, res) => {
      res.status(401).json({ error: "Email or password is incorrect." });
    });

    await expect(request(app).post("/thing").send({})).resolves.toMatchObject({ status: 401 });
    await expect(request(app).post("/thing").send({})).resolves.toMatchObject({ status: 401 });

    const refused = await request(app).post("/thing").send({});
    expect(refused.status).toBe(429);
  });
});

describe("counting by something other than the caller", () => {
  const limiter = rateLimit({
    name: "test-by-email",
    windowMs: 60_000,
    max: 1,
    message: "Asked for recently.",
    keyFor: (req) => {
      const email = (req.body as { email?: unknown } | undefined)?.email;
      return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
    },
  });

  it("limits each subject separately", async () => {
    const app = appWith(limiter);

    await expect(request(app).post("/thing").send({ email: "ann@example.com" })).resolves.toMatchObject({ status: 200 });
    await expect(request(app).post("/thing").send({ email: "ann@example.com" })).resolves.toMatchObject({ status: 429 });

    // A different person is unaffected by the first one's requests.
    await expect(request(app).post("/thing").send({ email: "ben@example.com" })).resolves.toMatchObject({ status: 200 });
  });

  it("treats the same address written differently as the same subject", async () => {
    const app = appWith(limiter);

    await request(app).post("/thing").send({ email: "ann@example.com" });
    const refused = await request(app).post("/thing").send({ email: "  ANN@Example.com " });
    expect(refused.status).toBe(429);
  });

  it("lets a request with nothing to count by through, for the endpoint to reject", async () => {
    const app = appWith(limiter);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(request(app).post("/thing").send({})).resolves.toMatchObject({ status: 200 });
    }
  });
});
