/**
 * Your own business's accounts, and the money between you and it.
 *
 * "If the user has a business, we can specify business account numbers and
 * every time money comes in through that number..." (8 Oct 2026). Asked how it
 * should count, the answer was owner's drawings: money from the business is
 * your own money (not income), money into it is not spending, and no debt
 * builds up (api-server lib/owner-business).
 *
 * The business is known by what M-Pesa and the bank write for it: a till,
 * paybill, account or phone number, or its name. Kept on this device for the
 * budget, like the payee rules (payeeLearning). Entries that match are marked
 * on the server, which is what every figure reads; an entry the person says is
 * not business money is remembered here and never marked again ("unless
 * otherwise").
 */
import { payeeKey } from './payeeLearning';

export type OwnerBusiness = {
  /** What to call it: "From Optimum", "To Optimum". */
  name: string;
  /** "#<digits>" for a number, else a payee name as payeeKey writes it. */
  keys: string[];
  /** Entries the person said are not business money: never marked again. */
  skipped: number[];
};

export const EMPTY_BUSINESS: OwnerBusiness = { name: '', keys: [], skipped: [] };

export const ownerBusinessKey = (groupId: number | string | undefined): string => `jamvi:owner-business:${groupId ?? 'none'}`;

export function parseOwnerBusiness(raw: string | null | undefined): OwnerBusiness {
  if (!raw) return EMPTY_BUSINESS;
  try {
    const parsed = JSON.parse(raw) as Partial<OwnerBusiness> | null;
    if (!parsed || typeof parsed !== 'object') return EMPTY_BUSINESS;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      keys: Array.isArray(parsed.keys) ? parsed.keys.filter((key): key is string => typeof key === 'string' && key !== '') : [],
      skipped: Array.isArray(parsed.skipped) ? parsed.skipped.filter((id): id is number => typeof id === 'number') : [],
    };
  } catch {
    return EMPTY_BUSINESS;
  }
}

const digitsOf = (text: string) => text.replace(/\D/g, '');

/**
 * The key for what the person typed or what an entry says: a number of five
 * digits or more is kept as a number (spacing ignored - "806 38 76" is
 * "8063876"), anything else as a payee name.
 */
export function businessKeyFor(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  // A paybill and an account number together ("522522 1234567", "522522 acc
  // 1234567"): both must appear. A bank's paybill is shared by everyone who
  // pays that bank, so on its own it would catch every payment to the bank
  // ("a bank can have an account number and a paybill number", 8 Oct 2026).
  // Groups of five digits or more are separate numbers; shorter groups are one
  // number written in parts ("0712 345 678").
  const groups = trimmed.split(/\D+/).filter(Boolean);
  const onlyNumberWords = trimmed.replace(/\d+/g, ' ').replace(/\b(acc(ount)?|a\/c|no|number|paybill|till|and)\b/gi, ' ').replace(/[^a-z]/gi, '') === '';
  if (onlyNumberWords && groups.length >= 2 && groups.every((group) => group.length >= 5)) return `#${groups.join('+')}`;
  const digits = digitsOf(trimmed);
  if (digits.length >= 5 && /^[\d\s+()-]+$/.test(trimmed)) return `#${digits}`;
  return payeeKey(trimmed);
}

export const businessKeyLabel = (key: string): string => {
  if (!key.startsWith('#')) return key;
  const [first, ...rest] = key.slice(1).split('+');
  return rest.length === 0 ? `Number ${first}` : `Paybill ${first}, account ${rest.join(', ')}`;
};

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((word) => word.length > 1);

/** Whether an entry's description names the business by one of its keys. */
export function namesBusiness(description: string | null | undefined, keys: readonly string[]): boolean {
  if (!description || keys.length === 0) return false;
  const digits = digitsOf(description);
  const said = new Set(words(description));
  return keys.some((key) => {
    if (key.startsWith('#')) {
      const numbers = key.slice(1).split('+');
      return numbers.every((number) => number.length >= 4) && numbers.every((number) => digits.includes(number));
    }
    const name = words(key);
    return name.length > 0 && name.every((word) => said.has(word));
  });
}

type Row = {
  id: number;
  type: string;
  description?: string | null;
  bankTransferId?: number | string | null;
  savingsGoalId?: number | string | null;
  transferDirection?: string | null;
  chargeForTransactionId?: number | string | null;
  expenseId?: number | string | null;
  reversal?: unknown;
};

/** Entries that name the business and are not yet marked or set aside. */
export function businessMatches<T extends Row>(rows: readonly T[], business: OwnerBusiness, marked: ReadonlySet<number>): T[] {
  if (business.keys.length === 0) return [];
  const skipped = new Set(business.skipped);
  return rows.filter((row) =>
    (row.type === 'deposit' || row.type === 'disbursement') &&
    !marked.has(row.id) &&
    !skipped.has(row.id) &&
    row.bankTransferId == null &&
    row.savingsGoalId == null &&
    row.transferDirection == null &&
    row.chargeForTransactionId == null &&
    row.expenseId == null &&
    !row.reversal &&
    namesBusiness(row.description, business.keys));
}

export const withKey = (business: OwnerBusiness, key: string): OwnerBusiness =>
  key && !business.keys.includes(key) ? { ...business, keys: [...business.keys, key] } : business;

export const withoutKey = (business: OwnerBusiness, key: string): OwnerBusiness =>
  ({ ...business, keys: business.keys.filter((one) => one !== key) });

export const withSkipped = (business: OwnerBusiness, id: number): OwnerBusiness =>
  business.skipped.includes(id) ? business : { ...business, skipped: [...business.skipped, id] };

/** The Bank list's title for a marked entry. */
export function businessTitle(direction: 'in' | 'out', name: string): string {
  const who = name.trim() || 'my business';
  return direction === 'in' ? `From ${who}` : `To ${who}`;
}
