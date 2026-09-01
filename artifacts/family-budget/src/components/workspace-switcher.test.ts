import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const switcherSource = readFileSync(new URL("./workspace-switcher.tsx", import.meta.url), "utf8");

describe("workspace switcher", () => {
  it("keeps the mobile selector and its confirmation above the navigation drawer", () => {
    expect(switcherSource).toContain('variant?: "sidebar" | "dashboard" | "mobile"');
    expect(switcherSource).toContain("isMobileVariant");
    expect(switcherSource).toContain("h-12 rounded-xl border-2");
    expect(switcherSource).toContain('className="z-[100] border-sidebar-border bg-popover text-popover-foreground"');
    expect(switcherSource).toContain('className="z-[100] w-[calc(100%-2rem)] rounded-2xl sm:w-full"');
  });

  it("lets the mobile shell close before the budget confirmation opens", () => {
    expect(switcherSource).toContain("onWorkspaceSwitchRequested?.();");
  });
});