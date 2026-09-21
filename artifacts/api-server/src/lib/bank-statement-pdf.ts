import { randomBytes } from "node:crypto";
import PDFDocument from "pdfkit";
import { drawBrandMark } from "./brand-mark";

export type BankStatementPdfRow = {
  /** YYYY-MM-DD */
  date: string;
  description: string;
  /** The category, the party, or what kind of movement it was. */
  detail: string | null;
  /** One of these is zero. Both being zero is a posting cleared to nothing. */
  moneyIn: number;
  moneyOut: number;
  /** The balance after this posting, not before it. */
  balance: number;
};

export type BankStatementPdfData = {
  groupName: string;
  accountName: string;
  periodLabel: string;
  openingBalance: number;
  closingBalance: number;
  totalIn: number;
  totalOut: number;
  /** Oldest first, the way a bank prints it. */
  rows: BankStatementPdfRow[];
  /**
   * Money that moved without being earned or spent. Shown apart from the
   * totals because it is already inside them — it did move the balance — but
   * reading "money in 180,000" without knowing 150,000 of it was borrowed is
   * how somebody concludes they had a good month.
   */
  borrowed: number;
  repaidToUs: number;
  lent: number;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const SIDE_MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - SIDE_MARGIN * 2;
const BOTTOM_LIMIT = PAGE_HEIGHT - 52;

function formatKes(value: number): string {
  const absolute = Math.abs(value).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `-${absolute}` : absolute;
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function compactText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

/**
 * An account statement as a PDF, laid out the way a bank lays one out: an
 * opening balance, every posting in date order with money in, money out and
 * the balance after it, then a closing balance.
 *
 * The order matters more than it looks. Jamvi's own screens list newest first,
 * which is right for entering a day and useless for checking one: a running
 * balance only means anything read downwards from where it started. This is
 * the document somebody holds beside the bank's own to find the line where the
 * two stopped agreeing.
 */
export function createBankStatementPdf(data: BankStatementPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: "A4",
      margin: SIDE_MARGIN,
      compress: false,
      info: {
        Title: `${data.accountName} — statement ${data.periodLabel}`,
        Author: "Jamvi",
        Subject: "Account statement",
      },
      ownerPassword: randomBytes(24).toString("base64"),
      permissions: {
        printing: "highResolution",
        modifying: false,
        copying: false,
        annotating: false,
        fillingForms: false,
        contentAccessibility: true,
        documentAssembly: false,
      },
    });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    let y = 0;
    const header = (continued = false) => {
      document.rect(0, 0, PAGE_WIDTH, 88).fill("#0A3D2E");
      const markWidth = drawBrandMark(document, SIDE_MARGIN);
      document.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(19).text("JAMVI", SIDE_MARGIN + markWidth, 25);
      document.font("Helvetica").fontSize(9).fillColor("#D7F3E8").text(
        continued
          ? `${compactText(data.accountName, 40)} — ${data.periodLabel} — continued`
          : `Account statement ${data.periodLabel}`,
        SIDE_MARGIN,
        52,
      );
      document.font("Helvetica-Bold").fontSize(10).fillColor("#FFFFFF").text(
        compactText(data.groupName, 42),
        SIDE_MARGIN,
        67,
        { width: CONTENT_WIDTH, align: "right" },
      );
      y = 112;
    };

    const columns = [
      { label: "Date", x: SIDE_MARGIN, width: 74 },
      { label: "Details", x: SIDE_MARGIN + 78, width: 176 },
      { label: "In", x: SIDE_MARGIN + 258, width: 80, align: "right" as const },
      { label: "Out", x: SIDE_MARGIN + 342, width: 80, align: "right" as const },
      { label: "Balance", x: SIDE_MARGIN + 426, width: 85, align: "right" as const },
    ];

    const drawColumnHeader = () => {
      document.rect(SIDE_MARGIN, y, CONTENT_WIDTH, 19).fill("#EAF3EE");
      document.font("Helvetica-Bold").fontSize(7.5).fillColor("#31584A");
      for (const column of columns) {
        document.text(column.label.toUpperCase(), column.x, y + 6, {
          width: column.width,
          align: column.align ?? "left",
          lineBreak: false,
        });
      }
      y += 20;
    };

    const ensureRoom = (height: number) => {
      if (y + height <= BOTTOM_LIMIT) return;
      document.addPage();
      header(true);
      drawColumnHeader();
    };

    const row = (
      cells: Array<{ text: string; x: number; width: number; align?: "left" | "right"; bold?: boolean; color?: string }>,
      height = 20,
    ) => {
      ensureRoom(height + 1);
      document.moveTo(SIDE_MARGIN, y + height).lineTo(PAGE_WIDTH - SIDE_MARGIN, y + height).strokeColor("#E6ECE9").lineWidth(0.5).stroke();
      for (const cell of cells) {
        document
          .font(cell.bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(8.5)
          .fillColor(cell.color ?? "#243D33")
          .text(compactText(cell.text, 46), cell.x, y + 6, {
            width: cell.width,
            align: cell.align ?? "left",
            lineBreak: false,
          });
      }
      y += height;
    };

    header();
    document.font("Helvetica-Bold").fontSize(22).fillColor("#103A2D").text(
      compactText(data.accountName, 34),
      SIDE_MARGIN,
      y,
    );
    y += 30;
    document.font("Helvetica").fontSize(10).fillColor("#60736C").text(
      `Every posting recorded against this account, ${data.periodLabel}.`,
      SIDE_MARGIN,
      y,
      { width: CONTENT_WIDTH },
    );
    y += 24;

    drawColumnHeader();

    // The opening balance is a row rather than a note: read downwards, it is
    // the figure every balance after it is built on.
    row([
      { text: "", x: columns[0].x, width: columns[0].width },
      { text: "Opening balance", x: columns[1].x, width: columns[1].width, bold: true },
      { text: "", x: columns[2].x, width: columns[2].width },
      { text: "", x: columns[3].x, width: columns[3].width },
      { text: formatKes(data.openingBalance), x: columns[4].x, width: columns[4].width, align: "right", bold: true },
    ]);

    if (data.rows.length === 0) {
      row([
        { text: "", x: columns[0].x, width: columns[0].width },
        { text: "Nothing was recorded in this period.", x: columns[1].x, width: CONTENT_WIDTH - 78, color: "#60736C" },
      ]);
    }

    for (const entry of data.rows) {
      const details = entry.detail ? `${entry.description} · ${entry.detail}` : entry.description;
      row([
        { text: formatDay(entry.date), x: columns[0].x, width: columns[0].width },
        { text: details, x: columns[1].x, width: columns[1].width },
        { text: entry.moneyIn > 0 ? formatKes(entry.moneyIn) : "", x: columns[2].x, width: columns[2].width, align: "right", color: "#1B7A4B" },
        { text: entry.moneyOut > 0 ? formatKes(entry.moneyOut) : "", x: columns[3].x, width: columns[3].width, align: "right", color: "#A13A2E" },
        { text: formatKes(entry.balance), x: columns[4].x, width: columns[4].width, align: "right" },
      ]);
    }

    ensureRoom(26);
    document.rect(SIDE_MARGIN, y, CONTENT_WIDTH, 24).fill("#EAF3EE");
    document.font("Helvetica-Bold").fontSize(9).fillColor("#103A2D");
    document.text("Closing balance", columns[1].x, y + 8, { width: columns[1].width, lineBreak: false });
    document.text(formatKes(data.totalIn), columns[2].x, y + 8, { width: columns[2].width, align: "right", lineBreak: false });
    document.text(formatKes(data.totalOut), columns[3].x, y + 8, { width: columns[3].width, align: "right", lineBreak: false });
    document.text(formatKes(data.closingBalance), columns[4].x, y + 8, { width: columns[4].width, align: "right", lineBreak: false });
    y += 34;

    // Named apart from the totals, because they are already inside them.
    if (data.borrowed > 0 || data.repaidToUs > 0 || data.lent > 0) {
      ensureRoom(58);
      document.font("Helvetica-Bold").fontSize(8).fillColor("#31584A").text("OF WHICH, NEITHER EARNED NOR SPENT", SIDE_MARGIN, y);
      y += 14;
      document.font("Helvetica").fontSize(9).fillColor("#243D33");
      const parts: string[] = [];
      if (data.borrowed > 0) parts.push(`borrowed ${formatKes(data.borrowed)}`);
      if (data.repaidToUs > 0) parts.push(`paid back to you ${formatKes(data.repaidToUs)}`);
      if (data.lent > 0) parts.push(`lent out ${formatKes(data.lent)}`);
      document.text(parts.join(" · "), SIDE_MARGIN, y, { width: CONTENT_WIDTH });
      y += 16;
      document.font("Helvetica").fontSize(8).fillColor("#60736C").text(
        "This money moved through the account without being earned or spent. It is inside the totals above, because it really did move the balance.",
        SIDE_MARGIN,
        y,
        { width: CONTENT_WIDTH },
      );
      y += 22;
    }

    ensureRoom(20);
    document.font("Helvetica").fontSize(7.5).fillColor("#8A9A94").text(
      "Recorded in Jamvi. This is your own record of the account, not a document issued by the bank.",
      SIDE_MARGIN,
      y,
      { width: CONTENT_WIDTH },
    );

    document.end();
  });
}
