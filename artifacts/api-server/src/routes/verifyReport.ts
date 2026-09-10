/**
 * The public page a contribution report points at.
 *
 * A treasurer's PDF or WhatsApp message carries a code; this page turns that
 * code back into the group's live figures so a recipient can hold the two side
 * by side. No sign-in — the code is the key, and it only ever reveals what the
 * group's own members already see on the contributions screen.
 */

import { Router, type IRouter } from "express";
import { db, groupsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveVerifyCode } from "../lib/contribution-verification";
import { loadContributionGrid } from "./contributors";

const router: IRouter = Router();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function kes(value: number): string {
  const absolute = Math.abs(Math.round(value)).toLocaleString("en-KE");
  return value < 0 ? `-KES ${absolute}` : `KES ${absolute}`;
}

function page(title: string, body: string, status: number, res: import("express").Response): void {
  res
    .status(status)
    .type("html")
    .set("Cache-Control", "no-store")
    .set("X-Robots-Tag", "noindex")
    .send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  body { font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #10241c;
         background: #f4f8f6; margin: 0; padding: 24px; }
  .sheet { max-width: 620px; margin: 0 auto; background: #fff; border-radius: 16px;
           box-shadow: 0 1px 3px rgba(16,36,28,.12); overflow: hidden; }
  .head { background: #0A3D2E; color: #fff; padding: 20px 24px; display: flex; align-items: center; gap: 12px; }
  .head img { width: 34px; height: 34px; }
  .head b { font-size: 17px; letter-spacing: .5px; }
  .head span { display: block; font-size: 12px; color: #cfeadd; font-weight: 400; }
  .body { padding: 20px 24px 24px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .muted { color: #5b7168; font-size: 13px; margin: 0 0 16px; }
  .verified { display: inline-flex; align-items: center; gap: 6px; background: #e6f4ec; color: #0a7a54;
              font-size: 12px; font-weight: 600; border-radius: 999px; padding: 4px 10px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 8px 4px; border-bottom: 1px solid #eef2f0; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 700; border-top: 2px solid #d7e3dd; border-bottom: none; }
  .short { color: #c44b3e; }
  .ahead { color: #0a7a54; }
  .note { margin-top: 18px; font-size: 12px; color: #5b7168; }
  .foot { text-align: center; font-size: 12px; color: #8aa79b; padding: 16px; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <img src="/branding/jamvi-mark.png" alt="Jamvi" onerror="this.style.display='none'" />
      <b>JAMVI<span>Verified contribution record</span></b>
    </div>
    <div class="body">${body}</div>
  </div>
  <p class="foot">jamvi.co.ke</p>
</body>
</html>`);
}

router.get("/r/:code", async (req, res, next): Promise<void> => {
  // Only this exact shape is ours; anything else belongs to the SPA below.
  const groupId = resolveVerifyCode(req.params.code ?? "");
  if (groupId === null) {
    if (!req.accepts("html")) return next();
    page(
      "Report not found — Jamvi",
      `<h1>This link could not be checked</h1>
       <p class="muted">The code is not one Jamvi recognises. Ask whoever sent the report for the link again.</p>`,
      404,
      res,
    );
    return;
  }

  const [group] = await db
    .select({ name: groupsTable.name })
    .from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .limit(1);

  if (!group) {
    page(
      "Report not found — Jamvi",
      `<h1>This link could not be checked</h1>
       <p class="muted">The group this report belongs to is no longer in Jamvi.</p>`,
      404,
      res,
    );
    return;
  }

  const grid = await loadContributionGrid(groupId, 12);
  const monthCount = grid.months.length;
  const asAt = new Date().toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" });
  const period =
    monthCount === 0
      ? ""
      : monthCount === 1
        ? grid.months[0].label
        : `${grid.months[0].label} – ${grid.months[monthCount - 1].label}`;

  let expectedTotal = 0;
  const rowsHtml = grid.rows
    .map((row) => {
      const expected = row.monthlyTarget != null ? row.monthlyTarget * monthCount : null;
      if (expected != null) expectedTotal += expected;
      const owed = row.outstanding.reduce<number>((sum, value) => sum + (value ?? 0), 0);
      let standing = "&mdash;";
      if (expected != null) {
        standing =
          owed > 0
            ? `<span class="short">short ${escapeHtml(kes(owed))}</span>`
            : row.creditRemaining > 0
              ? `<span class="ahead">${escapeHtml(kes(row.creditRemaining))} ahead</span>`
              : `<span class="ahead">up to date</span>`;
      }
      return `<tr><td>${escapeHtml(row.name)}</td><td class="n">${
        expected != null ? escapeHtml(kes(expected)) : "&mdash;"
      }</td><td class="n">${escapeHtml(kes(row.total))}</td><td class="n">${standing}</td></tr>`;
    })
    .join("");

  const body = `
    <span class="verified">✓ Verified from Jamvi</span>
    <h1>${escapeHtml(group.name)} — contributions</h1>
    <p class="muted">${escapeHtml(period)} &middot; as at ${escapeHtml(asAt)}</p>
    <table>
      <thead>
        <tr><th>Member</th><th class="n">Expected</th><th class="n">Given</th><th class="n">Standing</th></tr>
      </thead>
      <tbody>${rowsHtml || `<tr><td colspan="4" class="muted">No contributors recorded yet.</td></tr>`}</tbody>
      <tfoot>
        <tr><td>Group</td><td class="n">${escapeHtml(kes(expectedTotal))}</td><td class="n">${escapeHtml(
          kes(grid.grandTotal),
        )}</td><td class="n"></td></tr>
      </tfoot>
    </table>
    <p class="note">These figures come straight from ${escapeHtml(
      group.name,
    )}'s records in Jamvi and update as new contributions are entered. Compare them with the report you were sent — if a number does not match, the report was changed after it left Jamvi.</p>`;

  page(`${group.name} contributions — Jamvi`, body, 200, res);
});

export default router;
