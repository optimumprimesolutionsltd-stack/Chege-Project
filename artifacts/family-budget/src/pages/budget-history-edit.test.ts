import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./budget.tsx", import.meta.url), "utf8");

// "Add only this month option to the web budget page too" - as on the phone.
describe("changing a budget on the web Budget page", () => {
  it("starts the form from the budget the category had in the month on screen", () => {
    expect(page).toContain("const startAmount = initial && initial.isRecurring && !hasChildren && monthAmount != null ? monthAmount : initial?.budgetAmount;");
    expect(page).toContain("monthAmount={editTarget ? (breakdown ?? []).find(item => item.category === editTarget.name)?.budgetAmount ?? null : null}");
  });

  it("offers this month on (chosen first) or this month alone, saying earlier months keep theirs", () => {
    expect(page).toContain('const [reach, setReach] = useState<"from" | "only">("from");');
    expect(page).toContain("Months before ${monthLabel} keep the budget they had.");
    expect(page).toContain('["from", `From ${monthLabel} on`,');
    expect(page).toContain('["only", `Only ${monthLabel}`,');
  });

  it("sends the choice with the edit only when a regular budget's amount changes", () => {
    expect(page).toContain("const budgetChanges = Boolean(initial?.isRecurring && pendingChange?.isRecurring && !isGroup && startAmount != null && pendingChange.budgetAmount !== startAmount);");
    expect(page).toContain('const reachBody = budgetChanges ? (reach === "only" ? { onlyThisMonth: month } : { budgetFrom: month }) : {};');
    expect(page).toContain("...reachBody,");
  });
});
