import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The "Import your M-Pesa" card on Home stays until the person has used the
 * import or said not now. Remembered on this phone only.
 */
export const MPESA_CARD_KEY = 'jamvi:mpesa-card';

export type MpesaCardState = 'dismissed' | 'done';

export const shouldShowMpesaCard = (stored: string | null | undefined): boolean => stored !== 'dismissed' && stored !== 'done';

export const rememberMpesaCard = (state: MpesaCardState): Promise<void> =>
  AsyncStorage.setItem(MPESA_CARD_KEY, state).catch(() => {});
