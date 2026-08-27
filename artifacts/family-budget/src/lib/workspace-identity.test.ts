import { describe, expect, it } from "vitest";
import { workspaceLabel } from "./workspace-identity";

describe("workspaceLabel", () => {
  it("preserves a customized Personal budget name and emoji", () => {
    expect(workspaceLabel({
      isPrivate: true,
      name: "My Future Fund",
      emoji: "🌱",
    })).toBe("🌱 My Future Fund");
  });

  it("uses the Personal budget fallback only when the private name is empty", () => {
    expect(workspaceLabel({
      isPrivate: true,
      name: "  ",
      emoji: null,
    })).toBe("Personal budget");
  });

  it("keeps the familiar Group fallback for an uncustomized Shared budget", () => {
    expect(workspaceLabel({
      isPrivate: false,
      name: "Shared budget",
      emoji: "🤝",
    })).toBe("🤝 Group");
  });
});