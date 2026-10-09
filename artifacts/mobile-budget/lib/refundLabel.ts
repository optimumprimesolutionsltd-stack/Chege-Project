/**
 * A refund is a payment with a negative amount (api-server lib/refunds): money
 * back that takes spending off its category. Wherever a list shows spending,
 * it reads "Refund +300", not "−-300" (9 Oct 2026).
 */
export const isRefund = (amount: number | string | null | undefined): boolean => Number(amount) < 0;

const whole = (amount: number) => Math.abs(amount).toLocaleString('en-KE', { maximumFractionDigits: 0 });

/** A spending amount as a list shows it: "1,200", or "Refund +300". */
export function spentText(amount: number | string | null | undefined, prefix = ''): string {
  const value = Number(amount) || 0;
  return value < 0 ? `Refund +${prefix}${whole(value)}` : `${prefix}${whole(value)}`;
}
