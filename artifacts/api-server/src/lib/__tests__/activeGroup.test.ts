import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import {
  isGroupManager,
  requireGroupManager,
  requireMemberSelfAttribution,
} from "../activeGroup";

function request(role: "owner" | "admin" | "member", userId = "member-1") {
  return {
    user: { id: userId },
    group: { id: 1, role },
  } as unknown as Request;
}

function response() {
  const json = vi.fn();
  return {
    status: vi.fn().mockReturnValue({ json }),
    json,
  } as unknown as Response;
}

describe("shared group action permissions", () => {
  it.each(["owner", "admin"] as const)("allows %s to manage shared setup", (role) => {
    const res = response();
    expect(isGroupManager(request(role))).toBe(true);
    expect(requireGroupManager(request(role), res)).toBe(true);
  });

  it("blocks members from manager-only actions", () => {
    const res = response();
    expect(isGroupManager(request("member"))).toBe(false);
    expect(requireGroupManager(request("member"), res)).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("allows members to attribute participation only to themselves", () => {
    const res = response();
    expect(requireMemberSelfAttribution(request("member"), res, ["member-1"])).toBe(true);
    expect(requireMemberSelfAttribution(request("member"), res, ["someone-else"])).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});