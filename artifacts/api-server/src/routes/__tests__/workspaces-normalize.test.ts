import { describe, expect, it } from "vitest";
import { GetWorkspacesResponse } from "@workspace/api-zod";
import { toWorkspaceListItem } from "../workspaces";

const base = {
  id: 1,
  name: "Umoja Chama",
  emoji: null,
  nameStyle: "plain",
  icon: "users",
  accentColor: "#0F766E",
  slogan: null,
  kind: "chama",
  privateOwnerUserId: null,
  role: "owner",
};

describe("toWorkspaceListItem", () => {
  it("passes a well-formed row through unchanged", () => {
    const item = toWorkspaceListItem(base, null);
    expect(item.kind).toBe("chama");
    expect(item.icon).toBe("users");
    expect(item.role).toBe("owner");
    expect(() => GetWorkspacesResponse.parse([item])).not.toThrow();
  });

  it("snaps unknown enum values to safe defaults so the schema still parses", () => {
    const item = toWorkspaceListItem(
      {
        ...base,
        nameStyle: "handwritten",
        icon: "rocket",
        accentColor: "#123456",
        kind: "sacco",
        role: "treasurer",
      },
      null,
    );
    expect(item.nameStyle).toBe("plain");
    expect(item.icon).toBe("users");
    expect(item.accentColor).toBe("#0F766E");
    expect(item.kind).toBe("family");
    expect(item.role).toBe("member");
    expect(() => GetWorkspacesResponse.parse([item])).not.toThrow();
  });

  it("clamps an over-long emoji and slogan to null", () => {
    const item = toWorkspaceListItem(
      { ...base, emoji: "x".repeat(40), slogan: "y".repeat(300) },
      null,
    );
    expect(item.emoji).toBeNull();
    expect(item.slogan).toBeNull();
  });

  it("drops the photo for a private workspace", () => {
    const item = toWorkspaceListItem({ ...base, privateOwnerUserId: "u-1" }, "https://cdn/x.png");
    expect(item.isPrivate).toBe(true);
    expect(item.photoUrl).toBeNull();
  });

  it("keeps the photo for a shared workspace", () => {
    const item = toWorkspaceListItem(base, "https://cdn/x.png");
    expect(item.photoUrl).toBe("https://cdn/x.png");
  });
});
