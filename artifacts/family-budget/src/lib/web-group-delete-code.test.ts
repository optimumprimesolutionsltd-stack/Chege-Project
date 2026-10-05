import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settings = readFileSync(new URL("../pages/settings.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("web: deleting a group goes through the emailed code", () => {
  it("Delete group only opens the dialog; it never deletes by itself", () => {
    expect(settings).toContain("onClick={() => setConfirmingDeleteGroup(true)}");
    expect(settings).not.toContain("handleDeleteGroup");
  });
  it("asks for a code, then deletes with it", () => {
    expect(settings).toContain('fetch("/api/group/delete/request-code", { method: "POST", credentials: "include" })');
    // The code, or for an account with no email, the typed word.
    expect(settings).toContain("body: JSON.stringify(groupDeletionWord ? { confirm: groupDeletionCode } : { code: groupDeletionCode })");
  });
});
