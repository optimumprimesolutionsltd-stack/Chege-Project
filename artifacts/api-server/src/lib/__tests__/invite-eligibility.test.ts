/**
 * A lapsed member cannot bring anybody new in.
 *
 * The paywall used to have a hole exactly here: every financial write was
 * refused for a lapsed manager except the one that adds people. The invitee
 * was checked when they accepted, so nothing unsafe happened - but a manager
 * could send twenty invitations and watch all twenty fail on the recipients'
 * side, which reads as a broken app rather than as a lapsed subscription.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const { mockResolve } = vi.hoisted(() => ({
  mockResolve: vi.fn(
    async (): Promise<{ status: string | null; fullAccess: boolean }> =>
      ({ status: "active", fullAccess: true }),
  ),
}));

vi.mock("../subscription-catalog", () => ({
  resolveMemberEntitlements: mockResolve,
}));

import { requireInviteEligibility } from "../activeGroup";

function contextFor({ role = "admin", userId = "member-1" }: { role?: string; userId?: string } = {}) {
  const json = vi.fn();
  const res = { status: vi.fn().mockReturnValue({ json }) } as unknown as Response;
  const req = {
    user: { id: userId },
    group: { id: 7, isPrivate: false, role },
  } as unknown as Request;
  return { req, res, json, status: res.status as unknown as ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolve.mockResolvedValue({ status: "active", fullAccess: true });
});

describe("inviting into a Shared group", () => {
  it("lets a current member invite", async () => {
    const { req, res } = contextFor();
    await expect(requireInviteEligibility(req, res)).resolves.toBe(true);
  });

  it("lets a member on trial invite", async () => {
    mockResolve.mockResolvedValue({ status: "trial", fullAccess: true });
    const { req, res } = contextFor();
    await expect(requireInviteEligibility(req, res)).resolves.toBe(true);
  });

  it("refuses a lapsed member, with 402 rather than 403", async () => {
    // 402 says this is about payment, not permission - the manager has the
    // role, they are simply behind on paying for it.
    mockResolve.mockResolvedValue({ status: "expired", fullAccess: false });
    const { req, res, json, status } = contextFor();

    await expect(requireInviteEligibility(req, res)).resolves.toBe(false);
    expect(status).toHaveBeenCalledWith(402);
    expect(json.mock.calls[0][0].error).toMatch(/subscription has lapsed/i);
  });

  it("tells them about inviting, not about records they cannot add to", async () => {
    mockResolve.mockResolvedValue({ status: "expired", fullAccess: false });
    const { req, res, json } = contextFor();

    await requireInviteEligibility(req, res);
    expect(json.mock.calls[0][0].error).toMatch(/cannot invite/i);
  });

  it("leaves accounts with no subscription row alone", async () => {
    // No row means an account that predates subscriptions, not one that is
    // behind on payment. Locking those out would be a rule applied backwards.
    mockResolve.mockResolvedValue({ status: null, fullAccess: false });
    const { req, res } = contextFor();

    await expect(requireInviteEligibility(req, res)).resolves.toBe(true);
  });

  it("never tells a viewer to subscribe", async () => {
    // Viewing is free, and paying would not grant a viewer the right to invite
    // people into somebody else's group either.
    mockResolve.mockResolvedValue({ status: "expired", fullAccess: false });
    const { req, res } = contextFor({ role: "viewer" });

    await expect(requireInviteEligibility(req, res)).resolves.toBe(true);
    expect(mockResolve).not.toHaveBeenCalled();
  });
});

describe("the invite gate is not the recording gate", () => {
  it("does not consult the one-member group rule", async () => {
    // requireSharedTransactionEligibility ends in canRecordSharedTransactions.
    // Reusing it here would have meant a one-member group could never invite
    // its second member - the group rule and the subscription rule are not the
    // same question.
    const { req, res } = contextFor();
    const group = req.group as unknown as { id: number };
    delete (group as { id?: number }).id;

    await expect(requireInviteEligibility(req, res)).resolves.toBe(true);
  });
});
