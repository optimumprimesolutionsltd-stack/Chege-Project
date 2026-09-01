import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("./dashboard.tsx", import.meta.url), "utf8");

describe("Shared budget dashboard shortcuts", () => {
  it("does not render the redundant Group overview shortcut grid", () => {
    expect(dashboardSource).not.toContain("group-overview-shortcuts-heading");
    expect(dashboardSource).not.toContain("SHARED_OVERVIEW_SHORTCUTS");
    expect(dashboardSource).not.toContain('aria-label="Group overview shortcuts"');
  });

  it("keeps the main Quick Actions area available", () => {
    expect(dashboardSource).toContain('id="dashboard-quick-actions"');
  });
});