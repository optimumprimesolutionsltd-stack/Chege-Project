import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

// Asked 4 Oct 2026: "I can't do anything when Jamvi is saving... ensure saving
// still happens when I exit Jamvi and the app shows me where we are at."
describe("an M-Pesa import saved on the server", () => {
  const jobs = read("./import-save-jobs.ts");
  const route = read("../routes/import-save-jobs.ts");

  it("saves each entry through the ordinary routes, as the person, in their budget", () => {
    expect(jobs).toContain("Authorization: `Bearer ${sessionId}`");
    expect(jobs).toContain('"x-jamvi-workspace": String(groupId)');
    expect(route).toContain("const sessionId = getSessionId(req);");
  });

  it("keeps one job per person and budget, and shows it only to them", () => {
    expect(route).toContain('const current = await readJob(groupId, req.user.id, "current", false);');
    expect(jobs).toContain('WHERE "group_id" = ${groupId} AND "user_id" = ${userId}');
  });

  it("is carried on after a restart by whichever server holds the lease, and forgets the session when done", () => {
    expect(jobs).toContain('AND ("lease_until" IS NULL OR "lease_until" < now() OR "lease_owner" = ${ME})');
    expect(jobs).toContain('WHERE "id" = ${jobId} AND "lease_owner" = ${ME}');
    expect(jobs).toContain('"session_id" = NULL');
    expect(jobs).toContain("await markStarted(jobId, item.key);");
  });

  it("is made at startup, and recorded as migration 0054", () => {
    expect(read("../index.ts")).toContain("void ensureImportSaveJobs();");
    expect(read("../routes/index.ts")).toContain("router.use(importSaveJobsRouter);");
    const migration = read("../../../../lib/db/migrations/0054_import_save_jobs.sql");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "import_save_jobs"');
    expect(migration).toContain('"started" jsonb');
    expect(read("../../../../lib/db/migrations/meta/_journal.json")).toContain('"tag": "0054_import_save_jobs"');
  });
});
