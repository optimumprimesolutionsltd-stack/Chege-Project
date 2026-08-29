import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bankScreenSource = readFileSync(
  resolve(process.cwd(), "app/(tabs)/bank.tsx"),
  "utf8",
);

describe("mobile bank transaction display", () => {
  it("shows the user-entered transaction date instead of the record creation timestamp", () => {
    expect(bankScreenSource).toContain("formatDateTime(item.date)");
    expect(bankScreenSource).not.toContain("formatDateTime(item.createdAt)");
  });
});