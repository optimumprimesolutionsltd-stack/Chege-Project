import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { earnsChoices, earnsHint, earnsLabel, earnsOf, earnsWord, salesRowHeading, sameEarns } from '../businessEarns';

const root = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const ujenzi = { id: 1, name: 'Ujenzi', earnsFrom: 'sales' };
const dahanak = { id: 2, name: 'Dahanak ventures', earnsFrom: 'rent' };
const agent = { id: 3, name: 'Kiosk', earnsFrom: 'M-Pesa agency' };
const fees = { id: 4, name: 'Optimum', earnsFrom: 'consulting fees' };

// "why not change the name from dahanak sales to rental income" / "we need to
// have an option to add more..not just sales and rent..also rent should not
// appear everywhere ... only where its been selected" (17 Oct 2026).
describe('what a business earns from', () => {
  it('words each business by its own choice', () => {
    expect(earnsWord(dahanak)).toBe('rental income');
    expect(earnsLabel(dahanak)).toBe('Rental income');
    expect(earnsOf('Dahanak ventures', dahanak)).toBe("Dahanak ventures's rental income");
    expect(earnsWord(ujenzi)).toBe('sales');
    expect(earnsWord({ name: 'Never asked' })).toBe('sales');
    expect(earnsLabel(fees)).toBe('Consulting fees');
    expect(earnsWord(fees)).toBe('consulting fees');
    expect(earnsWord(agent)).toBe('M-Pesa agency');
    expect(earnsHint(fees)).toContain('its consulting fees');
  });

  it('offers Sales, Rent and every one of the person\'s own, once each', () => {
    expect(earnsChoices([ujenzi, dahanak, fees, { earnsFrom: 'Consulting Fees' }]).map((one) => one.label))
      .toEqual(['Sales', 'Rent', 'Consulting fees']);
    expect(sameEarns('Consulting Fees', 'consulting fees')).toBe(true);
  });

  it('never heads the whole row of businesses with one business\'s rent', () => {
    expect(salesRowHeading([ujenzi])).toBe('BUSINESS SALES FOR');
    expect(salesRowHeading([ujenzi, dahanak])).toBe('BUSINESS INCOME FOR');
    expect(salesRowHeading([dahanak])).toBe('BUSINESS INCOME FOR');
    const bank = read('app/(tabs)/bank.tsx');
    expect(bank).not.toContain('salesChipLabel');
    expect(bank).not.toContain('RENTAL INCOME FOR');
    // The chosen business, and only it, in its own words.
    expect(bank).toContain('`${businessNameOf(forBusinessId)} - its ${earnsWord(businessEarner(forBusinessId))}`');
  });

  it('is chosen in My businesses, with Other for the person\'s own words', () => {
    const screen = read('app/businesses.tsx');
    expect(screen).toContain('What does it earn from?');
    expect(screen).toContain('earnsChoices(businesses.list).map((answer) => {');
    expect(screen).toContain('testID={`business-earns-from-${business.id}-other-input`}');
    expect(screen).toContain('setEarns(business.id, otherText.trim())');
    expect(read('hooks/useBusinesses.ts')).toContain("body: JSON.stringify({ business: true, earnsFrom }),");
    expect(read('app/business.tsx')).toContain('row(earnsLabel(earnerOf(business.incomeSourceId)), business.sales)');
  });
});
