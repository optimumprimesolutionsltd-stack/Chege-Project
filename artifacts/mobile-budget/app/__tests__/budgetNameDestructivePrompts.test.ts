import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const addExpense = readFileSync('app/add-expense.tsx', 'utf8');
const history = readFileSync('app/(tabs)/history.tsx', 'utf8');
const budget = readFileSync('app/(tabs)/budget.tsx', 'utf8');
const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
const goals = readFileSync('app/(tabs)/goals.tsx', 'utf8');
const settings = readFileSync('app/(tabs)/settings.tsx', 'utf8');

describe('mobile destructive budget prompts', () => {
  it('names the active budget when removing expenses, contributions, sources, and categories', () => {
    expect(addExpense).toContain('Remove "${editingExpense.description}" from "${workspaceBudgetName(group)}"?');
    expect(history).toContain('Delete "${exp.description}" from "${workspaceBudgetName(group)}"?');
    expect(history).toContain('from ${contribution.userName} in "${workspaceBudgetName(group)}"?');
    expect(budget).toContain('Remove "${source.name}" from "${workspaceBudgetName(group)}"?');
    expect(budget).toContain('Remove "${cat.name}" from "${workspaceBudgetName(group)}"?');
    expect(bank).toContain('Remove "${account?.name ?? \'this account\'}" from "${budgetName}"?');
    expect(bank).toContain('Delete "${tx.description}" from "${budgetName}"?');
  });

  it('names the active budget in goal and membership destructive prompts and authorization', () => {
    expect(goals).toContain('delete this shared savings goal from "${workspaceBudgetName(group)}".');
    expect(goals).toContain('Delete "${goal.name}" from "${workspaceBudgetName(group)}"?');
    expect(goals).toContain('in "${workspaceBudgetName(group)}"? The goal balance will be recalculated.');
    expect(settings).toContain('Remove ${member.userName ?? \'this person\'} from "${workspaceBudgetName(group)}"?');
    expect(settings).toContain('`Leave "${workspaceBudgetName(group)}"?`');
    expect(settings).toContain('Only owners and admins can remove members from "${workspaceBudgetName(group)}".');
    expect(bank).toContain('delete a shared bank transaction from "${budgetName}".');
  });
});