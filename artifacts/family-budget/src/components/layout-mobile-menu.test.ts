import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const layoutSource = readFileSync(
  fileURLToPath(new URL("./layout.tsx", import.meta.url)),
  "utf8",
);

describe("mobile navigation drawer", () => {
  it("keeps the complete drawer inside the viewport with its own scroll area", () => {
    expect(layoutSource).toContain(
      "fixed inset-x-0 bottom-0 top-16 z-[60] flex flex-col overflow-hidden bg-sidebar",
    );
    expect(layoutSource).toContain(
      "min-h-0 flex-1 overflow-y-auto p-4 pb-6 space-y-2",
    );
    expect(layoutSource).toContain(
      "shrink-0 border-t border-sidebar-border bg-sidebar p-6",
    );
  });
});