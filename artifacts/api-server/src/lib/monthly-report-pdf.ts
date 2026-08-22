import PDFDocument from "pdfkit";

type CategoryRow = {
  category: string;
  budgetAmount: number;
  spentAmount: number;
  remaining: number;
  percentUsed: number;
};

type IncomeStreamRow = {
  sourceName: string;
  ownerName: string;
  total: number;
  sharePercent: number;
  transactionCount: number;
};

export type MonthlyReportPdfData = {
  groupName: string;
  monthLabel: string;
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  expenseCount: number;
  categories: CategoryRow[];
  totalFunding: number;
  incomeStreams: IncomeStreamRow[];
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

function compactText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function createMonthlyReportPdf(data: MonthlyReportPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: "A4",
      margin: SIDE_MARGIN,
      compress: false,
      info: {
        Title: `${data.monthLabel} monthly report`,
        Author: "Jamvi",
        Subject: "Shared group budget report",
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
        continued ? `${data.monthLabel} report — continued` : `${data.monthLabel} shared group report`,
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
    };
    const sectionTitle = (title: string, description?: string) => {
      ensureRoom(description ? 48 : 30);
      document.font("Helvetica-Bold").fontSize(14).fillColor("#103A2D").text(title, SIDE_MARGIN, y);
      y += 19;
      if (description) {
        document.font("Helvetica").fontSize(8.5).fillColor("#60736C").text(description, SIDE_MARGIN, y, { width: CONTENT_WIDTH });
        y += 18;
      }
      document.moveTo(SIDE_MARGIN, y).lineTo(PAGE_WIDTH - SIDE_MARGIN, y).strokeColor("#D7E3DD").lineWidth(0.7).stroke();
      y += 10;
    };
    const tableHeader = (columns: Array<{ label: string; x: number; width: number; align?: "left" | "right" }>) => {
      ensureRoom(22);
      document.rect(SIDE_MARGIN, y, CONTENT_WIDTH, 19).fill("#EAF3EE");
      document.font("Helvetica-Bold").fontSize(7.5).fillColor("#31584A");
      columns.forEach((column) => {
        document.text(column.label.toUpperCase(), column.x, y + 6, { width: column.width, align: column.align ?? "left", lineBreak: false });
      });
      y += 20;
    };
    const tableRow = (columns: Array<{ text: string; x: number; width: number; align?: "left" | "right"; color?: string }>, height = 22) => {
      ensureRoom(height + 1);
      document.moveTo(SIDE_MARGIN, y + height).lineTo(PAGE_WIDTH - SIDE_MARGIN, y + height).strokeColor("#E6ECE9").lineWidth(0.5).stroke();
      document.font("Helvetica").fontSize(8.5);
      columns.forEach((column) => {
        document.fillColor(column.color ?? "#243D33").text(compactText(column.text, 38), column.x, y + 6, {
          width: column.width,
          align: column.align ?? "left",
          lineBreak: false,
        });
      });
      y += height;
    };

    header();
    document.font("Helvetica-Bold").fontSize(22).fillColor("#103A2D").text("Monthly financial report", SIDE_MARGIN, y);
    y += 30;
    document.font("Helvetica").fontSize(10).fillColor("#60736C").text(
      "A clear snapshot of your shared budget, spending, and recorded income-stream funding.",
      SIDE_MARGIN,
      y,
      { width: CONTENT_WIDTH },
    );
    y += 33;

    const summaryCards = [
      { label: "Total budget", value: formatKes(data.totalBudget), color: "#0A7A54" },
      { label: "Total spent", value: formatKes(data.totalSpent), color: "#C44B3E" },
      { label: data.remaining < 0 ? "Over budget" : "Remaining", value: formatKes(Math.abs(data.remaining)), color: data.remaining < 0 ? "#C44B3E" : "#0A7A54" },
      { label: "Expense records", value: String(data.expenseCount), color: "#31584A" },
    ];
    const cardWidth = (CONTENT_WIDTH - 24) / 4;
    summaryCards.forEach((card, index) => {
      const x = SIDE_MARGIN + index * (cardWidth + 8);
      document.roundedRect(x, y, cardWidth, 58, 6).fill("#F5F8F6");
      document.font("Helvetica-Bold").fontSize(7.5).fillColor("#60736C").text(card.label.toUpperCase(), x + 9, y + 11, { width: cardWidth - 18 });
      document.font("Helvetica-Bold").fontSize(10).fillColor(card.color).text(card.value, x + 9, y + 29, { width: cardWidth - 18 });
    });
    y += 78;

    sectionTitle("Budget performance", "Budgeted categories and their actual spending for the selected month.");
    const categoryColumns = [
      { label: "Category", x: SIDE_MARGIN, width: 160 },
      { label: "Budget", x: SIDE_MARGIN + 164, width: 94, align: "right" as const },
      { label: "Spent", x: SIDE_MARGIN + 262, width: 94, align: "right" as const },
      { label: "Remaining", x: SIDE_MARGIN + 360, width: 105, align: "right" as const },
      { label: "Used", x: SIDE_MARGIN + 469, width: 42, align: "right" as const },
    ];
    tableHeader(categoryColumns);
    if (data.categories.length === 0) {
      tableRow([{ text: "No budget categories were set for this month.", x: SIDE_MARGIN, width: CONTENT_WIDTH, color: "#60736C" }], 28);
    } else {
      data.categories.forEach((category) => {
        const remainingLabel = category.remaining < 0 ? `Over by ${formatKes(Math.abs(category.remaining))}` : formatKes(category.remaining);
        tableRow([
          { text: category.category, x: SIDE_MARGIN, width: 160 },
          { text: formatKes(category.budgetAmount), x: SIDE_MARGIN + 164, width: 94, align: "right" },
          { text: formatKes(category.spentAmount), x: SIDE_MARGIN + 262, width: 94, align: "right" },
          { text: remainingLabel, x: SIDE_MARGIN + 360, width: 105, align: "right", color: category.remaining < 0 ? "#C44B3E" : "#31584A" },
          { text: `${Math.round(category.percentUsed)}%`, x: SIDE_MARGIN + 469, width: 42, align: "right" },
        ]);
      });
    }
    y += 24;

    sectionTitle("Income-stream funding", "Personal expense portions, shared-bank deposits, and personal savings additions. Joint-bank expense portions are excluded.");
    ensureRoom(53);
    document.roundedRect(SIDE_MARGIN, y, CONTENT_WIDTH, 46, 6).fill("#EAF7F0");
    document.font("Helvetica-Bold").fontSize(8).fillColor("#31584A").text("RECORDED PERSONAL FUNDING", SIDE_MARGIN + 12, y + 10);
    document.font("Helvetica-Bold").fontSize(18).fillColor("#0A7A54").text(formatKes(data.totalFunding), SIDE_MARGIN + 12, y + 22);
    y += 61;
    const incomeColumns = [
      { label: "Income stream", x: SIDE_MARGIN, width: 170 },
      { label: "Owner", x: SIDE_MARGIN + 174, width: 110 },
      { label: "Total", x: SIDE_MARGIN + 288, width: 92, align: "right" as const },
      { label: "Share", x: SIDE_MARGIN + 384, width: 52, align: "right" as const },
      { label: "Records", x: SIDE_MARGIN + 440, width: 71, align: "right" as const },
    ];
    tableHeader(incomeColumns);
    if (data.incomeStreams.length === 0) {
      tableRow([{ text: "No personal funding was recorded for this month.", x: SIDE_MARGIN, width: CONTENT_WIDTH, color: "#60736C" }], 28);
    } else {
      data.incomeStreams.forEach((stream) => {
        tableRow([
          { text: stream.sourceName, x: SIDE_MARGIN, width: 170, color: stream.sourceName === "Unattributed" ? "#A16408" : "#243D33" },
          { text: stream.ownerName, x: SIDE_MARGIN + 174, width: 110 },
          { text: formatKes(stream.total), x: SIDE_MARGIN + 288, width: 92, align: "right" },
          { text: `${stream.sharePercent}%`, x: SIDE_MARGIN + 384, width: 52, align: "right" },
          { text: String(stream.transactionCount), x: SIDE_MARGIN + 440, width: 71, align: "right" },
        ]);
      });
    }

    y += 24;
    ensureRoom(34);
    document.font("Helvetica").fontSize(7.5).fillColor("#738279").text(
      "Generated by Jamvi from the active group’s data. Amounts are shown in Kenyan shillings (KES).",
      SIDE_MARGIN,
      y,
      { width: CONTENT_WIDTH, align: "center" },
    );
    document.end();
  });
}