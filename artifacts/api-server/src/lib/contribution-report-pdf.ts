import PDFDocument from "pdfkit";

export type ContributionReportRow = {
  name: string;
  /** Expected per month, or null where giving is voluntary. */
  monthlyTarget: number | null;
  /** One figure per month in `months`, same order. */
  amounts: number[];
  total: number;
  /** Still owed per month after an earlier surplus is carried forward. Null
   *  where there is no expected amount. Same length/order as `months`. */
  outstanding: Array<number | null>;
  /** Paid past the last month once every month is settled. */
  creditRemaining: number;
};

export type ContributionReportPdfData = {
  groupName: string;
  /** "Apr 2026 – Sep 2026", or a single month. */
  periodLabel: string;
  /** Oldest first, already narrowed to the chosen range. */
  months: Array<{ label: string }>;
  rows: ContributionReportRow[];
  grandTotal: number;
  /** Sum of every member's expected amount over the whole period. */
  totalExpected: number;
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

/**
 * The month-by-month contribution sheet as a PDF, for handing a chama or church
 * their record or forwarding it to the group's WhatsApp. Same green Jamvi
 * header and table styling as the monthly financial report so a group that has
 * seen one recognises the other.
 *
 * "Expected" is each member's monthly amount times the months in the range;
 * "Given" is the plain sum recorded. A surplus carried from an earlier month
 * settles the ones that follow, so somebody who paid ahead reads as up to date
 * rather than as behind.
 */
export function createContributionReportPdf(data: ContributionReportPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: "A4",
      margin: SIDE_MARGIN,
      compress: false,
      info: {
        Title: `Contributions ${data.periodLabel}`,
        Author: "Jamvi",
        Subject: "Group contribution report",
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
        continued ? `Contributions ${data.periodLabel} — continued` : `Contributions ${data.periodLabel}`,
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
    const tableRow = (
      columns: Array<{ text: string; x: number; width: number; align?: "left" | "right"; color?: string; bold?: boolean }>,
      height = 22,
    ) => {
      ensureRoom(height + 1);
      document.moveTo(SIDE_MARGIN, y + height).lineTo(PAGE_WIDTH - SIDE_MARGIN, y + height).strokeColor("#E6ECE9").lineWidth(0.5).stroke();
      columns.forEach((column) => {
        document
          .font(column.bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(8.5)
          .fillColor(column.color ?? "#243D33")
          .text(compactText(column.text, 40), column.x, y + 6, {
            width: column.width,
            align: column.align ?? "left",
            lineBreak: false,
          });
      });
      y += height;
    };

    const monthCount = data.months.length;
    const behindCount = data.rows.filter((row) =>
      row.outstanding.some((owed) => owed !== null && owed > 0),
    ).length;
    const shortfall = Math.max(0, data.totalExpected - data.grandTotal);

    header();
    document.font("Helvetica-Bold").fontSize(22).fillColor("#103A2D").text("Contribution report", SIDE_MARGIN, y);
    y += 30;
    document.font("Helvetica").fontSize(10).fillColor("#60736C").text(
      `Who has paid, ${data.periodLabel}. Expected is each member's monthly amount across ${monthCount === 1 ? "this month" : `these ${monthCount} months`}; given is what was recorded.`,
      SIDE_MARGIN,
      y,
      { width: CONTENT_WIDTH },
    );
    y += 33;

    const summaryCards = [
      { label: "Members", value: String(data.rows.length), color: "#31584A" },
      { label: "Collected", value: formatKes(data.grandTotal), color: "#0A7A54" },
      { label: "Expected", value: formatKes(data.totalExpected), color: "#31584A" },
      {
        label: shortfall > 0 ? "Short" : "On track",
        value: shortfall > 0 ? formatKes(shortfall) : formatKes(0),
        color: shortfall > 0 ? "#C44B3E" : "#0A7A54",
      },
    ];
    const cardWidth = (CONTENT_WIDTH - 24) / 4;
    summaryCards.forEach((card, index) => {
      const x = SIDE_MARGIN + index * (cardWidth + 8);
      document.roundedRect(x, y, cardWidth, 58, 6).fill("#F5F8F6");
      document.font("Helvetica-Bold").fontSize(7.5).fillColor("#60736C").text(card.label.toUpperCase(), x + 9, y + 11, { width: cardWidth - 18 });
      document.font("Helvetica-Bold").fontSize(10).fillColor(card.color).text(card.value, x + 9, y + 29, { width: cardWidth - 18 });
    });
    y += 78;

    if (behindCount > 0) {
      ensureRoom(24);
      document.font("Helvetica").fontSize(8.5).fillColor("#A16408").text(
        `${behindCount} ${behindCount === 1 ? "member is" : "members are"} behind on the expected amount for this period.`,
        SIDE_MARGIN,
        y,
        { width: CONTENT_WIDTH },
      );
      y += 22;
    }

    sectionTitle("Expected vs given", "One line per member over the selected range. A surplus from an earlier month covers the months that follow.");
    const columns = [
      { label: "Member", x: SIDE_MARGIN, width: 150 },
      { label: "Expected", x: SIDE_MARGIN + 154, width: 96, align: "right" as const },
      { label: "Given", x: SIDE_MARGIN + 254, width: 96, align: "right" as const },
      { label: "Standing", x: SIDE_MARGIN + 354, width: 157, align: "right" as const },
    ];
    tableHeader(columns);
    if (data.rows.length === 0) {
      tableRow([{ text: "No contributors in this budget yet.", x: SIDE_MARGIN, width: CONTENT_WIDTH, color: "#60736C" }], 28);
    } else {
      for (const row of data.rows) {
        const expected = row.monthlyTarget != null ? row.monthlyTarget * monthCount : null;
        const totalOwed = row.outstanding.reduce<number>((sum, owed) => sum + (owed ?? 0), 0);
        let standing = "—";
        let standingColor = "#60736C";
        if (expected != null) {
          if (totalOwed > 0) {
            standing = `Short ${formatKes(totalOwed)}`;
            standingColor = "#C44B3E";
          } else if (row.creditRemaining > 0) {
            standing = `${formatKes(row.creditRemaining)} ahead`;
            standingColor = "#0A7A54";
          } else {
            standing = "Up to date";
            standingColor = "#0A7A54";
          }
        }
        tableRow([
          { text: row.name, x: SIDE_MARGIN, width: 150, bold: true },
          { text: expected != null ? formatKes(expected) : "—", x: SIDE_MARGIN + 154, width: 96, align: "right", color: "#60736C" },
          { text: formatKes(row.total), x: SIDE_MARGIN + 254, width: 96, align: "right" },
          { text: standing, x: SIDE_MARGIN + 354, width: 157, align: "right", color: standingColor },
        ]);

        const strip = data.months
          .map((month, index) => {
            const paid = row.amounts[index] ?? 0;
            return `${month.label}: ${paid ? formatKes(paid) : "—"}`;
          })
          .join("    ");
        ensureRoom(16);
        document.font("Helvetica").fontSize(7.5).fillColor("#738279").text(strip, SIDE_MARGIN + 6, y + 3, { width: CONTENT_WIDTH - 6 });
        y += 17;
      }
      tableRow(
        [
          { text: "Group total", x: SIDE_MARGIN, width: 150, bold: true },
          { text: formatKes(data.totalExpected), x: SIDE_MARGIN + 154, width: 96, align: "right", bold: true, color: "#60736C" },
          { text: formatKes(data.grandTotal), x: SIDE_MARGIN + 254, width: 96, align: "right", bold: true },
          {
            text: shortfall > 0 ? `Short ${formatKes(shortfall)}` : "On track",
            x: SIDE_MARGIN + 354,
            width: 157,
            align: "right",
            bold: true,
            color: shortfall > 0 ? "#C44B3E" : "#0A7A54",
          },
        ],
        24,
      );
    }

    y += 20;
    ensureRoom(30);
    document.font("Helvetica").fontSize(7.5).fillColor("#738279").text(
      "Generated by Jamvi from the active group’s data. Amounts are shown in Kenyan shillings (KES).",
      SIDE_MARGIN,
      y,
      { width: CONTENT_WIDTH, align: "center" },
    );
    document.end();
  });
}
