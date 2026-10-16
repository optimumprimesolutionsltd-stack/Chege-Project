import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendEmail } from "./email";
import { NOT_SURE_CATEGORY } from "./entries-to-sort";
import { topCorrections } from "./import-corrections";

/**
 * The weekly usage report, emailed every Monday: "three months of real use
 * tells you which screens matter, where the M-Pesa reading files things
 * wrongly ... how do i know this?" (16 Oct 2026). Jamvi tracks nothing
 * about how it is used, so this reads only what every budget already holds -
 * who signed up, which budgets got entries, what came in from M-Pesa - and
 * the anonymous import corrections (lib/import-corrections). Counts only: no
 * names, amounts or entries leave the database.
 */
export type UsageReport = {
  weekStart: string;
  weekEnd: string;
  signups: number;
  people: number;
  activeBudgets: { personal: number; shared: number };
  /** Budgets made in the week four weeks before this one, and how many of them got an entry this week. */
  fourWeeksOn: { made: number; stillActive: number };
  imported: { entries: number; budgets: number };
  notSure: { entries: number; of: number };
  subscriptions: { trial: number; active: number; lapsed: number };
  corrections: Array<{ payee: string | null; suggested: string; chosen: string; times: number }>;
};

const DAY = 86_400_000;
const count = (rows: unknown[], key = "n") => Number((rows[0] as Record<string, unknown> | undefined)?.[key] ?? 0);

export async function buildUsageReport(now = new Date()): Promise<UsageReport> {
  const start = new Date(now.getTime() - 7 * DAY);
  const cohortStart = new Date(start.getTime() - 28 * DAY);
  const cohortEnd = new Date(cohortStart.getTime() + 7 * DAY);
  const s = start.toISOString();
  const e = now.toISOString();

  // A budget is active this week if anything was added to it: an entry on an
  // account, or an expense.
  const touched = sql`(
    SELECT group_id FROM joint_account_transactions WHERE created_at >= ${s} AND created_at < ${e}
    UNION
    SELECT group_id FROM expenses WHERE created_at >= ${s} AND created_at < ${e} AND group_id IS NOT NULL
  )`;

  const [signups, people, active, cohort, imported, notSure, subs, corrections] = await Promise.all([
    db.execute(sql`SELECT count(*)::int AS n FROM users WHERE created_at >= ${s} AND created_at < ${e} AND deleted_at IS NULL`),
    db.execute(sql`SELECT count(*)::int AS n FROM users WHERE deleted_at IS NULL`),
    db.execute(sql`
      SELECT count(*) FILTER (WHERE g.private_owner_user_id IS NOT NULL)::int AS personal,
             count(*) FILTER (WHERE g.private_owner_user_id IS NULL)::int AS shared
      FROM groups g WHERE g.id IN ${touched}`),
    db.execute(sql`
      SELECT count(*)::int AS made, count(*) FILTER (WHERE g.id IN ${touched})::int AS still
      FROM groups g WHERE g.created_at >= ${cohortStart.toISOString()} AND g.created_at < ${cohortEnd.toISOString()}`),
    db.execute(sql`
      SELECT count(*)::int AS entries, count(DISTINCT group_id)::int AS budgets
      FROM joint_account_transactions WHERE mpesa_receipt IS NOT NULL AND created_at >= ${s} AND created_at < ${e}`),
    db.execute(sql`
      SELECT count(*) FILTER (WHERE expense_category = ${NOT_SURE_CATEGORY})::int AS unsure, count(*)::int AS total
      FROM joint_account_transactions
      WHERE type = 'disbursement' AND expense_category IS NOT NULL AND created_at >= ${s} AND created_at < ${e}`),
    db.execute(sql`
      SELECT count(*) FILTER (WHERE status = 'trial')::int AS trial,
             count(*) FILTER (WHERE status IN ('active', 'past_due'))::int AS active,
             count(*) FILTER (WHERE status IN ('expired', 'cancelled'))::int AS lapsed
      FROM user_subscriptions s
      WHERE s.id = (SELECT max(l.id) FROM user_subscriptions l WHERE l.user_id = s.user_id)`),
    topCorrections(start),
  ]);

  return {
    weekStart: s.slice(0, 10),
    weekEnd: e.slice(0, 10),
    signups: count(signups.rows),
    people: count(people.rows),
    activeBudgets: { personal: count(active.rows, "personal"), shared: count(active.rows, "shared") },
    fourWeeksOn: { made: count(cohort.rows, "made"), stillActive: count(cohort.rows, "still") },
    imported: { entries: count(imported.rows, "entries"), budgets: count(imported.rows, "budgets") },
    notSure: { entries: count(notSure.rows, "unsure"), of: count(notSure.rows, "total") },
    subscriptions: { trial: count(subs.rows, "trial"), active: count(subs.rows, "active"), lapsed: count(subs.rows, "lapsed") },
    corrections,
  };
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "-");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function usageReportEmail(report: UsageReport) {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#555">${escapeHtml(label)}</td><td style="padding:4px 0;font-weight:600">${escapeHtml(value)}</td></tr>`;
  const corrections = report.corrections.length === 0
    ? `<p style="color:#555">No suggestions were changed this week.</p>`
    : `<table style="border-collapse:collapse;font-size:14px">${report.corrections.map((c) =>
        `<tr><td style="padding:3px 10px 3px 0">${escapeHtml(c.payee ?? "(a person)")}</td>`
        + `<td style="padding:3px 10px 3px 0;color:#555">${escapeHtml(c.suggested)} &rarr; ${escapeHtml(c.chosen)}</td>`
        + `<td style="padding:3px 0;font-weight:600">${c.times}&times;</td></tr>`).join("")}</table>`;
  const active = report.activeBudgets.personal + report.activeBudgets.shared;
  return {
    from: process.env.INVITATION_FROM_EMAIL?.trim() || "Jamvi <info@jamvi.co.ke>",
    to: [process.env.USAGE_REPORT_TO?.trim() || process.env.FEEDBACK_TO?.trim() || "info@jamvi.co.ke"],
    subject: `Jamvi this week: ${plural(active, "active budget")}, ${plural(report.signups, "new sign-up")}`,
    html: [
      `<h2 style="margin:0 0 4px">Jamvi this week</h2>`,
      `<p style="margin:0 0 16px;color:#555">${report.weekStart} to ${report.weekEnd}</p>`,
      `<table style="border-collapse:collapse;font-size:15px">`,
      row("New sign-ups", String(report.signups)),
      row("People on Jamvi", String(report.people)),
      row("Budgets used this week", `${active} (${report.activeBudgets.personal} personal, ${report.activeBudgets.shared} shared)`),
      row("Still using it 4 weeks on", `${report.fourWeeksOn.stillActive} of ${report.fourWeeksOn.made} budgets made then (${pct(report.fourWeeksOn.stillActive, report.fourWeeksOn.made)})`),
      row("Brought in from M-Pesa", `${report.imported.entries} entries, in ${plural(report.imported.budgets, "budget")}`),
      row("Payments left as Not sure", `${report.notSure.entries} of ${report.notSure.of} (${pct(report.notSure.entries, report.notSure.of)})`),
      row("Subscriptions", `${report.subscriptions.trial} on trial, ${report.subscriptions.active} paying, ${report.subscriptions.lapsed} lapsed`),
      `</table>`,
      `<h3 style="margin:20px 0 6px">What people changed in the M-Pesa reading</h3>`,
      `<p style="margin:0 0 8px;color:#555;font-size:13px">Jamvi's suggestion &rarr; what the person chose. Each one is a rule to fix.</p>`,
      corrections,
    ].join(""),
  };
}

export async function sendUsageReport(now = new Date()): Promise<UsageReport> {
  const report = await buildUsageReport(now);
  await sendEmail(usageReportEmail(report));
  return report;
}
