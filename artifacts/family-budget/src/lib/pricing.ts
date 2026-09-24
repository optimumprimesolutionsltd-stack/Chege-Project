export type Prices = { monthly: number; annual: number };

/** Shown until the server's answer arrives, and if it never does, so a price
 *  is never blank. The server's own numbers (@workspace/jamvi-pricing) win
 *  the moment they load. */
export const FALLBACK_PRICES: Prices = { monthly: 100, annual: 1000 };

/** The paid package's prices out of GET /api/subscription-plans. */
export function pricesFromPackages(packages: unknown): Prices {
  if (Array.isArray(packages)) {
    for (const item of packages) {
      const monthly = (item as { monthlyPriceKes?: unknown })?.monthlyPriceKes;
      const annual = (item as { annualPriceKes?: unknown })?.annualPriceKes;
      if (typeof monthly === 'number' && monthly > 0 && typeof annual === 'number' && annual > 0) {
        return { monthly, annual };
      }
    }
  }
  return FALLBACK_PRICES;
}

export function kesLabel(amount: number): string {
  return `KES ${amount.toLocaleString('en-KE')}`;
}
