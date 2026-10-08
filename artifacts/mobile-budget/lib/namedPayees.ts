/**
 * Names for the outside accounts you pay often.
 *
 * "Is there a way of naming bank accounts that are frequently used and are not
 * the user's, and possibly assign them?" (8 Oct 2026). KCB paybill 522522,
 * account 1234567 becomes "Landlord - Kamau": shown by that name on Bank, and,
 * when a category is given, filed there - on the next import through the
 * payee rules (payeeLearning), and for payments already saved when the person
 * says so.
 *
 * Saved payments carry what the import wrote: a paybill payment is the payee's
 * name with the account in brackets ("Kenya Commercial Bank (1234567)"), and
 * the paybill or till number is not kept. So a paybill-and-account name finds
 * saved payments by the account, and a till or paybill number on its own only
 * finds new ones as they are imported.
 */
import { businessKeyFor, businessKeyLabel } from './ownerBusiness';
import { referenceOf } from './payeeLearning';
import { samePayeeName } from './samePayee';

export type NamedPayee = {
  /** "#<number>", "#<paybill>+<account>", or a payee's name as payeeKey writes it. */
  key: string;
  name: string;
  /** Where its payments go; none to leave that as it is. */
  category?: string;
  /** The business (income stream) it is paid for: its category is that business's cost. */
  incomeSourceId?: number;
};

export const namedPayeesKey = (groupId: number | string | undefined): string => `jamvi:named-payees:${groupId ?? 'none'}`;

export function parseNamedPayees(raw: string | null | undefined): NamedPayee[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const one = item as Partial<NamedPayee> | null;
      if (!one || typeof one.key !== 'string' || !one.key || typeof one.name !== 'string' || !one.name.trim()) return [];
      return [{
        key: one.key,
        name: one.name.trim(),
        ...(typeof one.category === 'string' && one.category.trim() ? { category: one.category.trim() } : {}),
        ...(typeof one.incomeSourceId === 'number' ? { incomeSourceId: one.incomeSourceId } : {}),
      }];
    });
  } catch {
    return [];
  }
}

/** The key for what the person typed: numbers as numbers (a paybill and account together), anything else as a name. */
export const namedKeyFor = (text: string): string => businessKeyFor(text);

export const namedKeyLabel = (key: string): string => businessKeyLabel(key);

const digitsOf = (text: string) => text.replace(/\D/g, '');

/** Whether a saved payment's text is the named account. */
export function isNamedPayee(description: string | null | undefined, key: string): boolean {
  if (!description || !key) return false;
  if (key.startsWith('#')) {
    const numbers = key.slice(1).split('+');
    // Paybill and account: the account is what a saved payment keeps.
    const wanted = numbers.length > 1 ? numbers.slice(1) : numbers;
    const reference = referenceOf(description);
    const digits = digitsOf(description);
    return wanted.every((number) => number.length >= 4 && (reference === number || digits.includes(number)));
  }
  const name = samePayeeName(key);
  return name !== '' && samePayeeName(description) === name;
}

/** The name given to this payment's payee, if any. */
export function namedFor(description: string | null | undefined, named: readonly NamedPayee[]): NamedPayee | null {
  if (!description) return null;
  return named.find((one) => isNamedPayee(description, one.key)) ?? null;
}

/**
 * The payee-rule keys a named account files its category under, so the import
 * picks it up. A lone number may be a till or phone number (the import knows
 * those) or an account reference (what a saved paybill payment keeps), so it
 * is kept as both.
 */
export function ruleKeysFor(key: string): string[] {
  if (!key.startsWith('#')) return [key];
  const numbers = key.slice(1).split('+');
  const last = numbers[numbers.length - 1];
  return numbers.length > 1 ? [`#ref:${last}`] : [key, `#ref:${last}`];
}

export const withNamed = (named: readonly NamedPayee[], next: NamedPayee): NamedPayee[] =>
  [...named.filter((one) => one.key !== next.key), next];

export const withoutNamed = (named: readonly NamedPayee[], key: string): NamedPayee[] =>
  named.filter((one) => one.key !== key);
