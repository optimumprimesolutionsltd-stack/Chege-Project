import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * What a person is told before they delete their account.
 *
 * Two things were wrong. The web asked with window.confirm, so the most
 * consequential action in the app got a plainer, unthemeable prompt than
 * deleting a single expense already got - and a browser set to block dialogs
 * returns false from confirm() silently, which is safe but makes the button
 * look broken rather than declined.
 *
 * And neither client listed what deletion actually does. The wording covered
 * the grace period and the groups but not that billing history is kept, which
 * is the detail people are most likely to assume the opposite of.
 *
 * The claims are checked against the code that performs the erasure, so the
 * warning cannot quietly stop being true.
 */
const web = readFileSync(new URL("./settings.tsx", import.meta.url), "utf8");
const mobile = readFileSync(
  new URL("../../../mobile-budget/app/(tabs)/settings.tsx", import.meta.url),
  "utf8",
);
const erasure = readFileSync(
  new URL("../../../api-server/src/lib/account-deletion.ts", import.meta.url),
  "utf8",
);

describe("the web asks the way the rest of the app asks", () => {
  it("uses the app's dialog, not the browser's", () => {
    expect(web).toContain("<AlertDialog open={confirmingDeleteAccount}");
    // Scoped to this handler: other actions on this page still use confirm(),
    // and changing those is not what this is about.
    const handler = web.slice(
      web.indexOf("const handleDeleteAccount"),
      web.indexOf("const pendingEmails"),
    );
    expect(handler.length).toBeGreaterThan(0);
    expect(handler).not.toContain("confirm(");
  });

  it("names the safe choice for what it does", () => {
    // "Cancel" next to "Delete my account" is ambiguous about which one
    // cancels the deletion.
    expect(web).toContain("Keep my account");
  });

  it("does not delete until the dialog is answered", () => {
    expect(web).toContain("onClick={() => setConfirmingDeleteAccount(true)}");
  });
});

describe("both clients state what actually happens", () => {
  it.each([
    ["signed out immediately", "signed out immediately"],
    ["the grace period", "14 days"],
    ["that signing back in cancels it", "the deletion is cancelled"],
    ["the Personal budget going", "Personal budget and everything recorded in it is erased"],
    ["what happens to owned groups", "longest-standing member"],
    ["the identity being scrubbed", "name, email address and photo are removed"],
    ["billing history being kept", "payments you have made are kept as billing history"],
  ])("says %s", (_label, phrase) => {
    expect(web).toContain(phrase);
    expect(mobile).toContain(phrase);
  });
});

describe("the warning matches what the erasure does", () => {
  it("is right that the grace period exists", () => {
    expect(erasure).toContain("ACCOUNT_DELETION_GRACE_DAYS");
    expect(erasure).toContain("cancelPendingAccountDeletion");
  });

  it("is right that an owned group is handed on rather than dropped", () => {
    expect(erasure).toContain("role: GROUP_ROLE.OWNER");
  });

  it("is right that identifying fields are cleared", () => {
    for (const field of ["email: null", "firstName: null", "preferredName: null", "profileImageUrl: null"]) {
      expect(erasure).toContain(field);
    }
  });

  it("is right that billing rows are left alone", () => {
    // If this ever stops being true the dialog is lying, which is worse than
    // saying nothing.
    expect(erasure).toContain("Financial rows (payments, subscription history)");
    expect(erasure).toContain("deliberately left alone");
  });
});
