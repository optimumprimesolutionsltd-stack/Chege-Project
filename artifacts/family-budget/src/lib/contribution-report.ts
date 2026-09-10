import { formatKes } from "./utils";

export type ReportMonth = { month: number; year: number; label: string };

export type GroupReportRow = {
  name: string;
  monthlyTarget: number | null;
  /** One figure per month in `months`, same order. */
  amounts: number[];
  total: number;
};

export type GroupContributionReport = {
  budgetName: string;
  /** Oldest first, already narrowed to the chosen range. */
  months: ReportMonth[];
  rows: GroupReportRow[];
  grandTotal: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * "KES 1,234" — the explicit ISO form, used only in the WhatsApp report so it
 * matches the PDF exactly. `formatKes` goes through locale currency formatting,
 * which renders as "Ksh" on some runtimes and "KES" on others; a report that is
 * forwarded between phones should not depend on which.
 */
function kesText(amount: number): string {
  const absolute = Math.abs(Math.round(amount)).toLocaleString("en-KE");
  return amount < 0 ? `-KES ${absolute}` : `KES ${absolute}`;
}

function periodLabel(months: ReportMonth[]): string {
  if (months.length === 0) return "";
  if (months.length === 1) return months[0].label;
  return `${months[0].label} – ${months[months.length - 1].label}`;
}

/**
 * The same sheet as plain text, laid out as a treasurer's report for a
 * WhatsApp message: a titled header with the period and the date it was run, a
 * short summary block, then a numbered line per contributor with their total
 * and where they stand. No month-by-month breakdown — a chat message is read,
 * not studied.
 */
export function buildContributionWhatsAppText(report: GroupContributionReport): string {
  const monthCount = report.months.length;
  const asAt = new Date().toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

  let expectedTotal = 0;
  let paidUp = 0;
  let behindCount = 0;
  const memberLines = report.rows.map((row, index) => {
    const expected = row.monthlyTarget != null ? row.monthlyTarget * monthCount : 0;
    expectedTotal += expected;
    let note = "";
    if (expected > 0) {
      const diff = row.total - expected;
      if (diff < 0) {
        behindCount += 1;
        note = `  — short ${kesText(-diff)}`;
      } else {
        paidUp += 1;
        if (diff > 0) note = `  — ${kesText(diff)} ahead`;
      }
    }
    return `${index + 1}. ${row.name}: ${kesText(row.total)}${note}`;
  });

  const lines: string[] = [
    `*${report.budgetName}*`,
    `Contribution report  |  ${periodLabel(report.months)}`,
    `As at ${asAt}`,
    "",
    "*Summary*",
  ];

  if (expectedTotal > 0) {
    const balance = report.grandTotal - expectedTotal;
    lines.push(`Members: ${report.rows.length}   Paid up: ${paidUp}   Behind: ${behindCount}`);
    lines.push(`Collected: ${kesText(report.grandTotal)} of ${kesText(expectedTotal)} expected`);
    lines.push(
      balance < 0
        ? `Shortfall: ${kesText(-balance)}`
        : balance > 0
          ? `Surplus: ${kesText(balance)}`
          : "On target",
    );
  } else {
    lines.push(`Members: ${report.rows.length}`);
    lines.push(`Collected: ${kesText(report.grandTotal)}`);
  }

  lines.push("");
  lines.push("*Contributions*");
  lines.push(...(memberLines.length ? memberLines : ["No contributors recorded yet."]));
  lines.push("");
  lines.push("Prepared with Jamvi");

  return lines.join("\n");
}

/**
 * The month-by-month contribution sheet as a self-contained HTML document,
 * laid out vertically so it reads on a phone once it is saved to PDF and sent
 * to WhatsApp. One block per contributor: name and period total, then the
 * month breakdown, and a group total at the end. It prints itself on load; the
 * caller opens it in a new window.
 */
export function buildGroupContributionReportHtml(report: GroupContributionReport): string {
  const generated = new Date().toLocaleDateString("en-KE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const memberBlocks = report.rows.length
    ? report.rows
        .map((row) => {
          const months = report.months
            .map((entry, index) => {
              const paid = row.amounts[index] ?? 0;
              return `${escapeHtml(entry.label)}: ${paid ? escapeHtml(formatKes(paid)) : "&mdash;"}`;
            })
            .join(" &nbsp;&middot;&nbsp; ");

          let shortLine = "";
          if (row.monthlyTarget != null) {
            const expected = row.monthlyTarget * report.months.length;
            const short = expected - row.total;
            shortLine =
              short > 0
                ? `<p class="short">Short ${escapeHtml(formatKes(short))} of ${escapeHtml(formatKes(expected))} expected</p>`
                : `<p class="short">Met the ${escapeHtml(formatKes(expected))} expected</p>`;
          }

          return `<div class="member">
            <div class="row"><span>${escapeHtml(row.name)}</span><span>${escapeHtml(formatKes(row.total))}</span></div>
            <p class="months">${months}</p>
            ${shortLine}
          </div>`;
        })
        .join("")
    : `<p class="empty">No contributors in this budget yet.</p>`;

  return reportDocument({
    title: `${report.budgetName} — Contributions ${periodLabel(report.months)}`,
    heading: `${escapeHtml(report.budgetName)} &mdash; Contributions`,
    sub: `${escapeHtml(periodLabel(report.months))} &nbsp;&middot;&nbsp; Generated ${escapeHtml(generated)}`,
    body: `${memberBlocks}
  <div class="total"><span>Group total</span><span>${escapeHtml(formatKes(report.grandTotal))}</span></div>`,
  });
}

export type MemberContributionReport = {
  budgetName: string;
  memberName: string;
  /** Oldest first, already narrowed to the chosen range. */
  months: ReportMonth[];
  /** One figure per month in `months`, same order. */
  amounts: number[];
  /** Still owed per month after a surplus is carried forward. Null where there
   *  is no expected amount. Same length and order as `months`. */
  outstanding: Array<number | null>;
  /** Paid past the last month once every month is settled. */
  creditRemaining: number;
  total: number;
};

/**
 * One member's month-by-month contributions, for handing that person their own
 * record. Same print-on-load HTML document as the group sheet.
 */
export function buildMemberContributionReportHtml(report: MemberContributionReport): string {
  const generated = new Date().toLocaleDateString("en-KE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const monthRows = report.months
    .map((entry, index) => {
      const paid = report.amounts[index] ?? 0;
      const owed = report.outstanding[index] ?? 0;
      const short = owed > 0 ? `<span class="short">short ${escapeHtml(formatKes(owed))}</span>` : "";
      return `<div class="line"><span>${escapeHtml(entry.label)}</span><span>${paid ? escapeHtml(formatKes(paid)) : "&mdash;"} ${short}</span></div>`;
    })
    .join("");

  const totalShort = report.outstanding.reduce<number>((sum, owed) => sum + (owed ?? 0), 0);
  const hasExpectation = report.outstanding.some((owed) => owed !== null);
  let expectedLine = "";
  if (hasExpectation) {
    expectedLine =
      totalShort > 0
        ? `<p class="sub">Short ${escapeHtml(formatKes(totalShort))} over this period</p>`
        : report.creditRemaining > 0
          ? `<p class="sub">Up to date &nbsp;&middot;&nbsp; ${escapeHtml(formatKes(report.creditRemaining))} paid ahead</p>`
          : `<p class="sub">Up to date for this period</p>`;
  }

  return reportDocument({
    title: `${report.memberName} — Contributions ${periodLabel(report.months)}`,
    heading: `${escapeHtml(report.memberName)}`,
    sub: `${escapeHtml(report.budgetName)} &nbsp;&middot;&nbsp; ${escapeHtml(periodLabel(report.months))} &nbsp;&middot;&nbsp; Generated ${escapeHtml(generated)}`,
    body: `${monthRows || '<p class="empty">Nothing recorded for this member in this period.</p>'}
  ${expectedLine}
  <div class="total"><span>Total</span><span>${escapeHtml(formatKes(report.total))}</span></div>`,
  });
}

function reportDocument(parts: { title: string; heading: string; sub: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(parts.title)}</title>
<style>
  body { font: 14px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; margin: 32px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { color: #666; font-size: 12px; margin: 0 0 20px; }
  .member { padding: 10px 0; border-bottom: 1px solid #eee; }
  .member .row { display: flex; justify-content: space-between; gap: 16px; font-weight: 600; }
  .member .months { color: #555; font-size: 12px; margin: 4px 0 0; }
  .line { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; border-bottom: 1px solid #eee; }
  .short { color: #b00; font-size: 12px; }
  .empty { color: #666; }
  .total { display: flex; justify-content: space-between; gap: 16px; font-weight: 700; font-size: 16px;
           margin-top: 18px; padding-top: 12px; border-top: 2px solid #333; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <h1>${parts.heading}</h1>
  <p class="sub">${parts.sub}</p>
  ${parts.body}
  <script>window.addEventListener("load", function () { window.focus(); window.print(); });</script>
</body>
</html>`;
}
