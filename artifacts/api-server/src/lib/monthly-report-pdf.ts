import PDFDocument from "pdfkit";
import { drawBrandMark } from "./brand-mark";

type CategoryRow = {
  category: string;
  budgetAmount: number;
  spentAmount: number;
  remaining: number;
  percentUsed: number;
};

/** One line of a list section: an expense, a receipt. */
export type ReportEntryRow = { date: string; description: string; detail: string; amount: number };

/** One side hustle's profit and loss. */
export type ReportBusinessRow = { name: string; sales: number; costOfGoodsSold: number; grossProfit: number; expenses: number; netProfit: number };

/** Somebody in Who owes who with something between you. */
export type ReportDebtRow = { name: string; owedToUs: number; owedByUs: number };

type IncomeStreamRow = {
  sourceName: string;
  ownerName: string;
  total: number;
  sharePercent: number;
  transactionCount: number;
};

export type MonthlyReportPdfData = {
  groupName: string;
  /** What the report covers: a month ("September 2026") or a day range. */
  monthLabel: string;
  /**
   * False when `monthLabel` names a day range rather than a whole month, so
   * the wording stops calling itself monthly. A handed-out PDF that says
   * "monthly report" across the top while covering nine days misrepresents
   * its own contents.
   */
  coversWholeMonth?: boolean;
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  expenseCount: number;
  /** Whether to include the Budget performance table. Defaults to true. */
  includeBudget?: boolean;
  categories: CategoryRow[];
  /** Whether to include the Income-stream funding table. Defaults to true. */
  includeIncome?: boolean;
  totalFunding: number;
  incomeStreams: IncomeStreamRow[];
  /** Whether to include the four summary figures at the top. Defaults to true. */
  includeSummary?: boolean;
  /** Each side hustle's profit and loss; left out when absent. */
  businesses?: ReportBusinessRow[];
  /** How the expense list is laid out: by date (the default), or a section per category or per item with its subtotal. */
  expensesGroupedBy?: "category" | "item";
  /** With expensesGroupedBy, each section's total and count only - no entries under it. */
  expensesSummary?: boolean;
  /** How the income list is laid out: by date (the default), or a section per income stream with its subtotal. */
  incomeGroupedBy?: "stream";
  /** With incomeGroupedBy, each stream's total and count only - no entries under it. */
  incomeSummary?: boolean;
  /** The budget as planned - each heading, its sub-categories and their budgets - with no spending beside it. */
  budgetPlan?: Array<{ name: string; budget: number; business?: boolean; children: Array<{ name: string; budget: number }> }>;
  /** Every expense in the period, newest first; left out when absent. */
  expenses?: ReportEntryRow[];
  /** Every piece of income in the period, newest first; left out when absent. */
  incomeEntries?: ReportEntryRow[];
  /** Who owes whom, as it stands now; left out when absent. */
  debts?: ReportDebtRow[];
  /** Bank fees for the month. Kept out of totalSpent - a fee is not spending
   *  on the group's purposes - but shown as its own line. */
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
        Title: `${data.monthLabel} ${data.coversWholeMonth === false ? "report" : "monthly report"}`,
        Author: "Jamvi",
        Subject: "Shared group report",
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
    document.font("Helvetica-Bold").fontSize(22).fillColor("#103A2D").text(
      data.coversWholeMonth === false ? "Financial report" : "Monthly financial report",
      SIDE_MARGIN,
      y,
    );
    y += 30;
    document.font("Helvetica").fontSize(10).fillColor("#60736C").text(
      "A clear snapshot of your shared group, spending, and recorded income-stream funding.",
      SIDE_MARGIN,
      y,
      { width: CONTENT_WIDTH },
    );
    y += 33;

    if (data.includeSummary !== false) {
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
    }

    if (data.includeBudget !== false) {
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
      y += 16;
    }

    if (data.includeIncome !== false) {
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
    }

    // A list: date, what, where it went or came from, amount - with its total.
    const entryList = (title: string, description: string, detailLabel: string, rows: ReportEntryRow[], empty: string) => {
      y += 16;
      sectionTitle(title, description);
      const columns = [
        { label: "Date", x: SIDE_MARGIN, width: 56 },
        { label: "Description", x: SIDE_MARGIN + 60, width: 200 },
        { label: detailLabel, x: SIDE_MARGIN + 264, width: 150 },
        { label: "Amount", x: SIDE_MARGIN + 418, width: 93, align: "right" as const },
      ];
      tableHeader(columns);
      if (rows.length === 0) {
        tableRow([{ text: empty, x: SIDE_MARGIN, width: CONTENT_WIDTH, color: "#60736C" }], 28);
        return;
      }
      rows.forEach((row) => {
        tableRow([
          { text: row.date.slice(8, 10) + "/" + row.date.slice(5, 7) + "/" + row.date.slice(2, 4), x: SIDE_MARGIN, width: 56 },
          { text: row.description, x: SIDE_MARGIN + 60, width: 200 },
          { text: row.detail, x: SIDE_MARGIN + 264, width: 150, color: "#60736C" },
          { text: formatKes(row.amount), x: SIDE_MARGIN + 418, width: 93, align: "right" },
        ], 20);
      });
      tableRow([
        { text: rows.length + (rows.length === 1 ? " entry" : " entries"), x: SIDE_MARGIN, width: 260, color: "#60736C" },
        { text: formatKes(rows.reduce((sum, row) => sum + row.amount, 0)), x: SIDE_MARGIN + 418, width: 93, align: "right" },
      ], 22);
    };

    // Expenses a section at a time - per category, or per item - each with its
    // entries and subtotal, the biggest first: the way All expenses shows them.
    // Summary keeps only each section's band - its name, count and total.
    const groupedEntryList = (by: "category" | "item" | "stream", rows: ReportEntryRow[], summary = false) => {
      y += 16;
      const titles = {
        category: ["Expenses by category", "Every expense in the period under the category it was filed under, the biggest category first."],
        item: ["Expenses by item", "Every expense in the period under what it was for, the biggest first."],
        stream: ["Income by income stream", "Every piece of income in the period under the income stream it came from, the biggest first. A split deposit sits under each of its streams at that stream's share."],
      } as const;
      const [title, description] = titles[by];
      sectionTitle(
        summary ? title + " - summary" : title,
        summary ? description.replace(/^Every (expense|piece of income) in the period under/, (_, what: string) => "The total of every " + what + " in the period for") : description,
      );
      if (rows.length === 0) {
        tableRow([{ text: by === "stream" ? "No income was recorded in this period." : "No expenses were recorded in this period.", x: SIDE_MARGIN, width: CONTENT_WIDTH, color: "#60736C" }], 28);
        return;
      }
      const groups = new Map<string, { label: string; rows: ReportEntryRow[]; total: number }>();
      for (const row of rows) {
        const label = (by === "item" ? row.description : row.detail).trim() || "Uncategorized";
        const key = label.toLowerCase();
        const group = groups.get(key) ?? { label, rows: [], total: 0 };
        group.rows.push(row);
        group.total += row.amount;
        groups.set(key, group);
      }
      for (const group of [...groups.values()].sort((a, b) => b.total - a.total)) {
        ensureRoom(46);
        document.rect(SIDE_MARGIN, y, CONTENT_WIDTH, 22).fill("#EAF3EE");
        document.font("Helvetica-Bold").fontSize(9.5).fillColor("#103A2D")
          .text(compactText(group.label, 50), SIDE_MARGIN + 8, y + 7, { width: 330, lineBreak: false });
        document.font("Helvetica").fontSize(8).fillColor("#60736C")
          .text(group.rows.length + (group.rows.length === 1 ? " entry" : " entries"), SIDE_MARGIN + 330, y + 8, { width: 80, align: "right", lineBreak: false });
        document.font("Helvetica-Bold").fontSize(9.5).fillColor("#103A2D")
          .text(formatKes(group.total), SIDE_MARGIN + 418, y + 7, { width: 93, align: "right", lineBreak: false });
        y += 24;
        if (!summary) group.rows.forEach((row) => {
          tableRow([
            { text: row.date.slice(8, 10) + "/" + row.date.slice(5, 7) + "/" + row.date.slice(2, 4), x: SIDE_MARGIN, width: 56 },
            { text: by === "item" ? row.detail : row.description, x: SIDE_MARGIN + 60, width: 350 },
            { text: formatKes(row.amount), x: SIDE_MARGIN + 418, width: 93, align: "right" },
          ], 20);
        });
        y += 6;
      }
      tableRow([
        { text: `Total, ${rows.length} ${rows.length === 1 ? "entry" : "entries"} in ${groups.size} ${{ category: groups.size === 1 ? "category" : "categories", item: groups.size === 1 ? "item" : "items", stream: groups.size === 1 ? "income stream" : "income streams" }[by]}`, x: SIDE_MARGIN, width: 400, color: "#31584A" },
        { text: formatKes(rows.reduce((sum, row) => sum + row.amount, 0)), x: SIDE_MARGIN + 418, width: 93, align: "right" },
      ], 24);
    };

    if (data.budgetPlan) {
      y += 16;
      sectionTitle("Budget plan", "What is budgeted for, under each heading. A heading's budget is its sub-categories added up.");
      const columns = [
        { label: "Category", x: SIDE_MARGIN, width: 380 },
        { label: "Budget", x: SIDE_MARGIN + 384, width: 127, align: "right" as const },
      ];
      tableHeader(columns);
      if (data.budgetPlan.length === 0) {
        tableRow([{ text: "Nothing is budgeted for yet.", x: SIDE_MARGIN, width: CONTENT_WIDTH, color: "#60736C" }], 28);
      }
      for (const heading of data.budgetPlan) {
        ensureRoom(24);
        document.font("Helvetica-Bold").fontSize(9).fillColor("#103A2D")
          .text(compactText(heading.name + (heading.business ? "  (income stream)" : ""), 60), SIDE_MARGIN, y + 6, { width: 380, lineBreak: false });
        document.text(formatKes(heading.budget), SIDE_MARGIN + 384, y + 6, { width: 127, align: "right", lineBreak: false });
        document.moveTo(SIDE_MARGIN, y + 22).lineTo(PAGE_WIDTH - SIDE_MARGIN, y + 22).strokeColor("#E6ECE9").lineWidth(0.5).stroke();
        y += 22;
        for (const child of heading.children) {
          tableRow([
            { text: `    ${child.name}`, x: SIDE_MARGIN, width: 380, color: "#31584A" },
            { text: formatKes(child.budget), x: SIDE_MARGIN + 384, width: 127, align: "right", color: "#31584A" },
          ], 20);
        }
      }
      const planTotal = data.budgetPlan.filter((heading) => !heading.business).reduce((sum, heading) => sum + heading.budget, 0);
      const businessTotal = data.budgetPlan.filter((heading) => heading.business).reduce((sum, heading) => sum + heading.budget, 0);
      tableRow([
        { text: "Household total", x: SIDE_MARGIN, width: 380, color: "#103A2D" },
        { text: formatKes(planTotal), x: SIDE_MARGIN + 384, width: 127, align: "right", color: "#103A2D" },
      ], 24);
      if (businessTotal > 0) {
        tableRow([
          { text: "Income-stream costs, budgeted apart", x: SIDE_MARGIN, width: 380, color: "#60736C" },
          { text: formatKes(businessTotal), x: SIDE_MARGIN + 384, width: 127, align: "right", color: "#60736C" },
        ], 22);
      }
    }

    if (data.businesses) {
      y += 16;
      sectionTitle("Business", "Profit and loss for each business: sales, the cost of the goods sold, then its running expenses.");
      const columns = [
        { label: "Business", x: SIDE_MARGIN, width: 116 },
        { label: "Sales", x: SIDE_MARGIN + 118, width: 76, align: "right" as const },
        { label: "Cost of goods", x: SIDE_MARGIN + 196, width: 76, align: "right" as const },
        { label: "Gross profit", x: SIDE_MARGIN + 274, width: 76, align: "right" as const },
        { label: "Expenses", x: SIDE_MARGIN + 352, width: 76, align: "right" as const },
        { label: "Net profit", x: SIDE_MARGIN + 430, width: 81, align: "right" as const },
      ];
      tableHeader(columns);
      if (data.businesses.length === 0) {
        tableRow([{ text: "No business has its costs linked yet.", x: SIDE_MARGIN, width: CONTENT_WIDTH, color: "#60736C" }], 28);
      }
      data.businesses.forEach((business) => {
        tableRow([
          { text: business.name, x: SIDE_MARGIN, width: 116 },
          { text: formatKes(business.sales), x: SIDE_MARGIN + 118, width: 76, align: "right" },
          { text: formatKes(business.costOfGoodsSold), x: SIDE_MARGIN + 196, width: 76, align: "right" },
          { text: formatKes(business.grossProfit), x: SIDE_MARGIN + 274, width: 76, align: "right" },
          { text: formatKes(business.expenses), x: SIDE_MARGIN + 352, width: 76, align: "right" },
          { text: formatKes(business.netProfit), x: SIDE_MARGIN + 430, width: 81, align: "right", color: business.netProfit < 0 ? "#C44B3E" : "#0A7A54" },
        ]);
      });
    }

    if (data.expenses && data.expensesGroupedBy) {
      groupedEntryList(data.expensesGroupedBy, data.expenses, data.expensesSummary);
    } else if (data.expenses) {
      entryList("Expenses", "Every expense in the period, newest first, with the category it was filed under.", "Category", data.expenses, "No expenses were recorded in this period.");
    }

    if (data.incomeEntries && data.incomeGroupedBy) {
      groupedEntryList(data.incomeGroupedBy, data.incomeEntries, data.incomeSummary);
    } else if (data.incomeEntries) {
      entryList("Income", "Every piece of income in the period, newest first, with its income stream. Money borrowed, repaid or moved between your own accounts is not income and is not listed.", "Income stream", data.incomeEntries, "No income was recorded in this period.");
    }

    if (data.debts) {
      y += 16;
      sectionTitle("Who owes who", "As it stands on the day this report was made.");
      const columns = [
        { label: "Person or business", x: SIDE_MARGIN, width: 250 },
        { label: "Owes you", x: SIDE_MARGIN + 254, width: 125, align: "right" as const },
        { label: "You owe", x: SIDE_MARGIN + 383, width: 128, align: "right" as const },
      ];
      tableHeader(columns);
      if (data.debts.length === 0) {
        tableRow([{ text: "Nobody owes anything either way.", x: SIDE_MARGIN, width: CONTENT_WIDTH, color: "#60736C" }], 28);
      }
      data.debts.forEach((debt) => {
        tableRow([
          { text: debt.name, x: SIDE_MARGIN, width: 250 },
          { text: debt.owedToUs > 0 ? formatKes(debt.owedToUs) : "-", x: SIDE_MARGIN + 254, width: 125, align: "right", color: "#0A7A54" },
          { text: debt.owedByUs > 0 ? formatKes(debt.owedByUs) : "-", x: SIDE_MARGIN + 383, width: 128, align: "right", color: "#C44B3E" },
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