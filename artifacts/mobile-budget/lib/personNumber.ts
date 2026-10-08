/**
 * A person told apart by their number, not only their name.
 *
 * "A person is remembered by name, not by phone number. Two different people
 * with exactly the same name would be treated as one - this is not good"
 * (8 Oct 2026). M-Pesa shows the other side's number on every person-to-person
 * entry - in full or with its middle hidden ("0722***443", "2547***443") - so
 * the import keeps a short tag of it on the entry: "John Kamau · 07…443". The
 * tag is the same however the number was written, from a message or a
 * statement, and holds no more of the number than M-Pesa itself shows.
 *
 * Everything that recognises a person by name - kept rules, how they were
 * filed before, Named accounts, "the payee's other entries" - reads the tag
 * too, so two John Kamaus are two people. An entry with no tag (typed by hand,
 * or imported before this) still matches by name, as it always did.
 *
 * Kept in step with api-server lib/mpesa-parser/person-number.
 */

const SEPARATOR = ' · ';
const TAG = /\s·\s(0\d…\d{3})$/u;

/** "07…443" from any way M-Pesa writes a Kenyan number, or null. */
export function personTagOf(number: string | null | undefined): string | null {
  if (!number) return null;
  // Masked digits come as *, + or x; a leading + is the country code's.
  const compact = number.trim().replace(/^\+/, '').replace(/[\s-]/g, '').replace(/[*x+]/gi, '*');
  const match = compact.match(/^(?:254|0)([17])[\d*]*?(\d{3})$/);
  if (!match || !/[\d*]{6,}/.test(compact)) return null;
  return `0${match[1]}…${match[2]}`;
}

/** The number in a statement row or message: the first thing that looks like a Kenyan phone, masked or not. */
export function phoneIn(text: string | null | undefined): string | null {
  if (!text) return null;
  return text.match(/(?:\+?254|\b0)[17][\d*x+]{2,}\d{3}\b/i)?.[0] ?? null;
}

/** The description with the person's tag after the name. */
export function withPersonTag(description: string, tag: string | null): string {
  if (!tag || TAG.test(description)) return description;
  return `${description}${SEPARATOR}${tag}`;
}

/** The tag on a description, or null. */
export function tagOf(description: string | null | undefined): string | null {
  return description?.match(TAG)?.[1] ?? null;
}

/** The description without its tag: what an untagged entry for the same name reads. */
export function withoutPersonTag(description: string): string {
  return description.replace(TAG, '');
}
