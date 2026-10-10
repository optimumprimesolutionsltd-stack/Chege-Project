import { parseStoredRules, rulesStorageKey, type PayeeRules } from "@/lib/payee-learning";

/**
 * Payee rules on the server for each budget (api-server lib/payee-rules), this
 * browser's copy a cache - as the phone does (mobile lib/rulesStore). What the
 * phone was taught now files the web's imports too, and the other way round.
 *
 * The first sync in a browser adds what it already knew (the server winning a
 * clash); after that the server is the truth, so a rule forgotten elsewhere
 * does not come back from here.
 */
const syncedKey = (groupId: number | string) => `jamvi:payee-rules-synced:${groupId}`;

export function diffRules(before: PayeeRules, after: PayeeRules): { set: PayeeRules; remove: string[] } {
  const set: PayeeRules = {};
  for (const [key, value] of Object.entries(after)) if (before[key] !== value) set[key] = value;
  return { set, remove: Object.keys(before).filter((key) => !(key in after)) };
}

const local = {
  get: (key: string) => { try { return window.localStorage.getItem(key); } catch { return null; } },
  set: (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* kept only when storage allows */ } },
};

export function readCachedRules(groupId: number | string | undefined): PayeeRules {
  return parseStoredRules(local.get(rulesStorageKey(groupId)));
}

async function send(method: "PATCH" | "PUT", body: unknown): Promise<PayeeRules | null> {
  const response = await fetch("/api/payee-rules", {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!response?.ok) return null;
  return ((await response.json()) as { rules?: PayeeRules }).rules ?? null;
}

/** The budget's rules: the server's, with this browser's added the first time. Null keeps the cache. */
export async function syncRules(groupId: number | string | undefined): Promise<PayeeRules | null> {
  if (groupId == null) return null;
  const response = await fetch("/api/payee-rules", { credentials: "include" }).catch(() => null);
  if (!response?.ok) return null;
  const server = (await response.json()) as { ready?: boolean; rules?: PayeeRules };
  if (!server.ready) return null;
  let rules = server.rules ?? {};
  if (local.get(syncedKey(groupId)) !== "1") {
    const cached = readCachedRules(groupId);
    const upload = Object.fromEntries(Object.entries(cached).filter(([key]) => !(key in rules)));
    rules = { ...cached, ...rules };
    if (Object.keys(upload).length > 0) await send("PATCH", { set: upload, remove: [] });
    local.set(syncedKey(groupId), "1");
  }
  local.set(rulesStorageKey(groupId), JSON.stringify(rules));
  return rules;
}

/** Keeps `next` here at once and on the server. */
export async function saveRules(groupId: number | string | undefined, next: PayeeRules, before: PayeeRules): Promise<void> {
  if (groupId == null) return;
  local.set(rulesStorageKey(groupId), JSON.stringify(next));
  const { set, remove } = diffRules(before, next);
  if (Object.keys(set).length === 0 && remove.length === 0) return;
  await send("PATCH", { set, remove });
}
