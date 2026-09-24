/**
 * An amount exactly as the bank holds it: whole shillings stay whole
 * ("60,778"), and anything with cents keeps them ("60,778.50").
 *
 * Rounding to whole shillings showed a 50-cent bank charge as 0 and made a
 * balance disagree with the statement it is checked against. The web's
 * formatKes follows the same rule.
 */
export function formatExact(value: number): string {
  return value.toLocaleString('en-KE', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
