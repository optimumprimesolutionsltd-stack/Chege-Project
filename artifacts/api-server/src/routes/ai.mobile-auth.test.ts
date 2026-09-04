import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/ai.ts", "utf8");

describe("Ask Jamvi mobile authentication handoff", () => {
  it("forwards the bearer token and selected workspace to the internal summary request", () => {
    expect(route).toContain('const authorization = req.get("authorization")');
    expect(route).toContain('const workspaceId = req.get("x-jamvi-workspace")');
    expect(route).toContain('...(authorization ? { authorization } : {})');
    expect(route).toContain('...(workspaceId ? { "x-jamvi-workspace": workspaceId } : {})');
  });
});