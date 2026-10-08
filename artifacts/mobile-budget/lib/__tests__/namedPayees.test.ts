import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isNamedPayee, namedFor, namedKeyFor, parseNamedPayees, ruleKeysFor } from '@/lib/namedPayees';
import { referenceOf, ruleCategory } from '@/lib/payeeLearning';
import { namesBusiness } from '@/lib/ownerBusiness';

// "Is there a way of naming bank accounts that are frequently used and are not
// the user's and possibly assign them?" (8 Oct 2026)
describe('naming an outside account', () => {
  it('finds a saved paybill payment by its account, since the paybill is not kept', () => {
    expect(referenceOf('Kenya Commercial Bank (1234567)')).toBe('1234567');
    expect(isNamedPayee('Kenya Commercial Bank (1234567)', namedKeyFor('522522 1234567'))).toBe(true);
    expect(isNamedPayee('Kenya Commercial Bank (7654321)', namedKeyFor('522522 1234567'))).toBe(false);
    expect(isNamedPayee('Kenya Commercial Bank (1234567)', namedKeyFor('1234567'))).toBe(true);
  });

  it('finds a payee by name however M-Pesa wrote it', () => {
    expect(isNamedPayee('EAGLES AFRICAN DISHES LTD', namedKeyFor('Eagles African Dishes'))).toBe(true);
    expect(namedFor('Peter Mbugua', [{ key: namedKeyFor('peter mbugua'), name: 'Barber - Peter' }])?.name).toBe('Barber - Peter');
  });

  it('files its category for the next import: one KCB account, not every KCB payment', () => {
    expect(ruleKeysFor('#522522+1234567')).toEqual(['#ref:1234567']);
    expect(ruleKeysFor('#123456')).toEqual(['#123456', '#ref:123456']);
    const rules = { '#ref:1234567': 'Rent' };
    expect(ruleCategory('Kenya Commercial Bank (1234567)', rules)).toBe('Rent');
    expect(ruleCategory('Kenya Commercial Bank (7654321)', rules)).toBe('');
  });

  it('a business paybill + account finds saved payments by the account too', () => {
    expect(namesBusiness('Kenya Commercial Bank (1234567)', ['#522522+1234567'])).toBe(true);
  });

  it('reads back what was stored, and nothing from damage', () => {
    expect(parseNamedPayees('[{"key":"#ref","name":"Landlord","category":"Rent"},{"key":"","name":"x"}]')).toEqual([{ key: '#ref', name: 'Landlord', category: 'Rent' }]);
    expect(parseNamedPayees('nope')).toEqual([]);
  });

  it('is reached from Settings and from a payment on Bank, which shows the name', () => {
    expect(readFileSync('app/(tabs)/settings.tsx', 'utf8')).toContain("router.push('/named-accounts' as never)");
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain('testID="bank-name-payee"');
    expect(bank).toContain('const shownDescription = namedPayees.nameFor(item.description) ?? item.description;');
    const screen = readFileSync('app/named-accounts.tsx', 'utf8');
    expect(screen).toContain("{ text: 'Leave them', style: 'cancel' }");
  });
});
