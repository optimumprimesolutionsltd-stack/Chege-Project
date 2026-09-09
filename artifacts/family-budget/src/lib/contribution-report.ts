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

function periodLabel(months: ReportMonth[]): string {
  if (months.length === 0) return "";
  if (months.length === 1) return months[0].label;
  return `${months[0].label} – ${months[months.length - 1].label}`;
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

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(report.budgetName)} — Contributions ${escapeHtml(periodLabel(report.months))}</title>
<style>
  body { font: 14px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; margin: 32px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { color: #666; font-size: 12px; margin: 0 0 20px; }
  .member { padding: 10px 0; border-bottom: 1px solid #eee; }
  .member .row { display: flex; justify-content: space-between; gap: 16px; font-weight: 600; }
  .member .months { color: #555; font-size: 12px; margin: 4px 0 0; }
  .short { color: #999; font-size: 12px; margin: 2px 0 0; }
  .empty { color: #666; }
  .total { display: flex; justify-content: space-between; gap: 16px; font-weight: 700; font-size: 16px;
           margin-top: 18px; padding-top: 12px; border-top: 2px solid #333; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <h1>${escapeHtml(report.budgetName)} &mdash; Contributions</h1>
  <p class="sub">${escapeHtml(periodLabel(report.months))} &nbsp;&middot;&nbsp; Generated ${escapeHtml(generated)}</p>
  ${memberBlocks}
  <div class="total"><span>Group total</span><span>${escapeHtml(formatKes(report.grandTotal))}</span></div>
  <script>window.addEventListener("load", function () { window.focus(); window.print(); });</script>
</body>
</html>`;
}
