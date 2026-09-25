/**
 * The "Import your M-Pesa" card on the dashboard stays until the person has used
 * the import or said not now. Remembered in this browser only.
 */
export const MPESA_CARD_KEY = "jamvi:mpesa-card";

export type MpesaCardState = "dismissed" | "done";

export const shouldShowMpesaCard = (stored: string | null | undefined): boolean => stored !== "dismissed" && stored !== "done";

export function readMpesaCard(): string | null {
  try {
    return window.localStorage.getItem(MPESA_CARD_KEY);
  } catch {
    return null;
  }
}

export function rememberMpesaCard(state: MpesaCardState): void {
  try {
    window.localStorage.setItem(MPESA_CARD_KEY, state);
  } catch {
    /* remembered only when storage allows */
  }
}
