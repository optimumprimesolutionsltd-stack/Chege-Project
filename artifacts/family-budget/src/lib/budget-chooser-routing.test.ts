import { describe, expect, it } from "vitest";
import { hasFinishedOnboarding, shouldShowBudgetChooser } from "./budget-chooser-routing";

describe("budget chooser routing", () => {
  it.each(["/", "/expenses", "/budget", "/bank", "/reports", "/settings"])(
    "gates unfinished users before protected route %s",
    (pathname) => {
      expect(shouldShowBudgetChooser({ pathname, basePath: "/", completed: false })).toBe(true);
    },
  );

  it.each(["/invite/private-token", "/join/private-token"])(
    "keeps invitation route %s ahead of the chooser",
    (pathname) => {
      expect(shouldShowBudgetChooser({ pathname, basePath: "/", completed: false })).toBe(false);
    },
  );

  it("supports the artifact base path", () => {
    expect(shouldShowBudgetChooser({
      pathname: "/family-budget/expenses",
      basePath: "/family-budget/",
      completed: false,
    })).toBe(true);
  });

  it("allows every authenticated route after completion", () => {
    expect(shouldShowBudgetChooser({ pathname: "/expenses", basePath: "/", completed: true })).toBe(false);
  });

  it("returns shared-only users to the chooser when their active workspace is stale", () => {
    expect(shouldShowBudgetChooser({
      pathname: "/expenses",
      basePath: "/",
      completed: true,
      requiresSelection: true,
    })).toBe(true);
  });

  it("does not interrupt an invitation while a workspace selection is needed", () => {
    expect(shouldShowBudgetChooser({
      pathname: "/join/private-token",
      basePath: "/",
      completed: true,
      requiresSelection: true,
    })).toBe(false);
  });

  it("does not mistake an existing budget for finished onboarding when setup is incomplete", () => {
    expect(hasFinishedOnboarding({
      serverCompleted: false,
      serverStarted: true,
      localCompleted: false,
      hasExistingBudget: true,
      hasSavedDraft: false,
    })).toBe(false);
    expect(hasFinishedOnboarding({
      serverCompleted: false,
      serverStarted: false,
      localCompleted: false,
      hasExistingBudget: true,
      hasSavedDraft: true,
    })).toBe(false);
  });

  it("preserves the legacy existing-budget completion fallback when no setup was started", () => {
    expect(hasFinishedOnboarding({
      serverCompleted: false,
      serverStarted: false,
      localCompleted: false,
      hasExistingBudget: true,
      hasSavedDraft: false,
    })).toBe(true);
  });
});