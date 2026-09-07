/**
 * The setup card has to say which budget it is setting up.
 *
 * Switching between a Personal and a Shared budget left this card reading
 * identically either way - "Set up this budget", same steps, same progress
 * bar - so the screen a new member spends most of their time on was the one
 * that never told them which budget they were looking at.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const guide = readFileSync(
  fileURLToPath(new URL("./workspace-setup-guide.tsx", import.meta.url)),
  "utf8",
);
const dashboard = readFileSync(
  fileURLToPath(new URL("../pages/dashboard.tsx", import.meta.url)),
  "utf8",
);

describe("knowing which budget you are looking at", () => {
  it("names the budget rather than calling it 'this budget'", () => {
    expect(guide).toContain("Set up {group?.name?.trim()");
    expect(guide).not.toContain(">Set up this budget<");
  });

  it("says whether it is Shared or Personal", () => {
    expect(guide).toContain('{isShared ? "Shared" : "Personal"}');
  });

  it("falls back to something truthful when the name has not loaded", () => {
    // Never a blank heading, and never the wrong word for the kind.
    expect(guide).toContain('(isShared ? "this group" : "your budget")');
  });

  it("shows the Personal/Shared badge on a phone", () => {
    // It was `hidden ... sm:inline-flex`, so the one word naming the mode was
    // absent on the screen size nearly everybody uses.
    expect(dashboard).not.toContain(
      'className="hidden shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold sm:inline-flex"',
    );
    expect(dashboard).toContain(
      'className="inline-flex shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold"',
    );
  });
});
