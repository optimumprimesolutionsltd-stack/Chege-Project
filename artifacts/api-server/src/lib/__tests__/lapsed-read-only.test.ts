/**
 * A lapsed member goes read-only, everywhere — their own Personal budget
 * included, not only a Shared group.
 *
 * This is the behaviour the whole pricing model rests on, and it is the one
 * most likely to be got wrong in a way nobody notices: too strict and a chama
 * loses a member's contribution history, too loose and nobody ever has a
 * reason to pay. Personal budgets were exempt for a while — the earlier
 * reasoning was that locking somebody out of the very budget they'd return to
 * would remove their reason to resubscribe — but the subscription is priced
 * to cover a Personal budget exactly as much as any group, and leaving it
 * ungated meant anyone could let their subscription lapse and keep using the
 * app's primary surface forever, for free. Confirmed as the intended fix,
 * not an accident, before this test flipped.
 *
 * The rule is that they keep the budget and every record in it, and stop
 * being able to add to it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

// Typed explicitly: inferring from the default return would fix status as
// string, and the case that broke production is status null.
const { mockResolve } = vi.hoisted(() => ({
  mockResolve: vi.fn(
    async (): Promise<{ status: string | null; fullAccess: boolean }> =>
      ({ status: "active", fullAccess: true }),
  ),
}));

vi.mock("../subscription-catalog", () => ({
  resolveMemberEntitlements: mockResolve,
}));

import { requireTransactionEligibility } from "../activeGroup";

function contextFor({ isPrivate, userId = "member-1" }: { isPrivate: boolean; userId?: string }) {
  const json = vi.fn();
  const res = { status: vi.fn().mockReturnValue({ json }) } as unknown as Response;
  const req = {
    user: { id: userId },
    group: { id: 7, isPrivate, role: "owner" },
  } as unknown as Request;
  return { req, res, json, status: res.status as unknown as ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolve.mockResolvedValue({ status: "active", fullAccess: true });
});

describe("recording in a Shared group", () => {
  it("lets a current member record", async () => {
    const { req, res } = contextFor({ isPrivate: false });

    await expect(requireTransactionEligibility(req, res)).resolves.toBe(true);
  });

  it("refuses a lapsed member, with 402 rather than 403", async () => {
    // 402 says this is about payment, not permission. A member who is told
    // "forbidden" goes looking for an admin; one told "payment required" knows
    // what to do about it.
    mockResolve.mockResolvedValue({ status: "expired", fullAccess: false });
    const { req, res, json, status } = contextFor({ isPrivate: false });

    await expect(requireTransactionEligibility(req, res)).resolves.toBe(false);
    expect(status).toHaveBeenCalledWith(402);
    expect(json.mock.calls[0][0].error).toMatch(/read-only/i);
    expect(json.mock.calls[0][0].error).toMatch(/Shared group/i);
  });

  it("tells the member nothing has been removed", async () => {
    // The lapsed state is where every non-payer lives. It has to read as
    // recoverable, or they uninstall instead of coming back.
    mockResolve.mockResolvedValue({ status: "expired", fullAccess: false });
    const { req, res, json } = contextFor({ isPrivate: false });

    await requireTransactionEligibility(req, res);

    expect(json.mock.calls[0][0].error).toMatch(/nothing has been removed/i);
  });

  it("does not lock out an account that has no subscription at all", async () => {
    // Not the same as lapsed. It means the account predates subscriptions, or
    // signed in by a route that does not create one, or has held a session
    // since before any of this existed. Blocking those people stopped expenses
    // saving in production.
    mockResolve.mockResolvedValue({ status: null, fullAccess: false });
    const { req, res, status } = contextFor({ isPrivate: false });

    await expect(requireTransactionEligibility(req, res)).resolves.toBe(true);
    expect(status).not.toHaveBeenCalled();
  });

  it("asks about the member in front of it, not the group", async () => {
    const { req, res } = contextFor({ isPrivate: false, userId: "member-42" });

    await requireTransactionEligibility(req, res);

    expect(mockResolve).toHaveBeenCalledWith("member-42");
  });
});

describe("recording in a Personal budget", () => {
  it("lets its owner record while their subscription is current", async () => {
    const { req, res } = contextFor({ isPrivate: true });

    await expect(requireTransactionEligibility(req, res)).resolves.toBe(true);
  });

  it("goes read-only too once the owner's subscription lapses", async () => {
    // The subscription is priced to cover a Personal budget exactly as much
    // as any Shared group — leaving this ungated meant a lapsed member could
    // keep using the app's main surface forever, for free.
    mockResolve.mockResolvedValue({ status: "expired", fullAccess: false });
    const { req, res, json, status } = contextFor({ isPrivate: true });

    await expect(requireTransactionEligibility(req, res)).resolves.toBe(false);
    expect(status).toHaveBeenCalledWith(402);
    expect(json.mock.calls[0][0].error).toMatch(/Personal budget is read-only/i);
    expect(json.mock.calls[0][0].error).toMatch(/nothing has been removed/i);
  });

  it("does not lock out a Personal budget with no subscription row at all", async () => {
    mockResolve.mockResolvedValue({ status: null, fullAccess: false });
    const { req, res, status } = contextFor({ isPrivate: true });

    await expect(requireTransactionEligibility(req, res)).resolves.toBe(true);
    expect(status).not.toHaveBeenCalled();
  });
});
