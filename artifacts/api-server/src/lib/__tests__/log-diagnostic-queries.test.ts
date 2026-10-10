import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The phone's Import M-Pesa reports arrived but were cut off by the logger
// (10 Oct 2026): only the health check keeps its query, and only 2,000 characters.
describe("request logs", () => {
  const app = readFileSync(join(__dirname, "../../app.ts"), "utf8");
  it("drop every query except the health check's", () => {
    expect(app).toContain('url: req.url?.startsWith("/api/healthz?") ? req.url.slice(0, 2000) : req.url?.split("?")[0],');
  });
});
