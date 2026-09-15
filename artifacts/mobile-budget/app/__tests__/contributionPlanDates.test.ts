import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const plan = readFileSync('app/contribution-plan.tsx', 'utf8');

describe('Expected from each member', () => {
  // Tapping the row was enough to start editing what somebody owes, so one
  // stray touch could change it.
  it('opens editing only from the Edit control, not by tapping the figure', () => {
    expect(plan).toContain('<EditPill');
    expect(plan).toContain('testID={`contribution-plan-edit-${contributor.id}`}');
    // The amount itself is plain text now.
    expect(plan).toContain('<View style={styles.valueRow}>');
    expect(plan).not.toMatch(/<Pressable\s+onPress=\{\(\) => \{\s*setEditing\(contributor\.id\);/);
  });

  it('offers a way out of an edit without saving', () => {
    expect(plan).toContain('accessibilityLabel="Cancel this change"');
    expect(plan).toContain('setEditing(null); setDatePickerOpen(false);');
  });

  it('carries a start date, defaulting to the first of the month', () => {
    expect(plan).toContain('const [editFrom, setEditFrom] = useState<string>(monthStartIso);');
    expect(plan).toContain('setEditFrom(monthStartIso());');
    expect(plan).toContain('Applies from');
    expect(plan).toContain('testID={`contribution-plan-from-${contributor.id}`}');
  });

  it('sends the date so the server records a dated change', () => {
    expect(plan).toContain('JSON.stringify({ monthlyTarget: value, effectiveFrom: editFrom })');
  });

  it('says plainly that earlier months are left alone', () => {
    expect(plan).toContain('Months before this keep the amount they were measured against.');
  });

  it('refreshes the variance view, which is what the change actually moves', () => {
    expect(plan).toContain("queryKey: ['contribution-variance']");
  });
});
