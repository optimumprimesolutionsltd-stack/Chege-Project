import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanLineNumber, GROUP_MPESA_SOURCES } from "../group-mpesa-source";

// "My worry is the app importing users mpesa when it may not be what the group is using" (16 Oct 2026).
describe("which M-Pesa a shared group uses", () => {
  it("is one of five answers, and a number is digits only", () => {
    expect(GROUP_MPESA_SOURCES).toEqual(["treasurer_line", "paybill", "till", "bank", "none"]);
    expect(cleanLineNumber("0712 345 678")).toBe("0712345678");
    expect(cleanLineNumber("Paybill 123456")).toBe("123456");
    expect(cleanLineNumber("12")).toBeNull();
    expect(cleanLineNumber(42)).toBeNull();
  });

  it("is set by an owner or admin, only for a shared group, and the treasurer must be a member", () => {
    const route = readFileSync("src/routes/group-mpesa-source.ts", "utf8");
    expect(route).toContain("if (!requireGroupManager(req, res)) return;");
    expect(route).toContain("if (!group || group.privateOwner !== null) {");
    expect(route).toContain('res.status(400).json({ error: "The treasurer must be a member of this group." });');
  });

  it("makes its table after the server listens", () => {
    const index = readFileSync("src/index.ts", "utf8");
    expect(index.indexOf("void ensureGroupMpesaSource();")).toBeGreaterThan(index.indexOf("app.listen("));
  });
});
