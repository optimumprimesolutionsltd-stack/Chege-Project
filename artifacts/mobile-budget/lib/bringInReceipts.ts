import { receiptOf } from './mpesaLiveBalance';

/**
 * The payments "not in Jamvi yet" to bring in, by their M-Pesa code, handed from
 * Home or Find the difference to the import.
 *
 * The import used to read every message over the days the missing payments fall
 * in - for 755 missing over most of a year, thousands - and work through all of
 * them on the phone, which stopped it answering ("waiting for you does not open
 * to anything", 11 Oct 2026). With the codes it reads only those.
 */
let wanted: Set<string> | null = null;

export function setBringIn(receipts: readonly string[] | undefined | null): void {
  wanted = receipts && receipts.length > 0 ? new Set(receipts) : null;
}

/** The codes to bring in, once; null when none were handed over. */
export function takeBringIn(): Set<string> | null {
  const taken = wanted;
  wanted = null;
  return taken;
}

/** Only the messages for those codes - a Fuliza or charge notice sharing its payment's code comes too. */
export function onlyWanted(messages: readonly string[], codes: ReadonlySet<string> | null): string[] {
  if (!codes) return [...messages];
  return messages.filter((message) => {
    const code = receiptOf(message);
    return code !== null && codes.has(code);
  });
}
