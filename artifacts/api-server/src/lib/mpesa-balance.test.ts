import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MPESA_NAME, nairobiToday, pickMpesaAccount } from "./mpesa-balance";

// Asked for 3 Oct 2026: the Home card's money in and out "is not giving the
// true state of affairs" - show the M-Pesa balance, to check against the app.
describe("the M-Pesa balance on the Home card", () => {
  it("finds the M-Pesa account by its name, else by where the M-Pesa entries are", () => {
    for (const name of ["M-Pesa", "Mpesa", "M Pesa", "My MPESA wallet"]) expect(MPESA_NAME.test(name)).toBe(true);
    expect(MPESA_NAME.test("Equity bank")).toBe(false);
    const accounts = [{ id: 1, name: "Equity bank" }, { id: 2, name: "Wallet" }, { id: 3, name: "M-Pesa" }];
    expect(pickMpesaAccount(accounts, new Map([[1, 50]]))).toBe(3);
    const unnamed = [{ id: 1, name: "Equity bank" }, { id: 2, name: "Wallet" }];
    expect(pickMpesaAccount(unnamed, new Map([[1, 2], [2, 40]]))).toBe(2);
    expect(pickMpesaAccount(unnamed, new Map())).toBeNull();
  });

  it("counts up to today in Kenya, and the summary returns it", () => {
    expect(nairobiToday(new Date("2026-10-03T22:30:00Z"))).toBe("2026-10-04");
    const route = readFileSync("src/routes/mpesa-import.ts", "utf8");
    expect(route).toContain("const balance = await mpesaBalance(groupId, nairobiToday()).catch(() => null);");
    expect(route).toContain("balance: balance?.balance ?? null,");
    const lib = readFileSync("src/lib/mpesa-balance.ts", "utf8");
    expect(lib).toContain("lte(jointAccountTxTable.date, today)");
  });

  it("is shown on the phone and web Home cards", () => {
    expect(readFileSync("../mobile-budget/components/MpesaImportCard.tsx", "utf8")).toContain('testID="mpesa-home-card-balance"');
    expect(readFileSync("../family-budget/src/components/mpesa-import-card.tsx", "utf8")).toContain('data-testid="mpesa-home-card-balance"');
  });
});
