import AsyncStorage from '@react-native-async-storage/async-storage';
import { customFetch } from '@workspace/api-client-react';
import { newMpesaSms } from './mpesaSms';

/**
 * The time of day on M-Pesa entries ("Can we have timestamps for the mpesa?",
 * 17 Oct 2026). Messages ("SJK3ABC123 Confirmed. ... on 17/10/26 at 3:42 PM")
 * and statement rows ("2026-10-17 15:42:10") both carry it; an entry keeps
 * only its day. Whenever Jamvi reads M-Pesa, the receipt -> time pairs go to
 * the server (api-server lib/mpesa-times), which puts the time on every entry
 * with that receipt - entries saved earlier too, and the ones saved next.
 */

export type ReceiptTime = { receipt: string; time: string };

const RECEIPT_START = /\b([A-Z0-9]{10})\s+Confirmed\b/g;
const AT_TIME = /\bon\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s+at\s+(\d{1,2}):(\d{2})\s*([AP]M)\b/i;
const STATEMENT_TIME = /^\d{4}-\d{2}-\d{2} (\d{2}:\d{2})/;

const two = (n: number) => String(n).padStart(2, '0');

/** "3:42 PM" -> "15:42"; null when it is not a time. */
export function twentyFourHour(hour: string, minute: string, half: string): string | null {
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isInteger(h) || h < 1 || h > 12 || !Number.isInteger(m) || m < 0 || m > 59) return null;
  const pm = half.toUpperCase() === 'PM';
  return `${two((h % 12) + (pm ? 12 : 0))}:${two(m)}`;
}

/**
 * Every receipt in M-Pesa messages - one each, or many pasted together - with
 * the time printed after it, before the next receipt starts.
 */
export function timesFromMessages(text: string | readonly string[]): ReceiptTime[] {
  const all = typeof text === 'string' ? text : text.join('\n\n');
  const starts = [...all.matchAll(RECEIPT_START)];
  const found: ReceiptTime[] = [];
  starts.forEach((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].index : all.length;
    const at = all.slice(start.index, end).match(AT_TIME);
    const time = at ? twentyFourHour(at[1], at[2], at[3]) : null;
    if (time) found.push({ receipt: start[1], time });
  });
  return found;
}

/** A statement's rows: each receipt with the time printed beside it. */
export function timesFromStatement(rows: ReadonlyArray<{ receipt: string; time: string }>): ReceiptTime[] {
  return rows.flatMap((row) => {
    const at = row.time.match(STATEMENT_TIME);
    return at && /^[A-Z0-9]{8,15}$/.test(row.receipt) ? [{ receipt: row.receipt, time: at[1] }] : [];
  });
}

/** Sent in a few calls at most; never in the way of reading or saving. */
export async function sendMpesaTimes(times: readonly ReceiptTime[]): Promise<void> {
  for (let at = 0; at < times.length; at += 2_000) {
    try {
      await customFetch('/api/mpesa/times', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ times: times.slice(at, at + 2_000) }),
      });
    } catch {
      return;
    }
  }
}

/** "15:42" -> "3:42 PM", as M-Pesa words it. */
export function shownTime(time: string | null | undefined): string | null {
  const at = time?.match(/^(\d{2}):(\d{2})$/);
  if (!at) return null;
  const h = Number(at[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${at[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

const filledKey = (groupId: number) => `jamvi:mpesa-times-filled:v1:${groupId}`;

/**
 * Times for entries saved before Jamvi kept them: the M-Pesa messages still on
 * this phone, read once per budget (only where Android already allows it -
 * never asked for here), their times sent by receipt. Marked done only once read.
 */
export async function backfillMpesaTimes(groupId: number | null | undefined): Promise<void> {
  if (groupId == null) return;
  try {
    if (await AsyncStorage.getItem(filledKey(groupId))) return;
    const all = await newMpesaSms(0);
    if (!all) return;
    await sendMpesaTimes(timesFromMessages(all.messages));
    await AsyncStorage.setItem(filledKey(groupId), new Date().toISOString());
  } catch {
    // A nicety: tried again next time Jamvi opens.
  }
}
