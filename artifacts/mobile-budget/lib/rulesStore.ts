import AsyncStorage from '@react-native-async-storage/async-storage';
import { customFetch } from '@workspace/api-client-react';
import { parseStoredRules, rulesStorageKey, type PayeeRules } from './payeeLearning';

/**
 * Payee rules (lib/payeeLearning), kept on the server for each budget
 * (api-server lib/payee-rules) with this phone's copy as a cache.
 *
 * They lived on the phone alone: lost on a reinstall, never seen by the web or
 * the group's other admins - while teaching Jamvi once is meant to last (Teach
 * Jamvi, 10 Oct 2026). Screens still read the cache straight away; every save
 * goes to both, and syncRules brings the cache up to date when Jamvi opens or
 * the budget changes (hooks/useRulesSync).
 *
 * - The first sync on a phone adds whatever it already knew to the server
 *   (nobody loses what they taught before), the server winning a clash.
 * - After that the server is the truth, so a rule forgotten on one phone is
 *   not brought back by another.
 * - A save that could not reach the server marks the cache as ahead: the next
 *   sync sends the whole of it.
 */

const syncedKey = (groupId: number | string) => `jamvi:payee-rules-synced:${groupId}`;
const aheadKey = (groupId: number | string) => `jamvi:payee-rules-ahead:${groupId}`;

/** What changed between two sets of rules: keys set to a new value, and keys gone. */
export function diffRules(before: PayeeRules, after: PayeeRules): { set: PayeeRules; remove: string[] } {
  const set: PayeeRules = {};
  for (const [key, value] of Object.entries(after)) if (before[key] !== value) set[key] = value;
  const remove = Object.keys(before).filter((key) => !(key in after));
  return { set, remove };
}

/** A phone's first sync: everything both know, the server's answer kept where they differ. */
export function firstSync(local: PayeeRules, server: PayeeRules): { merged: PayeeRules; upload: PayeeRules } {
  const upload: PayeeRules = {};
  for (const [key, value] of Object.entries(local)) if (!(key in server)) upload[key] = value;
  return { merged: { ...local, ...server }, upload };
}

export async function readRules(groupId: number | string | undefined): Promise<PayeeRules> {
  return parseStoredRules(await AsyncStorage.getItem(rulesStorageKey(groupId)).catch(() => null));
}

/**
 * Keeps `next` as the budget's rules: on the phone at once, and on the server.
 * `before` is what the screen last had; read from the cache when left out.
 */
export async function saveRules(groupId: number | string | undefined, next: PayeeRules, before?: PayeeRules): Promise<void> {
  if (groupId == null) return;
  const previous = before ?? (await readRules(groupId));
  await AsyncStorage.setItem(rulesStorageKey(groupId), JSON.stringify(next)).catch(() => {});
  const { set, remove } = diffRules(previous, next);
  if (Object.keys(set).length === 0 && remove.length === 0) return;
  try {
    await customFetch('/api/payee-rules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ set, remove }),
    });
  } catch {
    // Offline, or a member who cannot change them: the next sync sends the lot.
    await AsyncStorage.setItem(aheadKey(groupId), '1').catch(() => {});
  }
}

/** Brings this phone's copy and the server's together. Null when the server cannot keep them yet. */
export async function syncRules(groupId: number | string | undefined): Promise<PayeeRules | null> {
  if (groupId == null) return null;
  const server = await customFetch<{ ready: boolean; rules: PayeeRules }>('/api/payee-rules').catch(() => null);
  if (!server?.ready) return null;
  const local = await readRules(groupId);
  const [synced, ahead] = await Promise.all([
    AsyncStorage.getItem(syncedKey(groupId)).catch(() => null),
    AsyncStorage.getItem(aheadKey(groupId)).catch(() => null),
  ]);
  let rules: PayeeRules = server.rules ?? {};
  try {
    if (ahead === '1') {
      // Saved here while the server could not hear it: this phone's copy is newer.
      rules = (await customFetch<{ rules: PayeeRules }>('/api/payee-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: local }),
      })).rules;
      await AsyncStorage.removeItem(aheadKey(groupId)).catch(() => {});
    } else if (synced !== '1') {
      const { merged, upload } = firstSync(local, rules);
      rules = merged;
      if (Object.keys(upload).length > 0) {
        await customFetch('/api/payee-rules', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ set: upload, remove: [] }),
        });
      }
    }
    await AsyncStorage.setItem(syncedKey(groupId), '1').catch(() => {});
  } catch {
    // A member cannot write: they still read the budget's rules. An admin offline tries again next time.
    if (synced !== '1') rules = { ...local, ...rules };
  }
  await AsyncStorage.setItem(rulesStorageKey(groupId), JSON.stringify(rules)).catch(() => {});
  return rules;
}
