import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const routeBody = (source: string, start: string) => source.slice(source.indexOf(start), source.indexOf(start) + 500);

// A PDF is a copy that leaves Jamvi and can be forwarded, so only an owner or
// admin may produce one. Members and viewers read the same figures on screen.
describe("PDF downloads are for owners and admins only", () => {
  it.each([
    ["../dashboard.ts", 'router.get("/dashboard/monthly-report.pdf"'],
    ["../joint-account.ts", 'router.get("/joint-account/statement.pdf"'],
    ["../contributors.ts", 'router.get("/contributions/report.pdf"'],
    ["../contributors.ts", 'router.get("/contributions/statement.pdf"'],
  ])("%s %s requires a group manager", (file, start) => {
    expect(routeBody(read(file), start)).toContain("requireGroupManager(req, res)");
  });
});
