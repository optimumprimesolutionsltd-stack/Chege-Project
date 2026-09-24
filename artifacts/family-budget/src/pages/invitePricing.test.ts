import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const invitePage = readFileSync(new URL("./invite.tsx", import.meta.url), "utf8");
const joinPage = readFileSync(new URL("./join-group.tsx", import.meta.url), "utf8");

// Mobile's onboarding flow already says plainly, via TrialNote
// (budget-chooser.tsx), that Jamvi is a paid app on a free trial — but
// somebody joining an existing group through a shared link never sees that
// screen at all. These two pages are what a link actually lands on, and
// neither mentioned pricing, so a new member had no way to know Jamvi is
// paid until their trial ran out. Reported as: "no one one knows the app is
// paid for. the app should explicitly request user to sign up for trial or
// pay."
describe("a member joining through a link is told the app is paid, up front", () => {
  it("says so on the email-invitation accept page", () => {
    expect(invitePage).toContain("Free for your first 14 days");
    expect(invitePage).toContain("kesLabel(prices.monthly)}/month");
  });

  it("says so on the private-invite-link member branch, but not the free view-link branch", () => {
    const memberBranchStart = joinPage.indexOf("Shared group invitation");
    const viewBranch = joinPage.slice(joinPage.indexOf("View-only invitation"), memberBranchStart);
    const memberBranch = joinPage.slice(memberBranchStart);

    expect(memberBranch).toContain("Free for your first 14 days");
    expect(memberBranch).toContain("kesLabel(prices.monthly)}/month");
    // The view-only link is free by design (view-links.ts) — it must never
    // pick up a pricing note meant for people who can actually record.
    expect(viewBranch).not.toContain("Free for your first 14 days");
    expect(viewBranch).toContain("It is free");
  });
});
