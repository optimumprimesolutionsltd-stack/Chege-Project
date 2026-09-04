import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const layoutSource = readFileSync(
  fileURLToPath(new URL("./layout.tsx", import.meta.url)),
  "utf8",
);

describe("mobile navigation drawer", () => {
  it("keeps the complete drawer inside the dynamic viewport with its own scroll area", () => {
    expect(layoutSource).toContain("document.body.style.overflow = 'hidden';");
    expect(layoutSource).toContain(
      "isolate fixed inset-x-0 top-16 z-[70] flex h-[calc(100dvh-4rem)] flex-col overflow-hidden bg-sidebar md:hidden",
    );
    expect(layoutSource).toContain(
      "min-h-0 flex-1 overscroll-contain overflow-y-auto p-4 pb-6 space-y-2",
    );
    expect(layoutSource).toContain(
      "shrink-0 border-t border-sidebar-border bg-sidebar p-6",
    );
  });

  it("removes Quick log from the stacking order while the drawer is open", () => {
    expect(layoutSource).toContain("{!isMobileMenuOpen && (");
    expect(layoutSource).toContain(
      "aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}",
    );
    expect(layoutSource).toContain("aria-expanded={isMobileMenuOpen}");
  });

  it("gives the budget switcher a larger mobile touch target and closes the drawer before confirmation", () => {
    expect(layoutSource).toContain('variant="mobile"');
    expect(layoutSource).toContain("onWorkspaceSwitchRequested={() => setIsMobileMenuOpen(false)}");
    expect(layoutSource).toContain("Switch budget");
    expect(layoutSource).toContain("Choose Personal or Shared budget to change the money view.");
  });
});