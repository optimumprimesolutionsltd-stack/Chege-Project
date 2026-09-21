import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createMonthlyReportPdf } from "../monthly-report-pdf";
import { BRAND_MARK } from "../brand-mark";

describe("monthly report PDF", () => {
  it("draws a report for a budget with nothing in it yet", async () => {
    // The first thing a new budget's owner is likely to try, and the shape
    // that has no rows to iterate — every total zero, every list empty.
    const pdf = await createMonthlyReportPdf({
      groupName: "Personal budget",
      monthLabel: "September 2026",
      totalBudget: 0,
      totalSpent: 0,
      remaining: 0,
      expenseCount: 0,
      categories: [],
      totalFunding: 0,
      incomeStreams: [],
    });
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("puts the Jamvi mark in the header, not just the wordmark", async () => {
    const pdf = await createMonthlyReportPdf({
      groupName: "Lydiah and Chege",
      monthLabel: "September 2026",
      totalBudget: 0,
      totalSpent: 0,
      remaining: 0,
      expenseCount: 0,
      categories: [],
      totalFunding: 0,
      incomeStreams: [],
    });
    expect(BRAND_MARK).not.toBeNull();
    // An embedded raster is an image XObject; a text-only page has none, so
    // this fails if the mark silently stops being found.
    expect(/\/Subtype\s*\/Image/.test(pdf.toString("latin1"))).toBe(true);
  });

  // The build copies the mark beside the bundle for the same reason it copies
  // the font metrics: a bundled server cannot reach back into the repository.
  it("keeps the build step that puts the mark beside the bundle", () => {
    const build = readFileSync(new URL("../../../build.mjs", import.meta.url), "utf8");
    expect(build).toContain("copyBrandMark");
    expect(build).toContain("await copyBrandMark(distDir);");
    expect(build).toContain("jamvi-mark-inline.png");
  });

  // pdfkit reads the metrics for its built-in fonts from `__dirname/data/*.afm`
  // at runtime. esbuild does not carry data files across a bundle, so the built
  // server threw ENOENT on the first PDF it drew and the route answered 500 —
  // while this suite stayed green, because running from source finds the files
  // in node_modules. Nothing below can run the bundle, so it guards the build
  // step that makes the bundle whole.
  it("keeps the build step that puts pdfkit's font metrics beside the bundle", () => {
    const build = readFileSync(new URL("../../../build.mjs", import.meta.url), "utf8");
    expect(build).toContain("copyPdfkitFontMetrics");
    expect(build).toContain("await copyPdfkitFontMetrics(distDir);");
    expect(build).toContain('requireFromHere.resolve("pdfkit")');
    // It must fail the build rather than ship a server that cannot draw.
    expect(build).toContain("the built server cannot draw a PDF");
  });
});
