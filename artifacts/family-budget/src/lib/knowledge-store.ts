/**
 * What a budget taught Jamvi beyond the payee rules - payees that are another
 * budget's, nicknames - on the server (api-server lib/budget-knowledge), so the
 * web and the phone share them (mobile lib/knowledgeStore). This browser's copy
 * stays a cache under its old key.
 */
export type KnowledgeKind = "other-budget-rules" | "payee-nicknames";

/** The budget's documents, or null when the server cannot keep them yet. */
export async function loadKnowledge(): Promise<Partial<Record<KnowledgeKind, unknown>> | null> {
  const response = await fetch("/api/knowledge", { credentials: "include" }).catch(() => null);
  if (!response?.ok) return null;
  const body = (await response.json()) as { ready?: boolean; docs?: Partial<Record<KnowledgeKind, unknown>> };
  return body.ready ? body.docs ?? {} : null;
}

export async function saveKnowledge(kind: KnowledgeKind, doc: unknown): Promise<void> {
  await fetch(`/api/knowledge/${kind}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc }),
  }).catch(() => null);
}

const isEmpty = (doc: unknown): boolean => doc == null || (typeof doc === "object" && Object.keys(doc as object).length === 0);

/**
 * The server's copy when it has one; else this browser's, sent up so nothing
 * it knew is lost.
 */
export function pickDoc<T>(local: T, server: unknown): { doc: T; upload: boolean } {
  if (!isEmpty(server)) return { doc: server as T, upload: false };
  return { doc: local, upload: !isEmpty(local) };
}
