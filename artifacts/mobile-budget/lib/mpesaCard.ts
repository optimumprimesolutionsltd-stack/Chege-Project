import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The "Import your M-Pesa" card on Home stays until the person has used the
 * import or said not now - in that workspace. It was once for the whole phone,
 * so using it in a shared group took it away from the Personal budget too.
 * Remembered on this phone only.
 */
export const MPESA_CARD_KEY = 'jamvi:mpesa-card';

export const mpesaCardKey = (groupId?: number | null): string => (groupId ? `${MPESA_CARD_KEY}:${groupId}` : MPESA_CARD_KEY);

export type MpesaCardState = 'dismissed' | 'done';

export const shouldShowMpesaCard = (stored: string | null | undefined): boolean => stored !== 'dismissed' && stored !== 'done';

export const rememberMpesaCard = (state: MpesaCardState, groupId?: number | null): Promise<void> =>
  AsyncStorage.setItem(mpesaCardKey(groupId), state).catch(() => {});
