import { describe, expect, it } from 'vitest';
import { checkRunningBalance, readStatementRows, resolveDirections, type StatementRow, type TextItem } from '@/lib/statementTable';

// A made-up statement page: receipt, time and details on the left, then three
// right-aligned number columns (paid in, withdrawn, balance).
const IN_EDGE = 418;
const OUT_EDGE = 487;
const BAL_EDGE = 557;
const amount = (str: string, edge: number, y: number): TextItem => ({ str, x: edge - str.length * 5, y, w: str.length * 5 });

function row(y: number, receipt: string, time: string, details: string[], cells: Array<['in' | 'out' | 'bal', string]>): TextItem[] {
  const items: TextItem[] = [
    { str: receipt, x: 40, y, w: 50 },
    { str: time, x: 108, y, w: 60 },
    { str: details[0], x: 177, y, w: 90 },
    { str: 'Completed', x: 282, y, w: 40 },
  ];
  details.slice(1).forEach((text, i) => items.push({ str: text, x: 177, y: y - 6 * (i + 1), w: 90 }));
  for (const [column, text] of cells) items.push(amount(text, column === 'in' ? IN_EDGE : column === 'out' ? OUT_EDGE : BAL_EDGE, y));
  return items;
}

// Newest first, like the real thing. A payment and its charge share a receipt.
function page(): TextItem[] {
  return [
    ...row(700, 'TEST000003', '2026-09-03 10:00:00', ['Customer Transfer to - 2547***000 SAMPLE PERSON'], [['out', '-500.00'], ['bal', '1,000.00']]),
    ...row(680, 'TEST000002', '2026-09-02 09:00:00', ['Customer Transfer of Funds Charge'], [['out', '-7.00'], ['bal', '1,500.00']]),
    ...row(660, 'TEST000002', '2026-09-02 09:00:00', ['Customer Transfer to - 2547***000', 'SAMPLE PERSON'], [['out', '-93.00'], ['bal', '1,507.00']]),
    ...row(640, 'TEST000001', '2026-09-01 08:00:00', ['Funds received from - 2547***000 SAMPLE PERSON'], [['in', '1,600.00'], ['bal', '1,600.00']]),
    // Filler rows so each column has enough figures to be recognised as a column.
    ...[0, 1, 2, 3, 4, 5].flatMap((k) =>
      row(620 - k * 20, `TEST0000F${k}`, `2026-08-${String(30 - k).padStart(2, '0')} 08:00:00`, ['Funds received from - 2547***000 SAMPLE PERSON'], [['in', '0.00'], ['out', '0.00'], ['bal', '0.00']]),
    ),
  ];
}

describe('readStatementRows', () => {
  const rows = readStatementRows([page()]);

  it('reads every row with its columns and joins wrapped details', () => {
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({ receipt: 'TEST000003', withdrawn: 500, paidIn: null, balance: 1000 });
    expect(rows[2].details).toBe('Customer Transfer to - 2547***000 SAMPLE PERSON');
    expect(rows[3]).toMatchObject({ paidIn: 1600, withdrawn: null });
  });

  it('decides money in or out by column, never by sign', () => {
    expect(rows[1]).toMatchObject({ withdrawn: 7, paidIn: null });
  });

  it('finds nothing in a page with no table', () => {
    expect(readStatementRows([[{ str: 'Hello', x: 1, y: 1, w: 20 }]])).toEqual([]);
  });
});

describe('checkRunningBalance', () => {
  it('passes a statement that adds up, with a payment and its charge grouped by receipt', () => {
    expect(checkRunningBalance(readStatementRows([page()]))).toMatchObject({ ok: true, failedAt: [] });
  });

  it('fails one where an amount was misread', () => {
    const rows = readStatementRows([page()]).map((r, i) => (i === 0 ? { ...r, withdrawn: 400 } : r));
    expect(checkRunningBalance(rows).ok).toBe(false);
  });
});

describe('resolveDirections', () => {
  const base: StatementRow = { receipt: 'TEST000009', time: '2026-09-01 08:00:00', details: '', status: 'Completed', paidIn: null, withdrawn: null, balance: 0 };

  it('puts a Fuliza payment and its loan draw the right way round when the columns are mirrored', () => {
    const [payment, draw, charge] = resolveDirections([
      { ...base, details: 'Merchant Payment Fuliza M-Pesa Online to 123456 - SAMPLE SHOP', paidIn: 825 },
      { ...base, details: 'OverDraft of Credit Party', withdrawn: 640.56 },
      { ...base, details: 'Pay Bill Charge', paidIn: 25 },
    ]);
    expect(payment).toMatchObject({ withdrawn: 825, paidIn: null });
    expect(draw).toMatchObject({ paidIn: 640.56, withdrawn: null });
    expect(charge).toMatchObject({ withdrawn: 25, paidIn: null });
  });

  it('keeps the column for wording it does not know', () => {
    const unknown = { ...base, details: 'Something New', paidIn: 5 };
    expect(resolveDirections([unknown])[0]).toEqual(unknown);
  });
});
