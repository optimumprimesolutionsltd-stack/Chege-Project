import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * What a person is told before they delete their account, and what actually
 * has to happen before it is scheduled.
 *
 * Three things were wrong, in order of when they were found and fixed. The
 * web asked with window.confirm, so the most consequential action in the app
 * got a plainer, unthemeable prompt than deleting a single expense already
 * got - and a browser set to block dialogs returns false from confirm()
 * silently, which is safe but makes the button look broken rather than
 * declined. Neither client listed what deletion actually does - the wording
 * covered the grace period and the groups but not that billing history is
 * kept, the detail people are most likely to assume the opposite of. And a
 * single tap plus one dialog was enough to schedule it, so a session left
 * open on a shared device could do it with nobody's actual say-so - which is
 * what the emailed code now stands in front of.
 *
 * The claims are checked against the code that performs the erasure, so the
 * warning cannot quietly stop being true.
 */
const web = readFileSync(new URL("./settings.tsx", import.meta.url), "utf8");
const mobile = readFileSync(
  new URL("../../../mobile-budget/app/(tabs)/settings.tsx", import.meta.url),
  "utf8",
);
const mobileCodeScreen = readFileSync(
  new URL("../../../mobile-budget/app/delete-account-code.tsx", import.meta.url),
  "utf8",
);
const erasure = readFileSync(
  new URL("../../../api-server/src/lib/account-deletion.ts", import.meta.url),
  "utf8",
);

describe("the web asks the way the rest of the app asks", () => {
  it("uses the app's dialog, not the browser's", () => {
    expect(web).toContain("<AlertDialog");
    // Scoped to this handler: other actions on this page still use confirm(),
    // and changing those is not what this is about.
    const handler = web.slice(
      web.indexOf("const requestDeletionCode"),
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

  it("does not start any of this until the dialog is opened", () => {
    expect(web).toContain("onClick={() => setConfirmingDeleteAccount(true)}");
  });
});

describe("neither client can schedule deletion without the emailed code", () => {
  it("calls request-code before anything is scheduled, and confirm only once a code is entered", () => {
    // Mobile splits the two calls into their own screen (delete-account-code.tsx);
    // web keeps both inline in the same dialog. Checked as whichever source
    // each client actually calls them from, not assumed to be the same file.
    const mobileClient = mobile + mobileCodeScreen;
    for (const client of [web, mobileClient]) {
      expect(client).toContain("/auth/delete-account/request-code");
      expect(client).toContain("/auth/delete-account/confirm");
      // The old single-step route must actually be gone from both clients,
      // not just superseded - it scheduled deletion immediately.
      expect(client).not.toMatch(/["']\/api\/auth\/delete-account["'],\s*\{\s*method:\s*["']POST["']/);
    }
  });

  it("tells the member up front that a code is coming, not that they are already signed out", () => {
    const codeIsComing = "confirm with a code sent to your email";
    expect(web).toContain(codeIsComing);
    expect(mobile).toContain(codeIsComing);
  });
});

describe("both clients state what actually happens", () => {
  it.each([
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

  it("both the web dialog and the mobile screen name the 6-digit code", () => {
    expect(web).toContain("6-digit code");
    expect(mobileCodeScreen).toContain("6-digit code");
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
