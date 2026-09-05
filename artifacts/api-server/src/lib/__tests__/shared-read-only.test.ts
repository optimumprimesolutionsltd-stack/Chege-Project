/**
 * A lapsed member goes read-only in a Shared budget.
 *
 * This is the behaviour the whole pricing model rests on, and it is the one
 * most likely to be got wrong in a way nobody notices: too strict and a chama
 * loses a member's contribution history, too loose and nobody ever has a
 * reason to pay.
 *
 * The rule is that they keep the group and every record in it, and stop being
 * able to add to it. Their own Personal budget is untouched, because that is
 * where they go back to when they return.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const { mockMayUseSharedBudgets } = vi.hoisted(() => ({
  mockMayUseSharedBudgets: vi.fn(async () => true),
}));

vi.mock("../subscription-catalog", () => ({
  memberMayUseSharedBudgets: mockMayUseSharedBudgets,
}));

import { requireSharedTransactionEligibility } from "../activeGroup";

function contextFor({ isPrivate, userId = "member-1" }: { isPrivate: boolean; userId?: string }) {
  const json = vi.fn();
  const res = { status: vi.fn().mockReturnValue({ json }) } as unknown as Response;
  const req = {
    user: { id: userId },
    group: { id: 7, isPrivate },
  } as unknown as Request;
  return { req, res, json, status: res.status as unknown as ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMayUseSharedBudgets.mockResolvedValue(true);
});

describe("recording in a Shared budget", () => {
  it("lets a current member record", async () => {
    const { req, res } = contextFor({ isPrivate: false });

    await expect(requireSharedTransactionEligibility(req, res)).resolves.toBe(true);
  });

  it("refuses a lapsed member, with 402 rather than 403", async () => {
    // 402 says this is about payment, not permission. A member who is told
    // "forbidden" goes looking for an admin; one told "payment required" knows
    // what to do about it.
    mockMayUseSharedBudgets.mockResolvedValue(false);
    const { req, res, json, status } = contextFor({ isPrivate: false });

    await expect(requireSharedTransactionEligibility(req, res)).resolves.toBe(false);
    expect(status).toHaveBeenCalledWith(402);
    expect(json.mock.calls[0][0].error).toMatch(/read-only/i);
  });

  it("tells the member nothing has been removed", async () => {
    // The lapsed state is where every non-payer lives. It has to read as
    // recoverable, or they uninstall instead of coming back.
    mockMayUseSharedBudgets.mockResolvedValue(false);
    const { req, res, json } = contextFor({ isPrivate: false });

    await requireSharedTransactionEligibility(req, res);

    expect(json.mock.calls[0][0].error).toMatch(/nothing has been removed/i);
  });

  it("leaves a lapsed member's own Personal budget alone", async () => {
    // Personal is where their records live and where they return to. Locking
    // them out of it would delete the reason to resubscribe.
    mockMayUseSharedBudgets.mockResolvedValue(false);
    const { req, res } = contextFor({ isPrivate: true });

    await expect(requireSharedTransactionEligibility(req, res)).resolves.toBe(true);
    expect(mockMayUseSharedBudgets).not.toHaveBeenCalled();
  });

  it("asks about the member in front of it, not the group", async () => {
    const { req, res } = contextFor({ isPrivate: false, userId: "member-42" });

    await requireSharedTransactionEligibility(req, res);

    expect(mockMayUseSharedBudgets).toHaveBeenCalledWith("member-42");
  });
});
