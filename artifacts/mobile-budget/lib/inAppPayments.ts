import * as Updates from 'expo-updates';
import { paymentsAllowedOn } from './playStore';

/** False in the Google Play build: no M-Pesa prompt, prices or Subscribe buttons (lib/playStore). */
export const IN_APP_PAYMENTS = paymentsAllowedOn(Updates.channel);
