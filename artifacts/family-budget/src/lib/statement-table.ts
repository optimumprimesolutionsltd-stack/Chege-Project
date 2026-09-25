/**
 * Turns the text positions of an M-Pesa statement PDF into its table rows.
 *
 * The statement's detailed table has seven columns (receipt, time, details,
 * status, paid in, withdrawn, balance). Reading it as plain text puts amounts in
 * the wrong column about half the time, because a row's details wrap over several
 * lines and the amounts sit beside whichever line the PDF happened to place them
 * on. The exact position of every piece of text does not have that problem, so
 * this works from positions: which column an amount is in decides whether money
 * came in or went out, never its sign.
 */
export type TextItem = { str: string; x: number; y: number; w: number };

export interface StatementRow {
  receipt: string;
  /** As printed: YYYY-MM-DD HH:MM:SS */
  time: string;
  details: string;
  status: string;
  paidIn: number | null;
  /** The size of the amount, whatever sign the statement printed it with. */
  withdrawn: number | null;
  balance: number | null;
}

const RECEIPT = /^[A-Z0-9]{10}$/;
const TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const AMOUNT = /^-?[\d,]+\.\d{2}$/;
const STATUSES = ["Completed", "Failed", "Pending", "Reversed", "Cancelled"];

const num = (text: string) => Number(text.replace(/,/g, ""));

/** Items that share a line, left to right. */
function lines(items: readonly TextItem[]): TextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const out: TextItem[][] = [];
  for (const item of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0].y - item.y) <= 2.5) last.push(item);
    else out.push([item]);
  }
  return out.map((line) => line.sort((a, b) => a.x - b.x));
}

/** The right edge of an amount, used to tell the three number columns apart. */
const rightEdge = (item: TextItem) => item.x + item.w;

/**
 * The number columns, found from where amounts actually sit across the whole
 * statement: money in, money out and the balance, left to right. Header text is
 * aligned differently from the figures under it, so it is no guide to where they
 * end. The summary table above the rows adds a few stray figures of its own, so
 * only the biggest clusters count: a column is where a row's worth of amounts pile up.
 */
function amountColumns(
  pages: readonly (readonly TextItem[])[],
): { paidIn: number | null; withdrawn: number | null; balance: number } | null {
  const edges: number[] = [];
  for (const items of pages) for (const item of items) if (AMOUNT.test(item.str.trim())) edges.push(rightEdge(item));
  if (edges.length === 0) return null;
  edges.sort((a, b) => a - b);
  // A new column starts wherever there is a clear gap between right edges.
  const clusters: number[][] = [[edges[0]]];
  for (let i = 1; i < edges.length; i += 1) {
    if (edges[i] - edges[i - 1] > 24) clusters.push([edges[i]]);
    else clusters[clusters.length - 1].push(edges[i]);
  }
  const centres = clusters
    .filter((cluster) => cluster.length >= 5)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3)
    .map((cluster) => cluster.reduce((sum, edge) => sum + edge, 0) / cluster.length)
    .sort((a, b) => a - b);
  if (centres.length === 3) return { paidIn: centres[0], withdrawn: centres[1], balance: centres[2] };
  if (centres.length === 2) {
    // Only one of money in / money out appears: the header says which.
    const header = (label: string) => {
      for (const items of pages) {
        const hit = items.find((item) => item.str.trim() === label);
        if (hit) return hit.x + hit.w / 2;
      }
      return null;
    };
    const paidInHeader = header("Paid In");
    const withdrawnHeader = header("Withdrawn");
    const isPaidIn =
      paidInHeader !== null && withdrawnHeader !== null && Math.abs(centres[0] - paidInHeader) < Math.abs(centres[0] - withdrawnHeader);
    return isPaidIn ? { paidIn: centres[0], withdrawn: null, balance: centres[1] } : { paidIn: null, withdrawn: centres[0], balance: centres[1] };
  }
  return null;
}

/** Text of the details column: everything between the time and the status columns. */
function joinDetails(parts: string[]): string {
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function readStatementRows(pages: readonly (readonly TextItem[])[]): StatementRow[] {
  const columns = amountColumns(pages);
  if (!columns) return [];
  const { paidIn: paidInEdge, withdrawn: withdrawnEdge, balance: balanceEdge } = columns;
  const columnOf = (item: TextItem): "paidIn" | "withdrawn" | "balance" | null => {
    const edge = rightEdge(item);
    const options: Array<["paidIn" | "withdrawn" | "balance", number | null]> = [
      ["paidIn", paidInEdge],
      ["withdrawn", withdrawnEdge],
      ["balance", balanceEdge],
    ];
    let best: "paidIn" | "withdrawn" | "balance" | null = null;
    let bestDistance = 20;
    for (const [name, at] of options) {
      if (at === null) continue;
      const distance = Math.abs(edge - at);
      if (distance < bestDistance) {
        best = name;
        bestDistance = distance;
      }
    }
    return best;
  };

  const rows: StatementRow[] = [];
  for (const items of pages) {
    const pageLines = lines(items);
    // A row starts on a line whose first item is a receipt number followed by a time.
    const starts: number[] = [];
    pageLines.forEach((line, index) => {
      const first = line[0]?.str.trim();
      const hasTime = line.some((item) => TIME.test(item.str.trim()));
      if (first && RECEIPT.test(first) && hasTime) starts.push(index);
    });
    if (starts.length === 0) continue;

    // Each row owns its own line and the lines under it, until the next row starts.
    // Wrapped detail lines sit close together; a big gap after the last wrapped line
    // is the page footer (page numbers, disclaimers), which is not part of the row.
    const lineGaps = pageLines.slice(1).map((line, i) => pageLines[i][0].y - line[0].y).filter((gap) => gap > 0);
    const typical = lineGaps.length ? [...lineGaps].sort((a, b) => a - b)[Math.floor(lineGaps.length / 2)] : 10;

    starts.forEach((start, position) => {
      const end = position + 1 < starts.length ? starts[position + 1] : pageLines.length;
      const block: TextItem[][] = [pageLines[start]];
      for (let i = start + 1; i < end; i += 1) {
        const gap = pageLines[i - 1][0].y - pageLines[i][0].y;
        if (gap > typical * 2.2) break;
        block.push(pageLines[i]);
      }

      const first = block[0];
      const receipt = first[0].str.trim();
      const time = first.find((item) => TIME.test(item.str.trim()))!.str.trim();
      const statusX = first.find((item) => STATUSES.includes(item.str.trim()))?.x ?? Number.POSITIVE_INFINITY;
      const timeX = first.find((item) => TIME.test(item.str.trim()))!.x;

      const detailParts: string[] = [];
      let status = "";
      let paidIn: number | null = null;
      let withdrawn: number | null = null;
      let balance: number | null = null;
      for (const line of block) {
        for (const item of line) {
          const text = item.str.trim();
          if (!text || text === receipt || text === time) continue;
          if (AMOUNT.test(text)) {
            const column = columnOf(item);
            const value = Math.abs(num(text));
            if (column === "paidIn") paidIn = value;
            else if (column === "withdrawn") withdrawn = value;
            else if (column === "balance") balance = num(text);
            continue;
          }
          if (STATUSES.includes(text)) {
            status = text;
            continue;
          }
          // Details: to the right of the time, and to the left of the status column.
          if (item.x > timeX + 20 && item.x < statusX - 4) detailParts.push(text);
        }
      }
      rows.push({ receipt, time, details: joinDetails(detailParts), status, paidIn, withdrawn, balance });
    });
  }
  return rows;
}

/**
 * Whether the statement adds up, receipt by receipt: everything under one receipt
 * (a payment, its charge, and a Fuliza loan draw that funded it) moves the
 * balance by what came in minus what went out, and the balance after it is the
 * balance before it plus that.
 *
 * Checked per receipt and not per row because the rows of one receipt are
 * offsetting entries that all show the same balance: a Fuliza payment and its
 * draw cancel out, so no single row's balance follows from the row before it.
 * A statement that does not add up is one whose amounts were misread, and it is
 * better to say so than to record it. Works whichever way round the statement is.
 */
export function checkRunningBalance(rows: readonly StatementRow[]): { checked: number; failedAt: number[]; ok: boolean } {
  if (rows.length < 2) return { checked: 0, failedAt: [], ok: true };
  const newestFirst = rows[0].time >= rows[rows.length - 1].time;
  const ordered = newestFirst ? rows : [...rows].reverse();

  // Consecutive rows with the same receipt, or stamped the same second, are one group; [start, end) indexes into `ordered`.
  const groups: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const last = groups[groups.length - 1];
    if (last && (ordered[last.start].receipt === ordered[i].receipt || ordered[last.start].time === ordered[i].time)) last.end = i + 1;
    else groups.push({ start: i, end: i + 1 });
  }

  const failedAt: number[] = [];
  let checked = 0;
  for (let g = 0; g < groups.length - 1; g += 1) {
    const later = groups[g];
    const earlier = groups[g + 1];
    // The rows of one receipt are not always listed in the same order (a payment and
    // its charge can come either way round), so a Fuliza payment shows partial
    // balances part-way through, so the balance after the whole group is the one on
    // whichever of its rows lines up.
    const afters = ordered.slice(later.start, later.end).map((row) => row.balance);
    const befores = ordered.slice(earlier.start, earlier.end).map((row) => row.balance);
    let net = 0;
    for (let i = later.start; i < later.end; i += 1) net += (ordered[i].paidIn ?? 0) - (ordered[i].withdrawn ?? 0);
    const usable = afters.some((v) => v !== null) && befores.some((v) => v !== null);
    if (!usable) continue;
    checked += 1;
    const fits = afters.some(
      (after) =>
        after !== null &&
        befores.some((before) => before !== null && Math.abs(Math.round((before + net) * 100) / 100 - after) <= 0.01),
    );
    if (!fits) failedAt.push(newestFirst ? later.start : rows.length - 1 - later.start);
  }
  return { checked, failedAt, ok: failedAt.length === 0 };
}

// Money-in wording in the Details column. The statement prints the Paid In and
// Withdrawn columns swapped for the rows of a Fuliza payment (the payment sits
// under Paid In and its loan draw under Withdrawn), so the column alone cannot be
// trusted there; what the row says it is can.
const IN_DETAILS = /^(Business Payment from|Funds received from|Customer Transfer from|Transfer from Bank|Deposit of Funds|Salary Payment from|Promotion Payment|Pay Bill Funds from|OverDraft of Credit Party)/i;
const OUT_DETAILS =
  /^(OD Loan Repayment|Customer .*Purchase|Customer Transfer|Customer Payment|Customer Withdrawal|Merchant Payment|Pay Bill|Buy Goods|Withdrawal|Airtime|Fuliza)/i;

/**
 * Puts each amount in the column its Details say it belongs in, keeping the size
 * the statement printed. Rows whose wording is not recognised keep their column.
 */
export function resolveDirections(rows: readonly StatementRow[]): StatementRow[] {
  return rows.map((row) => {
    const amount = row.paidIn ?? row.withdrawn;
    if (amount === null) return row;
    const details = row.details.trim();
    if (IN_DETAILS.test(details)) return { ...row, paidIn: amount, withdrawn: null };
    if (OUT_DETAILS.test(details)) return { ...row, paidIn: null, withdrawn: amount };
    return row;
  });
}
