import { db } from "@workspace/db";
import {
  expensesTable,
  budgetCategoriesTable,
  contributionsTable,
  usersTable,
  groupMembershipsTable,
  groupsTable,
  digestSendsTable,
} from "@workspace/db";
import { sql, eq, desc, and } from "drizzle-orm";
import { logger } from "./logger";
import { sendEmail } from "./email";

const UNCATEGORIZED_CATEGORY = "Uncategorized";

function fmt(kes: number): string {
  return `KES ${Math.round(kes).toLocaleString()}`;
}

function monthName(month: number, year: number): string {
  return new Date(year, month - 1, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
}

function statusBadge(pct: number): string {
  if (pct >= 100) return "🔴 Over budget";
  if (pct >= 85) return "🟡 Near limit";
  return "🟢 On track";
}

interface CategoryRow {
  name: string;
  budgetAmount: number;
}

interface ExpenseRow {
  description: string;
  amount: number;
  category: string;
  paidByName: string | null;
  date: string;
}

interface MemberContribution {
  name: string;
  contributed: number;
  target: number | null;
}

function buildEmailHtml(opts: {
  label: string;
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  pctUsed: number;
  categories: CategoryRow[];
  spentMap: Map<string, number>;
  top5: ExpenseRow[];
  memberContributions: MemberContribution[];
}): string {
  const {
    label,
    totalBudget,
    totalSpent,
    remaining,
    pctUsed,
    categories,
    spentMap,
    top5,
    memberContributions,
  } = opts;

  const overBudget = remaining < 0;
  const budgetLine = overBudget
    ? `<span style="color:#dc2626">Over budget by ${fmt(Math.abs(remaining))}</span>`
    : `${fmt(remaining)} remaining`;

  const categoryRows = categories
    .map((cat) => {
      const spent = spentMap.get(cat.name) ?? 0;
      const pct = cat.budgetAmount > 0 ? Math.round((spent / cat.budgetAmount) * 100) : 0;
      return `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px">${cat.name}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;text-align:right">${fmt(spent)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;text-align:right;color:#6b7280">${fmt(cat.budgetAmount)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;text-align:right">${statusBadge(pct)}</td>
      </tr>`;
    })
    .join("");

  const top5Rows = top5
    .map(
      (e, i) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280">${i + 1}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px">${e.description}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280">${e.category}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;text-align:right;font-weight:600">${fmt(e.amount)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;text-align:right;color:#6b7280">${e.paidByName ?? "—"}</td>
      </tr>`,
    )
    .join("");

  const memberRows = memberContributions
    .map((m) => {
      const gap = m.target != null ? m.target - m.contributed : null;
      return `
      <td style="padding:12px 16px;background:#f8fafc;border-radius:8px;margin-right:8px" width="${Math.floor(96 / memberContributions.length)}%">
        <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">${m.name}</p>
        <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#111827">${fmt(m.contributed)}</p>
        ${m.target != null
          ? `<p style="margin:4px 0 0;font-size:12px;color:${m.contributed >= m.target ? "#059669" : "#6b7280"}">
               Target: ${fmt(m.target)} ${m.contributed >= m.target ? "✓" : `· Gap: ${fmt(gap ?? 0)}`}
             </p>`
          : ""}
      </td>`;
    })
    .join('<td width="4%"></td>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Jamvi — ${label} Summary</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 0">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr><td style="background:#1d4ed8;padding:28px 32px">
          <p style="margin:0;font-size:12px;color:#93c5fd;letter-spacing:.08em;text-transform:uppercase">Monthly Digest</p>
          <h1 style="margin:6px 0 0;font-size:24px;color:#ffffff;font-weight:700">${label}</h1>
          <p style="margin:4px 0 0;font-size:14px;color:#bfdbfe">Jamvi Summary</p>
        </td></tr>

        <!-- Budget Overview -->
        <tr><td style="padding:28px 32px 0">
          <h2 style="margin:0 0 16px;font-size:16px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.05em">Budget Overview</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:0 8px 16px 0" width="33%">
                <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">Total Budget</p>
                <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#111827">${fmt(totalBudget)}</p>
              </td>
              <td style="padding:0 8px 16px" width="33%">
                <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">Total Spent</p>
                <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:${pctUsed >= 100 ? "#dc2626" : "#111827"}">${fmt(totalSpent)}</p>
              </td>
              <td style="padding:0 0 16px" width="33%">
                <p style="margin:0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">${overBudget ? "Over Budget" : "Remaining"}</p>
                <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:${overBudget ? "#dc2626" : "#059669"}">${fmt(Math.abs(remaining))}</p>
              </td>
            </tr>
          </table>
          <!-- Progress bar -->
          <div style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden;margin-bottom:6px">
            <div style="background:${pctUsed >= 100 ? "#dc2626" : pctUsed >= 85 ? "#f59e0b" : "#1d4ed8"};width:${Math.min(pctUsed, 100)}%;height:100%;border-radius:999px"></div>
          </div>
          <p style="margin:0 0 0;font-size:13px;color:#6b7280">${pctUsed}% of budget used &mdash; ${budgetLine}</p>
        </td></tr>

        <!-- Category Breakdown -->
        <tr><td style="padding:28px 32px 0">
          <h2 style="margin:0 0 16px;font-size:16px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.05em">Category Breakdown</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <th style="text-align:left;font-size:12px;font-weight:500;color:#9ca3af;padding-bottom:6px">Category</th>
              <th style="text-align:right;font-size:12px;font-weight:500;color:#9ca3af;padding-bottom:6px">Spent</th>
              <th style="text-align:right;font-size:12px;font-weight:500;color:#9ca3af;padding-bottom:6px">Budget</th>
              <th style="text-align:right;font-size:12px;font-weight:500;color:#9ca3af;padding-bottom:6px">Status</th>
            </tr>
            ${categoryRows}
          </table>
        </td></tr>

        <!-- Top 5 Expenses -->
        ${
          top5.length > 0
            ? `<tr><td style="padding:28px 32px 0">
          <h2 style="margin:0 0 16px;font-size:16px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.05em">Top 5 Expenses</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <th style="text-align:left;font-size:12px;font-weight:500;color:#9ca3af;padding-bottom:6px" width="24">#</th>
              <th style="text-align:left;font-size:12px;font-weight:500;color:#9ca3af;padding-bottom:6px">Description</th>
              <th style="text-align:left;font-size:12px;font-weight:500;color:#9ca3af;padding-bottom:6px">Category</th>
              <th style="text-align:right;font-size:12px;font-weight:500;color:#9ca3af;padding-bottom:6px">Amount</th>
              <th style="text-align:right;font-size:12px;font-weight:500;color:#9ca3af;padding-bottom:6px">By</th>
            </tr>
            ${top5Rows}
          </table>
        </td></tr>`
            : ""
        }

        <!-- Contributions Split -->
        ${memberContributions.length > 0 ? `<tr><td style="padding:28px 32px 0">
          <h2 style="margin:0 0 16px;font-size:16px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.05em">Contributions</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${memberRows}
            </tr>
          </table>
        </td></tr>` : ""}

        <!-- Footer -->
        <tr><td style="padding:28px 32px">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center">
            This digest was sent automatically on the 1st of each month.${process.env.APP_URL?.trim()
              ? `<br/>Open <a href="${process.env.APP_URL.trim()}" style="color:#1d4ed8">Jamvi</a> to see full details.`
              : ""}
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Sends the monthly digest for a single group.
 * Idempotency key is (groupId, month, year).
 */
export async function sendMonthlyDigest(
  month: number,
  year: number,
  opts: { force?: boolean; groupId: number },
): Promise<{ id: string; to: string[]; skipped?: boolean }> {
  logger.info({ month, year, force: opts.force, groupId: opts.groupId }, "Building monthly digest");

  const groupId = opts.groupId;

  // ── Idempotency guard — one send per (groupId, month, year) ──────────────
  if (opts.force) {
    await db
      .delete(digestSendsTable)
      .where(
        and(
          sql`${digestSendsTable.groupId} = ${groupId}`,
          sql`${digestSendsTable.month} = ${month}`,
          sql`${digestSendsTable.year} = ${year}`,
        ),
      );
  }

  const claimed = await db
    .insert(digestSendsTable)
    .values({ groupId, month, year })
    .onConflictDoNothing()
    .returning({ id: digestSendsTable.id });

  if (claimed.length === 0) {
    logger.info({ month, year, groupId }, "Digest already sent for this group/month — skipping");
    return { id: "already-sent", to: [], skipped: true };
  }

  const claimId = claimed[0].id;

  // ── Gather data concurrently ──────────────────────────────────────────────
  const [spentRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${expensesTable.amount}), 0)` })
    .from(expensesTable)
    .where(
      sql`${expensesTable.groupId} = ${groupId} AND EXTRACT(MONTH FROM ${expensesTable.date}) = ${month} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`,
    );

  const [budgetRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${budgetCategoriesTable.budgetAmount}), 0)` })
    .from(budgetCategoriesTable)
    .where(
      sql`${budgetCategoriesTable.groupId} = ${groupId} AND (${budgetCategoriesTable.isRecurring} = true OR (${budgetCategoriesTable.activeMonth} = ${month} AND ${budgetCategoriesTable.activeYear} = ${year}))`,
    );

  const [categories, spentByCategory, top5, contribs, membershipRows] = await Promise.all([
    db
      .select()
      .from(budgetCategoriesTable)
      .where(eq(budgetCategoriesTable.groupId, groupId))
      .orderBy(budgetCategoriesTable.priority),
    // Allocation rows replace the parent category for allocated expenses.
    // The NOT EXISTS branch retains pre-allocation expenses without
    // double-counting their parent amount.
    db.execute(sql`
      SELECT category, COALESCE(SUM(amount), 0) AS total FROM (
        SELECT allocation.category, allocation.amount
        FROM expense_category_allocations allocation
        INNER JOIN expenses expense
          ON expense.id = allocation.expense_id AND expense.group_id = allocation.group_id
        WHERE allocation.group_id = ${groupId}
          AND EXTRACT(MONTH FROM expense.date) = ${month}
          AND EXTRACT(YEAR FROM expense.date) = ${year}
        UNION ALL
        SELECT expense.category, expense.amount
        FROM expenses expense
        WHERE expense.group_id = ${groupId}
          AND EXTRACT(MONTH FROM expense.date) = ${month}
          AND EXTRACT(YEAR FROM expense.date) = ${year}
          AND NOT EXISTS (
            SELECT 1 FROM expense_category_allocations allocation
            WHERE allocation.expense_id = expense.id AND allocation.group_id = ${groupId}
          )
      ) allocated
      GROUP BY category
    `).then((result) => (result.rows as { category: string; total: string | number }[])
      .map((row) => ({ category: row.category, total: Number(row.total) }))),
    db
      .select({
        description: expensesTable.description,
        amount: expensesTable.amount,
        category: expensesTable.category,
        paidByName: usersTable.firstName,
        date: expensesTable.date,
      })
      .from(expensesTable)
      .leftJoin(usersTable, eq(expensesTable.paidById, usersTable.id))
      .where(
        sql`${expensesTable.groupId} = ${groupId} AND EXTRACT(MONTH FROM ${expensesTable.date}) = ${month} AND EXTRACT(YEAR FROM ${expensesTable.date}) = ${year}`,
      )
      .orderBy(desc(expensesTable.amount))
      .limit(5),
    db
      .select({
        userId: contributionsTable.userId,
        total: sql<number>`COALESCE(SUM(${contributionsTable.amount}), 0)`,
      })
      .from(contributionsTable)
      .where(
        sql`${contributionsTable.groupId} = ${groupId} AND ${contributionsTable.month} = ${month} AND ${contributionsTable.year} = ${year}`,
      )
      .groupBy(contributionsTable.userId),
    db
      .select({
        userId: groupMembershipsTable.userId,
        monthlyTarget: groupMembershipsTable.monthlyTarget,
        firstName: usersTable.firstName,
        email: usersTable.email,
      })
      .from(groupMembershipsTable)
      .leftJoin(usersTable, eq(usersTable.id, groupMembershipsTable.userId))
      .where(eq(groupMembershipsTable.groupId, groupId)),
  ]);

  // ── Build per-member contribution summary ─────────────────────────────────
  const contribByUserId = new Map(contribs.map((c) => [c.userId, Number(c.total)]));

  const memberContributions: MemberContribution[] = membershipRows.map((m) => {
    const name =
      m.firstName ??
      m.email?.split("@")[0]?.replace(/^./, (c) => c.toUpperCase()) ??
      "Member";
    return {
      name,
      contributed: contribByUserId.get(m.userId) ?? 0,
      target: m.monthlyTarget ?? null,
    };
  });

  // ── Recipient emails ──────────────────────────────────────────────────────
  const memberEmails: string[] = membershipRows
    .map((m) => m.email)
    .filter((e): e is string => Boolean(e));
  const to = [...new Set(memberEmails)];

  if (to.length === 0) {
    throw new Error(
      "No recipient emails found for this shared group.",
    );
  }

  // ── Build HTML ────────────────────────────────────────────────────────────
  const totalSpent = Number(spentRow.total);
  const totalBudget = Number(budgetRow.total);
  const remaining = totalBudget - totalSpent;
  const pctUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const spentMap = new Map(spentByCategory.map((s) => [s.category, Number(s.total)]));
  // The expense storage sentinel is unbudgeted spending, never budget use.
  spentMap.delete(UNCATEGORIZED_CATEGORY);
  const label = monthName(month, year);

  const html = buildEmailHtml({
    label,
    totalBudget,
    totalSpent,
    remaining,
    pctUsed,
    categories,
    spentMap,
    top5: top5.map((e) => ({
      ...e,
      amount: Number(e.amount),
      date: String(e.date),
    })),
    memberContributions,
  });

  // ── Send via Resend ───────────────────────────────────────────────────────
  // Shares lib/email with invitations rather than calling Resend inline, so
  // there is one place where an API key is read and one shape of failure.
  //
  // A claimed row must not survive a failed send: the claim is what stops the
  // digest going out twice, so leaving it behind would mean this group is
  // silently skipped forever.
  const releaseClaim = () =>
    db.delete(digestSendsTable).where(and(
      eq(digestSendsTable.id, claimId),
      eq(digestSendsTable.groupId, groupId),
    ));

  let sent;
  try {
    sent = await sendEmail({
      from: process.env.DIGEST_FROM_EMAIL ?? "Jamvi <onboarding@resend.dev>",
      to,
      subject: `Jamvi — ${label} Summary`,
      html,
    });
  } catch (error) {
    await releaseClaim();
    throw error;
  }

  // Persist the Resend email ID and recipients for the audit log.
  await db
    .update(digestSendsTable)
    .set({ emailId: sent.id, recipients: to })
    .where(and(
      eq(digestSendsTable.id, claimId),
      eq(digestSendsTable.groupId, groupId),
    ));

  logger.info({ emailId: sent.id, to, month, year, groupId }, "Monthly digest sent");
  return { id: sent.id ?? "unknown", to };
}

/**
 * Returns the previous month + year relative to a given date (defaults to now).
 */
export function previousMonth(from = new Date()): { month: number; year: number } {
  const d = new Date(from.getFullYear(), from.getMonth() - 1, 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}
