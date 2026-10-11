import { describe, expect, it } from 'vitest';
import { missingInJamvi, type RecordedRow, type StatementReading } from '../statementImport';

// The statement check offered "Use KES 18,483" for money back saved as a refund
// (a payment of minus its amount): applied, it would have made it a payment out (11 Oct 2026).
describe('money back saved as a refund matches its statement line', () => {
  it('is compared by size, not sign', () => {
    const reading = { lines: [{ index: 0, status: 'ready', reason: null, receipt: 'TI9REV0001', direction: 'in', type: 'reversal', amount: 18483, description: 'Money back: a reversed payment', named: false, date: '2026-09-19', fee: null, mpesaBalance: null, alreadyRecorded: null }] } as unknown as StatementReading;
    const rows: RecordedRow[] = [{ id: 1, date: '2026-09-19', type: 'disbursement', amount: -18483, description: 'Money back: a reversed payment', mpesaReceipt: 'TI9REV0001' }];
    expect(missingInJamvi(reading, rows).amounts).toEqual([]);
    // A real difference is still said.
    const wrong: RecordedRow[] = [{ ...rows[0], amount: -1000 }];
    expect(missingInJamvi(reading, wrong).amounts).toHaveLength(1);
  });
});

// "That place should only have what needs to be sorted only" (11 Oct 2026).
describe('the review shows only what needs the person', () => {
  it('folds payments already in Jamvi and messages it does not save into one line', async () => {
    const { readFileSync } = await import('node:fs');
    const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(screen).toContain('const [showNotSaved, setShowNotSaved] = useState(false);');
    expect(screen).toContain('testID="mpesa-not-saved-toggle"');
    expect(screen).toContain("already in Jamvi or not saved{showNotSaved ? '' : ' - nothing to do. Show them'}");
  });
});
