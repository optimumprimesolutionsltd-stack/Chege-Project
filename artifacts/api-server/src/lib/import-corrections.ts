import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Where the M-Pesa reading files things wrongly: each line saved under another
 * category than the one Jamvi suggested ("how do i know this?", 16 Oct 2026).
 *
 * Kept with nothing that says whose it was - no person, budget, amount, date
 * or M-Pesa code - only the kind of line, the business it was paid to (a till,
 * paybill or bank; never a person's name, see mobile lib/mpesaImport
 * importCorrections), what Jamvi suggested and what the person chose. Read by
 * the weekly usage report (lib/usage-report).
 */

let ready = false;

export function importCorrectionsReady(): boolean {
  return ready;
}

export function setImportCorrectionsReadyForTests(value: boolean): void {
  ready = value;
}

export async function ensureImportCorrections(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "import_corrections" (
        "id" serial PRIMARY KEY,
        "direction" text NOT NULL,
        "line_type" text,
        "payee" text,
        "suggested" text NOT NULL,
        "chosen" text NOT NULL,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "import_corrections_created_idx" ON "import_corrections" ("created_at")`);
    ready = true;
    logger.info("Import corrections are ready");
  } catch (err) {
    logger.warn({ err }, "import_corrections is not available yet; corrections are not kept");
    const retry = setTimeout(() => void ensureImportCorrections(), 60_000);
    retry.unref?.();
  }
}

export type Correction = { direction: "in" | "out"; type: string | null; payee: string | null; suggested: string; chosen: string };

/** At most this many from one save: a whole year's statement, corrected line by line. */
export const MAX_CORRECTIONS = 500;

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed.slice(0, max) : null;
};

/** What the phone or web sent, kept only where it makes sense: anything else is dropped. */
export function cleanCorrections(input: unknown): Correction[] {
  if (!Array.isArray(input)) return [];
  const out: Correction[] = [];
  for (const row of input.slice(0, MAX_CORRECTIONS)) {
    if (!row || typeof row !== "object") continue;
    const value = row as Record<string, unknown>;
    const direction = value.direction === "in" || value.direction === "out" ? value.direction : null;
    const suggested = text(value.suggested, 80);
    const chosen = text(value.chosen, 80);
    if (!direction || !suggested || !chosen || suggested === chosen) continue;
    out.push({ direction, type: text(value.type, 40), payee: text(value.payee, 80), suggested, chosen });
  }
  return out;
}

export async function recordCorrections(rows: readonly Correction[]): Promise<number> {
  if (!ready || rows.length === 0) return 0;
  await db.execute(sql`
    INSERT INTO "import_corrections" ("direction", "line_type", "payee", "suggested", "chosen")
    VALUES ${sql.join(rows.map((row) => sql`(${row.direction}, ${row.type}, ${row.payee}, ${row.suggested}, ${row.chosen})`), sql`, `)}`);
  return rows.length;
}

/** The most-made corrections since a moment: what Jamvi suggested, what people chose, how often. */
export async function topCorrections(since: Date, limit = 15): Promise<Array<{ payee: string | null; suggested: string; chosen: string; times: number }>> {
  if (!ready) return [];
  const result = await db.execute(sql`
    SELECT "payee", "suggested", "chosen", count(*)::int AS "times"
    FROM "import_corrections"
    WHERE "created_at" >= ${since.toISOString()}
    GROUP BY "payee", "suggested", "chosen"
    ORDER BY count(*) DESC, "suggested"
    LIMIT ${limit}`);
  return (result.rows as Array<{ payee: string | null; suggested: string; chosen: string; times: number }>).map((row) => ({ ...row, times: Number(row.times) }));
}
