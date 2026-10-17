import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanTimes } from "../mpesa-times";

const src = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8");

// "Can we have timestamps for the mpesa?" (17 Oct 2026).
describe("M-Pesa times", () => {
  it("keeps only well-formed pairs, one per receipt", () => {
    expect(cleanTimes([
      { receipt: "sjk3abc123", time: "15:42" },
      { receipt: "SJK3ABC123", time: "15:43" },
      { receipt: "bad!", time: "10:00" },
      { receipt: "SJK3ABC124", time: "25:00" },
      null,
    ])).toEqual([{ receipt: "SJK3ABC123", time: "15:43" }]);
    expect(cleanTimes("nope")).toEqual([]);
  });

  it("adds the column before the server listens, and fills entries by receipt", () => {
    const index = src("index.ts");
    expect(index.indexOf(`ADD COLUMN IF NOT EXISTS "time_of_day" text`)).toBeLessThan(index.indexOf("app.listen("));
    const lib = src("lib/mpesa-times.ts");
    expect(lib).toContain(`AND tx."mpesa_receipt" = known."receipt"`);
    expect(lib).toContain(`AND tx."time_of_day" IS NULL`);
  });

  it("fills them in when an import save job finishes", () => {
    expect(src("lib/import-save-jobs.ts")).toContain("void fillMpesaTimes(job.group_id).catch(() => {});");
    expect(src("routes/index.ts")).toContain("router.use(mpesaTimesRouter);");
  });
});
