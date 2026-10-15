import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { businessSuggestions } from '../businessSuggestions';

// "i thought be energy should auto populate itself" (15 Oct 2026).
describe('income streams offered as businesses on My businesses', () => {
  const businesses = [{ id: 1, name: 'Ujenzi Distributors Ltd' }, { id: 2, name: 'Generator Business' }];
  const streams = [
    { id: 2, name: 'Generator Business' },
    { id: 3, name: 'Be energy' },
    { id: 4, name: 'Side Hustle Income' },
    { id: 5, name: 'Ujenzi Distributors salary' },
    { id: 6, name: 'Salary or wages' },
    { id: 7, name: 'Family support or remittances' },
    { id: 8, name: 'Dahanak salary' },
    { id: 3, name: 'Be energy' },
  ];

  it('offers the streams that may be a business, once each', () => {
    expect(businessSuggestions(streams, businesses).map((one) => one.name)).toEqual(['Be energy', 'Side Hustle Income']);
  });

  it('makes one a business only on a tap, as the existing stream so its entries come with it', () => {
    const page = readFileSync('app/businesses.tsx', 'utf8');
    expect(page).toContain('businessSuggestions(streams, businesses.list)');
    expect(page).toContain('onPress={() => void makeBusiness(stream.id)}');
    expect(page).toContain('await businesses.setBusiness(id, true);');
  });
});
