/**
 * What a business's money in is: sales, or rent - "why not change the name
 * from dahanak sales to rental income and make that logic available in the
 * app" (17 Oct 2026). Set per business in My businesses (api-server
 * business_streams.earns_from); it changes the words only - rent counts
 * exactly as sales do, in the Business report and out of personal income.
 */
export type EarnsFrom = 'sales' | 'rent';

export const EARNS_FROM_ANSWERS: ReadonlyArray<{ earnsFrom: EarnsFrom; label: string }> = [
  { earnsFrom: 'sales', label: 'Sales' },
  { earnsFrom: 'rent', label: 'Rent' },
];

/** Any business-like thing; one without earnsFrom earns from sales. */
type Earner = object | null | undefined;

const isRent = (business: Earner) => (business as { earnsFrom?: unknown } | null | undefined)?.earnsFrom === 'rent';

/** "sales" / "rental income", inside a sentence. */
export const earnsWord = (business: Earner): string => (isRent(business) ? 'rental income' : 'sales');

/** "Sales" / "Rental income", as a line's label. */
export const earnsLabel = (business: Earner): string => (isRent(business) ? 'Rental income' : 'Sales');

/** "Ujenzi's sales" / "Dahanak's rental income". */
export const earnsOf = (name: string, business: Earner): string => `${name}'s ${earnsWord(business)}`;

/** What choosing it means, under the choice in My businesses. */
export const earnsHint = (business: Earner): string => (isRent(business)
  ? 'Money in from tenants is its rental income. Repairs, rates and other costs come off it, the same as sales.'
  : 'Money in from customers is its sales.');

/** Money in's row of businesses: "BUSINESS SALES FOR", "RENTAL INCOME FOR", or both when they differ. */
export function salesRowHeading(businesses: ReadonlyArray<object>): string {
  const rent = businesses.filter(isRent).length;
  if (rent === 0) return 'BUSINESS SALES FOR';
  return rent === businesses.length ? 'RENTAL INCOME FOR' : 'SALES OR RENTAL INCOME FOR';
}

/** A chip in that row: the name, and "· rent" when the row has both kinds. */
export function salesChipLabel(business: { name: string }, row: ReadonlyArray<object>): string {
  const mixed = row.some(isRent) && !row.every(isRent);
  return mixed && isRent(business) ? `${business.name} · rent` : business.name;
}
