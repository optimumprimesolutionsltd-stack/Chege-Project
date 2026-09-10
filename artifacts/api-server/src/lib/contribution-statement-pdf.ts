import { randomBytes } from "node:crypto";
import PDFDocument from "pdfkit";

export type StatementPdfEntry = {
  /** YYYY-MM-DD */
  date: string;
  name: string;
  amount: number;
  source: "recorded" | "deposit";
  description: string | null;
  /** The bank account a deposit landed in; null for a hand-recorded entry. */
  bankName?: string | null;
};

export type ContributionStatementPdfData = {
  groupName: string;
  periodLabel: string;
  /** Set for a one-member statement; absent for the whole-group ledger. */
  memberName?: string;
  /** Oldest first. */
  entries: StatementPdfEntry[];
  /** The member's total, or the group grand total. */
  total: number;
  /** Group ledger only: a total per member, shown after the entries. */
  perMemberTotals: Array<{ name: string; total: number }>;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const SIDE_MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - SIDE_MARGIN * 2;
const BOTTOM_LIMIT = PAGE_HEIGHT - 52;

function formatKes(value: number): string {
  const absolute = Math.abs(Math.round(value)).toLocaleString("en-KE");
  return value < 0 ? `-KES ${absolute}` : `KES ${absolute}`;
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function compactText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

/**
 * A contribution statement as a PDF: one member's dated entries with a running
 * total for handing that person their record, or the whole group's ledger for
 * an AGM. Same green Jamvi header and table styling as the monthly report.
 */
export function createContributionStatementPdf(data: ContributionStatementPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const perMember = data.memberName == null;
    const document = new PDFDocument({
      size: "A4",
      margin: SIDE_MARGIN,
      compress: false,
      info: {
        Title: data.memberName
          ? `${data.memberName} — contribution statement`
          : `${data.groupName} — contribution ledger`,
        Author: "Jamvi",
        Subject: "Contribution statement",
      },
      // Opens with no password but marked read-only, like the report.
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
      document.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(19).text("JAMVI", SIDE_MARGIN, 25);
      document.font("Helvetica").fontSize(9).fillColor("#D7F3E8").text(
        continued
          ? `${data.memberName ?? "Group"} statement ${data.periodLabel} — continued`
          : `Contribution statement ${data.periodLabel}`,
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
    const ensureRoom = (height: number) => {
      if (y + height <= BOTTOM_LIMIT) return;
      document.addPage();
      header(true);
      drawColumnHeader();
    };

    const columns = perMember
      ? [
          { label: "Date", x: SIDE_MARGIN, width: 90 },
          { label: "Type", x: SIDE_MARGIN + 96, width: 110 },
          { label: "Amount", x: SIDE_MARGIN + 300, width: 100, align: "right" as const },
          { label: "Running total", x: SIDE_MARGIN + 404, width: 107, align: "right" as const },
        ]
      : [
          { label: "Date", x: SIDE_MARGIN, width: 84 },
          { label: "Member", x: SIDE_MARGIN + 90, width: 170 },
          { label: "Type", x: SIDE_MARGIN + 264, width: 130 },
          { label: "Amount", x: SIDE_MARGIN + 398, width: 113, align: "right" as const },
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
    const row = (cells: Array<{ text: string; x: number; width: number; align?: "left" | "right"; bold?: boolean; color?: string }>, height = 20) => {
      ensureRoom(height + 1);
      document.moveTo(SIDE_MARGIN, y + height).lineTo(PAGE_WIDTH - SIDE_MARGIN, y + height).strokeColor("#E6ECE9").lineWidth(0.5).stroke();
      for (const cell of cells) {
        document
          .font(cell.bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(8.5)
          .fillColor(cell.color ?? "#243D33")
          .text(compactText(cell.text, 40), cell.x, y + 6, {
            width: cell.width,
            align: cell.align ?? "left",
            lineBreak: false,
          });
      }
      y += height;
    };

    header();
    document.font("Helvetica-Bold").fontSize(22).fillColor("#103A2D").text(
      data.memberName ? `${data.memberName} — contributions` : "Contribution ledger",
      SIDE_MARGIN,
      y,
    );
    y += 30;
    document.font("Helvetica").fontSize(10).fillColor("#60736C").text(
      data.memberName
        ? `Every contribution recorded for ${data.memberName}, ${data.periodLabel}.`
        : `Every contribution and attributed bank deposit for the group, ${data.periodLabel}.`,
      SIDE_MARGIN,
      y,
      { width: CONTENT_WIDTH },
    );
    y += 30;

    drawColumnHeader();

    if (data.entries.length === 0) {
      row([{ text: "Nothing recorded for this period.", x: SIDE_MARGIN, width: CONTENT_WIDTH, color: "#60736C" }], 26);
    } else {
      let running = 0;
      for (const entry of data.entries) {
        running += entry.amount;
        const typeLabel =
          entry.source === "deposit" ? entry.bankName || "Bank deposit" : "Recorded";
        row(
          perMember
            ? [
                { text: formatDay(entry.date), x: columns[0].x, width: columns[0].width },
                { text: typeLabel, x: columns[1].x, width: columns[1].width, color: "#60736C" },
                { text: formatKes(entry.amount), x: columns[2].x, width: columns[2].width, align: "right" },
                { text: formatKes(running), x: columns[3].x, width: columns[3].width, align: "right", bold: true },
              ]
            : [
                { text: formatDay(entry.date), x: columns[0].x, width: columns[0].width },
                { text: entry.name, x: columns[1].x, width: columns[1].width },
                { text: typeLabel, x: columns[2].x, width: columns[2].width, color: "#60736C" },
                { text: formatKes(entry.amount), x: columns[3].x, width: columns[3].width, align: "right" },
              ],
        );
      }
    }

    y += 6;
    ensureRoom(24);
    document.rect(SIDE_MARGIN, y, CONTENT_WIDTH, 22).fill("#EAF7F0");
    document.font("Helvetica-Bold").fontSize(10).fillColor("#0A7A54").text(
      `${data.memberName ? "Total contributed" : "Group total"}: ${formatKes(data.total)}`,
      SIDE_MARGIN + 10,
      y + 6,
      { width: CONTENT_WIDTH - 20 },
    );
    y += 34;

    if (!perMember && data.perMemberTotals.length > 0) {
      ensureRoom(30);
      document.font("Helvetica-Bold").fontSize(11).fillColor("#103A2D").text("By member", SIDE_MARGIN, y);
      y += 18;
      for (const member of [...data.perMemberTotals].sort((a, b) => b.total - a.total)) {
        row(
          [
            { text: member.name, x: SIDE_MARGIN, width: CONTENT_WIDTH - 120 },
            { text: formatKes(member.total), x: SIDE_MARGIN + CONTENT_WIDTH - 120, width: 120, align: "right", bold: true },
          ],
          18,
        );
      }
    }

    y += 16;
    ensureRoom(24);
    document.font("Helvetica").fontSize(7.5).fillColor("#738279").text(
      "Generated by Jamvi from the group’s records. Amounts are shown in Kenyan shillings (KES). A recorded entry with no bank date is filed at the start of its month.",
      SIDE_MARGIN,
      y,
      { width: CONTENT_WIDTH, align: "center" },
    );
    document.end();
  });
}
