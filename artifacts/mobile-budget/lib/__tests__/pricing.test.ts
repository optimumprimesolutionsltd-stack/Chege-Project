import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FALLBACK_PRICES, kesLabel, pricesFromPackages } from '../pricing';

describe('prices come from one place', () => {
  it('reads the paid package from the plans endpoint payload', () => {
    expect(pricesFromPackages([{ monthlyPriceKes: 0, annualPriceKes: 0 }, { monthlyPriceKes: 150, annualPriceKes: 1500 }]))
      .toEqual({ monthly: 150, annual: 1500 });
  });
  it('falls back to the launch price rather than showing nothing', () => {
    expect(pricesFromPackages(undefined)).toEqual(FALLBACK_PRICES);
    expect(pricesFromPackages([{ monthlyPriceKes: 'x' }])).toEqual(FALLBACK_PRICES);
  });
  it('formats with thousands separators', () => {
    expect(kesLabel(1000)).toBe('KES 1,000');
  });
  it.each(['app/plan-choice.tsx', 'app/budget-chooser.tsx', 'app/subscription.tsx'])(
    '%s has no typed-in price',
    (file) => {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/KES 100\b|KES 1,000\b|MONTHLY_KES|ANNUAL_KES/);
      expect(source).toContain('usePrices');
    },
  );
});
