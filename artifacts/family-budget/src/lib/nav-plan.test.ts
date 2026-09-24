import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readSimpleNav, SIMPLE_NAV_KEY, splitNav } from "./nav-plan";

const items = [
  "/", "/contributions", "/expenses", "/budget", "/activity", "/savings-goals", "/bank",
  "/parties", "/statement", "/pass-through", "/bank-day", "/reports", "/groups",
  "/subscription", "/search", "/settings",
].map((href) => ({ href }));

describe("splitNav", () => {
  it("keeps the whole menu when simple view is off", () => {
    const plan = splitNav(items, false, "/");
    expect(plan.main).toHaveLength(items.length);
    expect(plan.more).toHaveLength(0);
  });

  it("puts the everyday pages on show and folds the rest under More", () => {
    const plan = splitNav(items, true, "/");
    expect(plan.main.map((item) => item.href)).toEqual([
      "/", "/contributions", "/expenses", "/budget", "/activity", "/savings-goals", "/bank", "/subscription", "/settings",
    ]);
    expect(plan.more.map((item) => item.href)).toEqual([
      "/parties", "/statement", "/pass-through", "/bank-day", "/reports", "/groups", "/search",
    ]);
  });

  it("never hides Settings or the subscription, and loses nothing", () => {
    const plan = splitNav(items, true, "/");
    expect(plan.main.map((item) => item.href)).toEqual(expect.arrayContaining(["/settings", "/subscription"]));
    expect(plan.main.length + plan.more.length).toBe(items.length);
  });

  it("opens More by default when the current page lives inside it", () => {
    expect(splitNav(items, true, "/reports").moreOpenByDefault).toBe(true);
    expect(splitNav(items, true, "/expenses").moreOpenByDefault).toBe(false);
  });
});

describe("readSimpleNav", () => {
  const store = (value: string | null) => ({ getItem: () => value });
  it("is on unless switched off", () => {
    expect(readSimpleNav(store(null))).toBe(true);
    expect(readSimpleNav(store("on"))).toBe(true);
    expect(readSimpleNav(store("off"))).toBe(false);
    expect(readSimpleNav(undefined)).toBe(true);
  });
  it("uses the same key as the phone", () => {
    expect(SIMPLE_NAV_KEY).toBe("jamvi:simple-view");
  });
});

describe("the sidebar uses it, in the desktop list and the phone-width drawer", () => {
  const layout = readFileSync(fileURLToPath(new URL("../components/layout.tsx", import.meta.url)), "utf8").replace(/\r\n/g, "\n");
  it("renders both lists from one renderer", () => {
    expect(layout).toContain("{renderNav('desktop')}");
    expect(layout).toContain("{renderNav('mobile')}");
  });
  it("offers More and a way to show every item", () => {
    expect(layout).toContain("data-testid={`nav-more-${variant}`}");
    expect(layout).toContain("'Show every menu item' : 'Show fewer menu items'");
  });
});
