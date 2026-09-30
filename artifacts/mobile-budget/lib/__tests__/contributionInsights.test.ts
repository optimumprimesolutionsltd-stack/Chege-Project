import { describe, expect, it } from 'vitest';
import { breakdownEntries, contributionsByDay, sourceParts, targetProgress, versusLastMonth } from '@/lib/contributionInsights';

describe('what the Contributions view says', () => {
  it('measures a member against the target', () => {
    expect(targetProgress(30000, 50000)).toMatchObject({ share: 0.6, met: false, label: 'KES 20,000 to go of KES 50,000' });
    expect(targetProgress(55000, 50000)).toMatchObject({ share: 1, met: true, label: 'Target met · KES 5,000 over' });
    expect(targetProgress(100, null)).toBeNull();
    expect(targetProgress(100, 0)).toBeNull();
  });

  it('compares the month with the one before', () => {
    expect(versusLastMonth(562555, 522555, 'Aug')).toEqual({ up: true, text: '▲ KES 40,000 more than Aug' });
    expect(versusLastMonth(1000, 3000, 'Aug')).toEqual({ up: false, text: '▼ KES 2,000 less than Aug' });
    expect(versusLastMonth(0, 0, 'Aug')).toBeNull();
    expect(versusLastMonth(10, undefined, 'Aug')).toBeNull();
  });

  it('lists where money came from, biggest first, without the empty ones', () => {
    expect(sourceParts({ deposits: 500, expenses: 900, savings: 0, grand: 1400 })).toEqual([
      { label: 'Paid for expenses', amount: 900 },
      { label: 'Money in', amount: 500 },
    ]);
  });

  it('merges a member\'s entries newest first', () => {
    const entries = breakdownEntries({
      deposits: [{ id: 1, description: 'Salary', amount: 100, date: '2026-09-02' }],
      expenses: [{ id: 2, description: null, category: 'Food', amount: 50, date: '2026-09-05' }],
      savingsContributions: [{ id: 3, goalName: 'School', amount: 20, date: '2026-09-01' }],
      totals: { deposits: 100, expenses: 50, savings: 20, grand: 170 },
    });
    expect(entries.map((e) => [e.label, e.kind])).toEqual([['Food', 'Paid for'], ['Salary', 'Money in'], ['School', 'Saved to']]);
  });

  it('puts standalone contributions under a heading per day with its total', () => {
    const rows = contributionsByDay([
      { id: 1, amount: 100, createdAt: '2026-09-01T08:00:00Z' },
      { id: 2, amount: 50, createdAt: '2026-09-03T09:00:00Z' },
      { id: 3, amount: 25, createdAt: '2026-09-03T07:00:00Z' },
    ]);
    expect(rows.map((r) => (r.kind === 'day' ? `${r.day}:${r.count}:${r.total}` : r.item.id))).toEqual(['2026-09-03:2:75', 2, 3, '2026-09-01:1:100', 1]);
  });
});
