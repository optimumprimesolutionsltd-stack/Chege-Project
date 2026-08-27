import { describe, expect, it } from "vitest";
import { shouldShowBudgetChooser } from "./budget-chooser-routing";

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
});