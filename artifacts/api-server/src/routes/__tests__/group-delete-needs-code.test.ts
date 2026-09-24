import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const group = read("../group.ts");
const lib = read("../../lib/account-deletion.ts");

// Deleting a group erases it for every member with no grace period. It now
// needs the same emailed-code approval as deleting an account.
describe("deleting a group needs an emailed code", () => {
  it("has a request-code step that is owner-only and refused for a Personal budget", () => {
    const step = group.slice(group.indexOf('router.post("/group/delete/request-code"'), group.indexOf('router.delete("/group"'));
    expect(step).toContain("accountDeletionCodeLimiter");
    expect(step).toContain("req.group?.isPrivate");
    expect(step).toContain("requireGroupOwner(req, res)");
    expect(step).toContain("requestGroupDeletionCode(");
  });

  it("erases nothing until the code has been spent", () => {
    const del = group.slice(group.indexOf('router.delete("/group"'), group.indexOf("export default router;"));
    expect(del.indexOf("confirmGroupDeletionCode(")).toBeGreaterThan(-1);
    expect(del.indexOf("confirmGroupDeletionCode(")).toBeLessThan(del.indexOf("eraseGroupData("));
    expect(del).toContain("Enter the 6-digit code we emailed you.");
    expect(del).toContain("accountDeletionConfirmLimiter");
  });

  it("scopes the code to the group so it cannot confirm an account deletion or another group", () => {
    expect(lib).toContain("`group:${groupId}:${code}`");
    expect(lib).toContain("pending.codeHash !== hashGroupDeletionCode(groupId, code)");
  });
});
