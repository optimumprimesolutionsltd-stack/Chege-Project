/**
 * Where the contributions cards sit on the page.
 *
 * They had ended up nested inside the month picker - flex children of a small
 * `flex items-center` pill, wedged between the previous-month and next-month
 * arrows. Being flex items of a row that never wraps, they were pushed past
 * the arrow and could not shrink, so on a phone the card started two thirds of
 * the way across and ran off the right edge.
 *
 * The markup was valid and it typechecked. Only the rendered page was wrong,
 * which is why this asserts on structure rather than on classes.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./contributions.tsx", import.meta.url)),
  "utf8",
);

const monthPicker = source.slice(
  source.indexOf('<div className="flex items-center gap-1 bg-card rounded-xl p-1 border shadow-sm">'),
  source.indexOf("{/* How it works banner */}"),
);

describe("contributions page layout", () => {
  it("keeps the cards out of the month picker", () => {
    const picker = monthPicker.slice(0, monthPicker.indexOf("handleNextMonth"));

    expect(picker).not.toContain("<RecordContributions />");
    expect(picker).not.toContain("<ContributionsGrid canManage={canManageContributions} />");
  });

  it("still renders them", () => {
    // The obvious way to make the test above pass is to delete them.
    expect(source).toContain("<RecordContributions />");
    expect(source).toContain("<ContributionsGrid canManage={canManageContributions} />");
  });

  it("renders them after the header, at page level", () => {
    const headerEnd = source.indexOf("handleNextMonth");
    expect(source.indexOf("<RecordContributions />")).toBeGreaterThan(headerEnd);
  });

  it("keeps them together in one stack, in order", () => {
    const record = source.indexOf("<RecordContributions />");
    const grid = source.indexOf("<ContributionsGrid canManage={canManageContributions} />");

    // Recording comes before the sheet: a treasurer opens this to enter the
    // month, not to read last month.
    expect(record).toBeLessThan(grid);
    expect(source.slice(record, grid)).not.toContain("</div>\n      </div>");
  });
});
