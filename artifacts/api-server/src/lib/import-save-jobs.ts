import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { RouteRefusal, saveItem, SIGNED_OUT, type ItemResult, type JobItem, type RouteCall } from "./import-save-posting";

export type { ItemResult, JobItem } from "./import-save-posting";

/**
 * Saving an M-Pesa import on the server (migration 0054).
 *
 * The phone used to save a statement itself: one request per entry and one
 * more per M-Pesa charge, six at a time. A few hundred entries took minutes,
 * Jamvi had to stay open the whole time, and Android stopped it the moment
 * the app was closed. Now the phone works out every entry exactly as before
 * (lib/mpesaImport's buildPostings) and hands the whole list over in one
 * request; the server saves it and the phone only asks how far it has got.
 * Closing Jamvi no longer stops anything.
 *
 * Each entry still goes through the very routes the phone called - deposit,
 * disbursement, the transfers - as the person who started the save, in their
 * session and budget. So every rule, check and refusal is the same one, and
 * nothing here can do what that person could not have done themselves.
 *
 * A job lives in a table, not in memory: a restart (every deploy) leaves it
 * "running" with its lease run out, and whichever server is up takes it on
 * again, skipping what was already done. An entry cut off half way is refused
 * the second time as already recorded, so nothing is saved twice. The lease
 * also keeps two servers (the old and new one during a deploy) from working
 * through the same job at once.
 *
 * A side table like entries_to_sort: made after the server is listening,
 * never allowed to stop it, and the phone saves the old way until it exists.
 */

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A save route called over this server's own port, as the person: their
 * session and the budget named. Tried again through a moment of the server
 * not answering, like the phone did; a refusal is an answer and is not.
 */
export function loopbackCall(sessionId: string, base = `http://127.0.0.1:${process.env.PORT}`): RouteCall {
  return async (path, body, groupId) => {
    const delays = [1_000, 2_000, 4_000, 8_000];
    for (let attempt = 0; ; attempt += 1) {
      let status: number | undefined;
      let data: unknown = null;
      try {
        const response = await fetch(`${base}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionId}`,
            "x-jamvi-workspace": String(groupId),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45_000),
        });
        status = response.status;
        const text = await response.text();
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }
        if (response.ok) return (data ?? {}) as Record<string, unknown>;
      } catch {
        status = undefined;
      }
      const hiccup = status === undefined || status === 502 || status === 503 || status === 504;
      const tries = hiccup ? delays.length : status !== undefined && status >= 500 ? 2 : 0;
      if (attempt >= tries) throw new RouteRefusal(status ?? 503, data);
      await pause(delays[attempt]);
    }
  };
}

let ready = false;

export function importSaveJobsReady(): boolean {
  return ready;
}

export function setImportSaveJobsReadyForTests(value: boolean): void {
  ready = value;
}

/** How many entries of one job travel at once. */
export const JOB_CONCURRENCY = 4;
/** How long a server holds a job without saying it is still on it. */
const LEASE_SECONDS = 30;
/** Finished jobs are kept this long, for the phone to read how one went. */
const KEEP_DAYS = 7;

/** This server, as the holder of a job's lease. */
const ME = randomUUID();
const running = new Set<number>();

type JobRow = {
  id: number;
  group_id: number;
  session_id: string | null;
  mpesa_account_id: number;
  items: JobItem[];
  results: ItemResult[];
  started: number[];
};

const rowsOf = <T>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[]));

/** Takes the job if nobody holds it, or whoever did has stopped saying so. */
async function claim(jobId: number): Promise<JobRow | null> {
  const result = await db.execute(sql`
    UPDATE "import_save_jobs"
       SET "lease_owner" = ${ME}, "lease_until" = now() + make_interval(secs => ${LEASE_SECONDS}), "updated_at" = now()
     WHERE "id" = ${jobId} AND "status" = 'running'
       AND ("lease_until" IS NULL OR "lease_until" < now() OR "lease_owner" = ${ME})
     RETURNING "id", "group_id", "session_id", "mpesa_account_id", "items", "results", "started"`);
  return rowsOf<JobRow>(result)[0] ?? null;
}

/** Still on it: the lease carried on, without reading the job again. */
async function renew(jobId: number): Promise<boolean> {
  const result = await db.execute(sql`
    UPDATE "import_save_jobs"
       SET "lease_until" = now() + make_interval(secs => ${LEASE_SECONDS})
     WHERE "id" = ${jobId} AND "status" = 'running' AND "lease_owner" = ${ME}
     RETURNING "id"`);
  return rowsOf(result).length > 0;
}

/** Noted before an entry is sent, so a restart knows which it may have saved already. */
async function markStarted(jobId: number, key: number): Promise<void> {
  await db.execute(sql`
    UPDATE "import_save_jobs" SET "started" = "started" || ${JSON.stringify([key])}::jsonb
     WHERE "id" = ${jobId} AND "lease_owner" = ${ME}`);
}

/**
 * An entry this job had sent when the server stopped, refused now as already
 * recorded: it is this job's own, so it is reported saved with the entry it
 * made - and its M-Pesa charge, which may never have gone, is added when the
 * entry has none.
 */
async function recoverInterrupted(item: JobItem, call: RouteCall, groupId: number, mpesaAccountId: number): Promise<ItemResult | null> {
  const receipt = item.built.main?.mpesaReceipt;
  if (typeof receipt !== "string" || !receipt) return null;
  const inGroup = item.built.kind === "other-budget" ? Number(item.built.groupId) : groupId;
  const found = await db.execute(sql`
    SELECT "id" FROM "joint_account_transactions"
     WHERE "group_id" = ${inGroup} AND "mpesa_receipt" = ${receipt} AND "charge_for_transaction_id" IS NULL
     ORDER BY ("account_id" = ${mpesaAccountId}) DESC, "id" ASC
     LIMIT 1`);
  const id = rowsOf<{ id: number }>(found)[0]?.id;
  if (id === undefined) return null;
  if (item.built.kind === "other-budget") return { key: item.key, outcome: "saved", otherBudget: { groupId: inGroup, id } };
  if (!item.built.fee) return { key: item.key, outcome: "saved", id };
  const charged = await db.execute(sql`
    SELECT 1 FROM "joint_account_transactions" WHERE "charge_for_transaction_id" = ${id} LIMIT 1`);
  if (rowsOf(charged).length > 0) return { key: item.key, outcome: "saved", id };
  try {
    await call("/api/joint-account/disbursement", { ...item.built.fee, chargeForTransactionId: id }, groupId);
    return { key: item.key, outcome: "saved", id };
  } catch {
    return { key: item.key, outcome: "saved", id, feeFailed: true };
  }
}

async function record(jobId: number, result: ItemResult): Promise<boolean> {
  const updated = await db.execute(sql`
    UPDATE "import_save_jobs"
       SET "results" = "results" || ${JSON.stringify([result])}::jsonb, "done" = "done" + 1, "updated_at" = now()
     WHERE "id" = ${jobId} AND "lease_owner" = ${ME}
     RETURNING "id"`);
  return rowsOf(updated).length > 0;
}

/** Works through a job to the end, unless another server has taken it over. */
export async function runJob(jobId: number, callFor: (sessionId: string) => RouteCall = loopbackCall): Promise<void> {
  if (running.has(jobId)) return;
  running.add(jobId);
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    const job = await claim(jobId);
    if (!job) return;
    let mine = true;
    heartbeat = setInterval(() => {
      void renew(jobId).then((still) => { if (!still) mine = false; }).catch(() => {});
    }, 10_000);
    heartbeat.unref?.();

    const done = new Set(job.results.map((result) => result.key));
    const queue = job.items.filter((item) => !done.has(item.key));
    // Sent before the server stopped, with no answer kept: possibly saved already.
    const interrupted = new Set((job.started ?? []).filter((key) => !done.has(key)));
    let lapsed = job.results.some((result) => result.outcome === "lapsed");
    let signedOut = !job.session_id;
    const call = job.session_id ? callFor(job.session_id) : null;
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.max(1, Math.min(JOB_CONCURRENCY, queue.length)) }, async () => {
        while (mine && next < queue.length) {
          const item = queue[next];
          next += 1;
          let result: ItemResult;
          if (lapsed) {
            // The first refusal for a lapsed trial or subscription: the rest would be refused the same way.
            result = { key: item.key, outcome: "lapsed" };
          } else if (signedOut || !call) {
            result = { key: item.key, outcome: "failed", why: SIGNED_OUT };
          } else {
            await markStarted(jobId, item.key);
            result = await saveItem(item, call, job.group_id, job.mpesa_account_id);
            if (result.outcome === "repeat" && interrupted.has(item.key)) {
              result = (await recoverInterrupted(item, call, job.group_id, job.mpesa_account_id)) ?? result;
            }
            if (result.outcome === "lapsed") lapsed = true;
            // Signed out part way: the rest would be refused the same way, so they are not sent.
            if (result.outcome === "failed" && result.why === SIGNED_OUT) signedOut = true;
          }
          if (!(await record(jobId, result))) mine = false;
        }
      }),
    );
    if (!mine) return;
    await db.execute(sql`
      UPDATE "import_save_jobs"
         SET "status" = 'done', "finished_at" = now(), "updated_at" = now(), "session_id" = NULL, "lease_owner" = NULL, "lease_until" = NULL
       WHERE "id" = ${jobId} AND "lease_owner" = ${ME}`);
  } catch (err) {
    // Left running with its lease to run out: the next look takes it on again.
    logger.warn({ err, jobId }, "An import save job stopped part way; it is carried on shortly");
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    running.delete(jobId);
  }
}

/** Jobs a restart left part way, taken on again; old finished ones cleared away. */
export async function resumeImportSaveJobs(): Promise<void> {
  try {
    const result = await db.execute(sql`
      SELECT "id" FROM "import_save_jobs"
       WHERE "status" = 'running' AND ("lease_until" IS NULL OR "lease_until" < now())`);
    for (const row of rowsOf<{ id: number }>(result)) void runJob(row.id);
    await db.execute(sql`
      DELETE FROM "import_save_jobs"
       WHERE "status" = 'done' AND "finished_at" < now() - make_interval(days => ${KEEP_DAYS})`);
  } catch (err) {
    logger.warn({ err }, "Could not look for import save jobs to carry on");
  }
}

export async function ensureImportSaveJobs(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "import_save_jobs" (
        "id" serial PRIMARY KEY,
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "user_id" varchar NOT NULL,
        "session_id" text,
        "mpesa_account_id" integer NOT NULL,
        "status" text NOT NULL DEFAULT 'running',
        "items" jsonb NOT NULL,
        "results" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "started" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "total" integer NOT NULL,
        "done" integer NOT NULL DEFAULT 0,
        "lease_owner" text,
        "lease_until" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
        "finished_at" timestamp with time zone
      )`);
    await db.execute(sql`ALTER TABLE "import_save_jobs" ADD COLUMN IF NOT EXISTS "started" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "import_save_jobs_group_user_idx" ON "import_save_jobs" ("group_id", "user_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "import_save_jobs_running_idx" ON "import_save_jobs" ("status") WHERE "status" = 'running'`);
    ready = true;
    logger.info("Import save jobs are ready");
    void resumeImportSaveJobs();
    const look = setInterval(() => void resumeImportSaveJobs(), 15_000);
    look.unref?.();
  } catch (err) {
    logger.warn({ err }, "import_save_jobs is not available yet; imports save from the phone");
    const retry = setTimeout(() => void ensureImportSaveJobs(), 60_000);
    retry.unref?.();
  }
}

export type JobView = {
  id: number;
  status: "running" | "done";
  total: number;
  done: number;
  results?: ItemResult[];
};

export async function createJob(input: {
  groupId: number;
  userId: string;
  sessionId: string;
  mpesaAccountId: number;
  items: JobItem[];
}): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO "import_save_jobs" ("group_id", "user_id", "session_id", "mpesa_account_id", "items", "total")
    VALUES (${input.groupId}, ${input.userId}, ${input.sessionId}, ${input.mpesaAccountId}, ${JSON.stringify(input.items)}::jsonb, ${input.items.length})
    RETURNING "id"`);
  return rowsOf<{ id: number }>(result)[0].id;
}

/** A job of this person in this budget, with what each entry became once asked for. */
export async function readJob(groupId: number, userId: string, jobId: number | "current", withResults: boolean): Promise<JobView | null> {
  const which = jobId === "current" ? sql`TRUE` : sql`"id" = ${jobId}`;
  const result = await db.execute(sql`
    SELECT "id", "status", "total", "done"${withResults ? sql`, "results"` : sql``}
      FROM "import_save_jobs"
     WHERE "group_id" = ${groupId} AND "user_id" = ${userId} AND ${which}
     ORDER BY "id" DESC
     LIMIT 1`);
  const row = rowsOf<JobView>(result)[0];
  return row ? { ...row, total: Number(row.total), done: Number(row.done) } : null;
}
