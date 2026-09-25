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
 * The three number columns, found from where amounts actually sit across the
 * whole statement: money in, money out and the balance, left to right. Header
 * text is aligned differently from the figures under it, so it is no guide.
 */
function amountColumns(pages: readonly (readonly TextItem[])[]): number[] | null {
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
  // Stray figures (a summary table above the rows) form small clusters of their own.
  const big = clusters.filter((cluster) => cluster.length >= 5);
  if (big.length < 2) return null;
  const centres = big.map((cluster) => cluster.reduce((sum, edge) => sum + edge, 0) / cluster.length);
  // The last column is the balance, the one before it is money out; money in is
  // the one before that when there is one.
  return centres.slice(-3);
}

/** Text of the details column: everything between the time and the status columns. */
function joinDetails(parts: string[]): string {
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function readStatementRows(pages: readonly (readonly TextItem[])[]): StatementRow[] {
  const columns = amountColumns(pages);
  if (!columns) return [];
  const [paidInEdge, withdrawnEdge, balanceEdge] = columns.length === 3 ? columns : [null, columns[0], columns[1]];
  const columnOf = (item: TextItem): "paidIn" | "withdrawn" | "balance" | null => {
    const edge = rightEdge(item);
    const options: Array<["paidIn" | "withdrawn" | "balance", number | null]> = [
      ["paidIn", paidInEdge ?? null],
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
 * Whether the statement adds up: each row's balance is the balance before it plus
 * what came in, minus what went out. A statement that does not is one whose amounts
 * were misread, and it is better to say so than to record it.
 *
 * Works whichever way round the statement is ordered.
 */
export function checkRunningBalance(rows: readonly StatementRow[]): { checked: number; failedAt: number[]; ok: boolean } {
  if (rows.length < 2) return { checked: 0, failedAt: [], ok: true };
  const newestFirst = rows[0].time >= rows[rows.length - 1].time;
  const failedAt: number[] = [];
  let checked = 0;
  for (let i = 0; i < rows.length - 1; i += 1) {
    const later = newestFirst ? rows[i] : rows[i + 1];
    const earlier = newestFirst ? rows[i + 1] : rows[i];
    if (later.balance === null || earlier.balance === null) continue;
    const expected = Math.round((earlier.balance + (later.paidIn ?? 0) - (later.withdrawn ?? 0)) * 100) / 100;
    checked += 1;
    if (Math.abs(expected - later.balance) > 0.01) failedAt.push(newestFirst ? i : i + 1);
  }
  return { checked, failedAt, ok: failedAt.length === 0 };
}
