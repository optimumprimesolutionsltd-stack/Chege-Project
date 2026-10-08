/**
 * A person told apart by their number, not only their name: "John Kamau ·
 * 07…443" (8 Oct 2026). The tag holds no more of the number than M-Pesa itself
 * shows, and is the same however the number was written. Read from the message
 * before it is normalised, which hides every phone number.
 *
 * Kept in step with mobile-budget lib/personNumber.
 */

/** "07…443" from any way M-Pesa writes a Kenyan number, or null. */
export function personTagOf(number: string | null | undefined): string | null {
  if (!number) return null;
  const compact = number.trim().replace(/^\+/, "").replace(/[\s-]/g, "").replace(/[*x+]/gi, "*");
  const match = compact.match(/^(?:254|0)([17])[\d*]*?(\d{3})$/);
  if (!match || !/[\d*]{6,}/.test(compact)) return null;
  return `0${match[1]}…${match[2]}`;
}

/** The first thing in the text that looks like a Kenyan phone, masked or not. */
export function phoneIn(text: string | null | undefined): string | null {
  if (!text) return null;
  return text.match(/(?:\+?254|\b0)[17][\d*x+]{2,}\d{3}\b/i)?.[0] ?? null;
}

/** The description with the person's tag after the name. */
export function withPersonTag(description: string, tag: string | null): string {
  if (!tag || /\s·\s0\d…\d{3}$/u.test(description)) return description;
  return `${description} · ${tag}`;
}
