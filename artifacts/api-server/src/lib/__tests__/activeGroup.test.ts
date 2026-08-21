import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import {
  ACTIVE_WORKSPACE_COOKIE,
  isGroupManager,
  requireGroupManager,
  requireMemberSelfAttribution,
  setActiveWorkspaceCookie,
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

describe("web workspace preference", () => {
  it("keeps a selected shared budget only for the current browser session", () => {
    const cookie = vi.fn();
    const res = { cookie } as unknown as Response;

    setActiveWorkspaceCookie(res, 42);

    expect(cookie).toHaveBeenCalledWith(
      ACTIVE_WORKSPACE_COOKIE,
      "42",
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
      }),
    );
    expect(cookie.mock.calls[0]?.[2]).not.toHaveProperty("maxAge");
  });
});