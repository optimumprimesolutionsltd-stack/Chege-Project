/**
 * Resetting a forgotten password.
 *
 * Two properties matter more than the happy path and are the easiest to lose
 * in a later edit:
 *
 *  - the answer to "send me a link" never says whether the address has an
 *    account, so the endpoint cannot be used to find out who banks with Jamvi;
 *  - the raw token never reaches the database, so a leaked backup is not a set
 *    of working links into people's money.
 */

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const { findFirst, insertValues, updateSet, updateRows, sendEmail, hashPassword, createSession } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  // Typed parameters, not inferred ones: a vi.fn() with no declared arguments
  // infers an empty tuple, and every mock.calls[0][0] below then fails to
  // compile even though the test itself is right.
  insertValues: vi.fn(async (_values: Record<string, unknown>) => undefined),
  updateSet: vi.fn((_values: Record<string, unknown>) => undefined),
  updateRows: { current: [] as unknown[] },
  sendEmail: vi.fn(async (_message: { from: string; to: string[]; subject: string; html: string }) => ({ id: "email-1" })),
  hashPassword: vi.fn((value: string) => "hashed:" + value),
  createSession: vi.fn(async () => "session-1"),
}));

vi.mock("@workspace/db", () => {
  const table = (name: string) => new Proxy({}, {
    get: (_, property) => ({ _table: name, _column: String(property) }),
  });
  return {
    db: {
      query: { usersTable: { findFirst } },
      insert: () => ({ values: insertValues }),
      update: () => ({
        set: (values: Record<string, unknown>) => {
          updateSet(values);
          const chain: Record<string, unknown> = {};
          chain.where = () => chain;
          chain.returning = () => Promise.resolve(updateRows.current);
          chain.then = (resolve: (rows: unknown[]) => unknown) =>
            Promise.resolve(updateRows.current).then(resolve);
          return chain;
        },
      }),
    },
    usersTable: table("users"),
    passwordResetTokensTable: table("password_reset_tokens"),
  };
});

vi.mock("../../lib/email", () => ({ sendEmail }));
vi.mock("../../lib/subscription-catalog", () => ({ ensureTrialSubscription: vi.fn(async () => undefined) }));
vi.mock("../../lib/photoStorage", () => ({
  resolvePhotoUrl: vi.fn(async () => null),
  verifyPhotoObject: vi.fn(async () => true),
}));
vi.mock("../../lib/activeGroup", () => ({ clearActiveWorkspaceCookie: vi.fn() }));
vi.mock("../../lib/requestOrigin.js", () => ({ resolveOrigin: () => "https://jamvi.co.ke" }));
vi.mock("openid-client", () => ({}));
vi.mock("../../lib/auth", () => ({
  authorizationParams: {},
  buildProviderLogoutUrl: vi.fn(),
  clearSession: vi.fn(),
  createSession,
  deleteSession: vi.fn(),
  getOidcConfig: vi.fn(),
  getSessionId: vi.fn(),
  ISSUER_URL: "https://accounts.google.com",
  SESSION_COOKIE: "sid",
  SESSION_TTL: 1000,
  hashPassword,
  verifyPassword: vi.fn(() => true),
}));

import authRouter from "../auth";

function appForAuth() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { log: unknown }).log = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => false;
    next();
  });
  app.use("/api", authRouter);
  return app;
}

const SAME_ANSWER = "If that email has a Jamvi account, a reset link is on its way.";

const withPassword = {
  id: "user-1",
  email: "ann@example.com",
  firstName: "Ann",
  passwordHash: "hashed:old",
};

beforeEach(() => {
  vi.clearAllMocks();
  updateRows.current = [];
  process.env.APP_URL = "https://jamvi.co.ke";
});

describe("POST /api/auth/forgot-password", () => {
  it("sends a link when the address has a password account", async () => {
    findFirst.mockResolvedValue(withPassword);

    const response = await request(appForAuth())
      .post("/api/auth/forgot-password")
      .send({ email: "ann@example.com" });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe(SAME_ANSWER);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("answers the same way for an address with no account", async () => {
    findFirst.mockResolvedValue(undefined);

    const response = await request(appForAuth())
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.com" });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe(SAME_ANSWER);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("answers the same way for a Google-only account, which has no password to reset", async () => {
    findFirst.mockResolvedValue({ ...withPassword, id: "user-2", passwordHash: null });

    const response = await request(appForAuth())
      .post("/api/auth/forgot-password")
      .send({ email: "ann@example.com" });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe(SAME_ANSWER);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("stores only the hash, and emails only the raw token", async () => {
    findFirst.mockResolvedValue(withPassword);

    await request(appForAuth()).post("/api/auth/forgot-password").send({ email: "ann@example.com" });

    const stored = insertValues.mock.calls[0][0] as {
      tokenHash: string;
      userId: string;
      expiresAt: Date;
    };
    const emailed = sendEmail.mock.calls[0][0].html;
    const token = /token=([a-f0-9]{64})/.exec(emailed)?.[1];

    expect(token).toBeTruthy();
    expect(stored.tokenHash).toBe(createHash("sha256").update(token as string).digest("hex"));
    expect(emailed).not.toContain(stored.tokenHash);
    expect(stored.userId).toBe("user-1");
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("points the link at the app, not the marketing site", async () => {
    findFirst.mockResolvedValue(withPassword);

    await request(appForAuth()).post("/api/auth/forgot-password").send({ email: "ann@example.com" });

    const emailed = sendEmail.mock.calls[0][0].html;
    expect(emailed).toContain("https://jamvi.co.ke/app/reset-password?token=");
  });

  it("still answers normally when the email fails to send", async () => {
    findFirst.mockResolvedValue(withPassword);
    sendEmail.mockRejectedValueOnce(new Error("Resend is down"));

    const response = await request(appForAuth())
      .post("/api/auth/forgot-password")
      .send({ email: "ann@example.com" });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe(SAME_ANSWER);
  });

  it("rejects something that is not an email address", async () => {
    const response = await request(appForAuth())
      .post("/api/auth/forgot-password")
      .send({ email: "not-an-address" });

    expect(response.status).toBe(400);
    expect(insertValues).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/reset-password", () => {
  const token = "a".repeat(64);

  it("sets the new password when the link is good", async () => {
    updateRows.current = [{ userId: "user-1", id: "user-1", email: "ann@example.com", firstName: "Ann" }];

    const response = await request(appForAuth())
      .post("/api/auth/reset-password")
      .send({ token, password: "a-better-password" });

    expect(response.status).toBe(200);
    expect(hashPassword).toHaveBeenCalledWith("a-better-password");
    expect(createSession).toHaveBeenCalled();
  });

  it("refuses a link that has been used or has expired", async () => {
    // The claim is a conditional update: no row comes back when the token is
    // already spent, past its expiry, or simply unknown.
    updateRows.current = [];

    const response = await request(appForAuth())
      .post("/api/auth/reset-password")
      .send({ token, password: "a-better-password" });

    expect(response.status).toBe(400);
    expect(hashPassword).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("refuses a password too short to be worth setting", async () => {
    const response = await request(appForAuth())
      .post("/api/auth/reset-password")
      .send({ token, password: "short" });

    expect(response.status).toBe(400);
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("refuses a token that is not the right shape, without touching the database", async () => {
    const response = await request(appForAuth())
      .post("/api/auth/reset-password")
      .send({ token: "nope", password: "a-better-password" });

    expect(response.status).toBe(400);
    expect(updateSet).not.toHaveBeenCalled();
  });
});
