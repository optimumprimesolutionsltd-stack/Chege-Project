/**
 * What a business's money in is: sales, rent, or the person's own words -
 * "why not change the name from dahanak sales to rental income and make that
 * logic available in the app", "we need to have an option to add more..not
 * just sales and rent" (17 Oct 2026). Set per business in My businesses
 * (api-server business_streams.earns_from); it changes the words only - it
 * counts exactly as sales do, in the Business report and out of personal income.
 *
 * Shown only for the business it was chosen for: "rent should not appear
 * everywhere ... only where its been selected". A list of businesses is
 * headed in words that fit them all.
 */
export type EarnsFrom = string;

/** The two offered by name; anything else is the person's own words. */
export const EARNS_FROM_ANSWERS: ReadonlyArray<{ earnsFrom: EarnsFrom; label: string }> = [
  { earnsFrom: 'sales', label: 'Sales' },
  { earnsFrom: 'rent', label: 'Rent' },
];

export const EARNS_FROM_MAX = 40;

/** Any business-like thing; one without earnsFrom earns from sales. */
type Earner = object | null | undefined;

const keyOf = (business: Earner): EarnsFrom => {
  const raw = (business as { earnsFrom?: unknown } | null | undefined)?.earnsFrom;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : 'sales';
};

const isSales = (business: Earner) => keyOf(business) === 'sales';

/** The business's own choice, sales when never answered. */
export const earnsKey = (business: Earner): EarnsFrom => keyOf(business);

/** "Sales" / "Rental income" / "Commission", as a line's label. */
export function earnsLabel(business: Earner): string {
  const key = keyOf(business);
  if (key === 'sales') return 'Sales';
  if (key === 'rent') return 'Rental income';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** "sales" / "rental income" / "commission", inside a sentence. Capitals kept for a name like "M-Pesa agency". */
export function earnsWord(business: Earner): string {
  const label = earnsLabel(business);
  return /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;
}

/** "Ujenzi's sales" / "Dahanak's rental income". */
export const earnsOf = (name: string, business: Earner): string => `${name}'s ${earnsWord(business)}`;

/** The same choice, whatever the capitals. */
export const sameEarns = (a: EarnsFrom, b: EarnsFrom): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The choices in My businesses: Sales, Rent, and every other one already used, once each. */
export function earnsChoices(businesses: ReadonlyArray<object>): Array<{ earnsFrom: EarnsFrom; label: string }> {
  const own = new Map<string, { earnsFrom: EarnsFrom; label: string }>();
  for (const business of businesses) {
    const key = keyOf(business);
    if (key === 'sales' || key === 'rent' || own.has(key.toLowerCase())) continue;
    own.set(key.toLowerCase(), { earnsFrom: key, label: earnsLabel(business) });
  }
  return [...EARNS_FROM_ANSWERS, ...own.values()];
}

/** What choosing it means, under the choice in My businesses. */
export function earnsHint(business: Earner): string {
  const key = keyOf(business);
  if (key === 'sales') return 'Money in from customers is its sales.';
  if (key === 'rent') return 'Money in from tenants is its rental income. Repairs, rates and other costs come off it, the same as sales.';
  return `Money in to it is its ${earnsWord(business)}. Its costs come off it, the same as sales.`;
}

/** Money in's row of businesses: their sales when every one sells, else words that fit them all. */
export function salesRowHeading(businesses: ReadonlyArray<object>): string {
  return businesses.every(isSales) ? 'BUSINESS SALES FOR' : 'BUSINESS INCOME FOR';
}
