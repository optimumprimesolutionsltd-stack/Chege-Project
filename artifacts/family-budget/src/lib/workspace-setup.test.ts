import { describe, expect, it } from "vitest";
import { getFirstIncompleteSetupStep, getWorkspaceSetupSteps, getWorkspaceSetupStorageKey } from "./workspace-setup";

describe("workspace setup model", () => {
  it("requires a real category with a positive plan", () => {
    const steps = getWorkspaceSetupSteps({
      isShared: false,
      categories: [{ name: "Uncategorized", budgetAmount: 200 }, { name: "Food", budgetAmount: 0 }],
      incomeSources: [], bankAccounts: [], goals: [], memberCount: 1,
    });
    expect(steps[0].complete).toBe(false);
    expect(getFirstIncompleteSetupStep(steps)?.id).toBe("budget");
  });

  it("orders shared setup and derives each completion from records", () => {
    const steps = getWorkspaceSetupSteps({
      isShared: true,
      categories: [{ name: "Food", budgetAmount: 5000 }],
      incomeSources: [{}], bankAccounts: [{}], goals: [{}], memberCount: 2,
    });
    expect(steps.map((step) => step.id)).toEqual(["budget", "income", "bank", "goals", "invite"]);
    expect(getFirstIncompleteSetupStep(steps)).toBeNull();
  });

  it("scopes the collapsed preference to its workspace", () => {
    expect(getWorkspaceSetupStorageKey(12)).toBe("jamvi:workspace-setup-collapsed:12");
    expect(getWorkspaceSetupStorageKey(13)).not.toBe(getWorkspaceSetupStorageKey(12));
  });
});