import AsyncStorage from '@react-native-async-storage/async-storage';
import { customFetch } from '@workspace/api-client-react';
import { namedPayeesKey } from './namedPayees';
import { otherBudgetRulesKey } from './otherBudgetRules';
import { ownerBusinessKey } from './ownerBusiness';
import { nicknameStorageKey } from './payeeNicknames';

/**
 * The rest of what a budget taught Jamvi - Named accounts, your business's
 * numbers, payees that are another budget's, nicknames - kept on the server
 * as one document each (api-server lib/budget-knowledge), this phone's copy
 * a cache under the same keys it always used. As lib/rulesStore does for the
 * payee rules: every save goes to both, and syncKnowledge brings the cache up
 * to date when Jamvi opens or the budget changes (hooks/useRulesSync).
 *
 * Each document is kept whole, so the newest save wins. A phone first meeting
 * a server that has nothing yet sends what it knew, so nothing is lost.
 */
export const KNOWLEDGE = {
  'named-payees': namedPayeesKey,
  'owner-business': ownerBusinessKey,
  'other-budget-rules': otherBudgetRulesKey,
  'payee-nicknames': nicknameStorageKey,
} as const;
export type KnowledgeKind = keyof typeof KNOWLEDGE;

const aheadKey = (groupId: number | string, kind: KnowledgeKind) => `jamvi:knowledge-ahead:${kind}:${groupId}`;

const parse = (raw: string | null): unknown => {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};
const isEmpty = (doc: unknown): boolean =>
  doc == null || (Array.isArray(doc) ? doc.length === 0 : typeof doc === 'object' && Object.keys(doc as object).length === 0);

async function put(kind: KnowledgeKind, doc: unknown): Promise<void> {
  await customFetch(`/api/knowledge/${kind}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc }),
  });
}

/** Keeps `doc` on the phone at once, and on the server. */
export async function saveKnowledge(groupId: number | string | undefined, kind: KnowledgeKind, doc: unknown): Promise<void> {
  if (groupId == null) return;
  await AsyncStorage.setItem(KNOWLEDGE[kind](groupId), JSON.stringify(doc)).catch(() => {});
  try {
    await put(kind, doc);
  } catch {
    // Offline, or a member who cannot change it: the next sync sends it.
    await AsyncStorage.setItem(aheadKey(groupId, kind), '1').catch(() => {});
  }
}

/**
 * What to keep for one document, given this phone's copy and the server's:
 * this phone's when it saved while the server could not hear, or the server
 * has none yet; else the server's.
 */
export function pickDoc(local: unknown, server: unknown, ahead: boolean): { doc: unknown; upload: boolean } {
  if (ahead && !isEmpty(local)) return { doc: local, upload: true };
  if (isEmpty(server) && !isEmpty(local)) return { doc: local, upload: true };
  return { doc: server ?? local, upload: false };
}

/** Brings every document's cache and the server together. False when the server cannot keep them yet. */
export async function syncKnowledge(groupId: number | string | undefined): Promise<boolean> {
  if (groupId == null) return false;
  const server = await customFetch<{ ready: boolean; docs: Partial<Record<KnowledgeKind, unknown>> }>('/api/knowledge').catch(() => null);
  if (!server?.ready) return false;
  for (const kind of Object.keys(KNOWLEDGE) as KnowledgeKind[]) {
    const key = KNOWLEDGE[kind](groupId);
    const [local, ahead] = await Promise.all([
      AsyncStorage.getItem(key).catch(() => null).then(parse),
      AsyncStorage.getItem(aheadKey(groupId, kind)).catch(() => null),
    ]);
    const { doc, upload } = pickDoc(local, server.docs?.[kind], ahead === '1');
    if (upload) {
      const sent = await put(kind, doc).then(() => true, () => false);
      if (sent) await AsyncStorage.removeItem(aheadKey(groupId, kind)).catch(() => {});
    }
    if (doc != null) await AsyncStorage.setItem(key, JSON.stringify(doc)).catch(() => {});
  }
  return true;
}
