import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planChoiceExempt, planChoiceKey, readPlanChoice, recordPlanChoice, shouldShowPlanChoice } from "./plan-choice";
import type { MemberEntitlements } from "./subscription-status";

const ent = (over: Partial<MemberEntitlements>): MemberEntitlements => ({
  packageCode: null, packageName: "Jamvi", fullAccess: true, status: "trial",
  billingInterval: null, trialEndsAt: null, currentPeriodEnd: null, ...over,
});

const memory = () => {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
};

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("web plan choice matches mobile", () => {
  it("stops somebody on trial who has not chosen, and nobody else", () => {
    expect(shouldShowPlanChoice(ent({}), null)).toBe(true);
    expect(shouldShowPlanChoice(ent({}), "pay")).toBe(false);
    expect(shouldShowPlanChoice(ent({ status: "active" }), null)).toBe(false);
    expect(shouldShowPlanChoice(ent({ fullAccess: false, status: "expired" }), null)).toBe(false);
    expect(shouldShowPlanChoice(undefined, null)).toBe(false);
  });

  it("remembers the choice per account", () => {
    const storage = memory();
    expect(readPlanChoice("u1", storage)).toBeNull();
    recordPlanChoice("u1", "trial", storage);
    expect(readPlanChoice("u1", storage)).toBe("trial");
    expect(readPlanChoice("u2", storage)).toBeNull();
    expect(planChoiceKey("u1")).not.toBe(planChoiceKey("u2"));
  });

  it("never blocks the links people arrive by or the payment page", () => {
    expect(planChoiceExempt("/invite/abc")).toBe(true);
    expect(planChoiceExempt("/join/abc")).toBe(true);
    expect(planChoiceExempt("/subscription")).toBe(true);
    expect(planChoiceExempt("/")).toBe(false);
    expect(planChoiceExempt("/budget")).toBe(false);
  });

  it("wraps the authenticated app in the gate", () => {
    expect(read("../App.tsx")).toContain("<PlanChoiceGate>");
  });
});

describe("web shows the default group colour and viewers, like mobile", () => {
  it.each([
    ["../pages/my-groups.tsx"],
    ["../pages/dashboard.tsx"],
    ["../components/budget-chooser.tsx"],
    ["../components/workspace-switcher.tsx"],
  ])("%s does not paint a group's own accent colour", (file) => {
    const source = read(file);
    expect(source).toContain("DEFAULT_WORKSPACE_ACCENT");
    expect(source).not.toMatch(/(group\??|workspace|activeBrandedBudget)\.accentColor/);
  });

  it("labels a viewer in the member list and lets the select promote them", () => {
    const settings = read("../pages/settings.tsx");
    expect(settings).toContain('<option value="viewer" disabled>Viewer — read only</option>');
    expect(settings).toContain('"Viewer — read only"');
  });
});
