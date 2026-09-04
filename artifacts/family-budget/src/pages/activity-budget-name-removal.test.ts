import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/activity.tsx", "utf8");

describe("Activity removal budget context", () => {
  it("names the active budget before removing a source record", () => {
    expect(source).toContain('const budgetName = group?.isPrivate ? "Personal budget" : group ? workspaceLabel(group) : "Shared budget";');
    expect(source).toContain('`${record.removeLabel} from "${budgetName}"?');
    expect(source).toContain('activity in "${budgetName}". This cannot be undone.');
  });
});