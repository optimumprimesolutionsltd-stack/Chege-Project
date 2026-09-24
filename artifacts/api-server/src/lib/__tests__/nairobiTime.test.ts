import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentNairobiMonthYear, nairobiNow } from "../nairobiTime";

describe("nairobiNow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is three hours ahead of the server's own UTC clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T10:00:00.000Z"));
    expect(nairobiNow().toISOString()).toBe("2026-09-15T13:00:00.000Z");
  });
});

describe("currentNairobiMonthYear", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("agrees with the server's own UTC date away from midnight", () => {
    vi.setSystemTime(new Date("2026-09-15T10:00:00.000Z"));
    expect(currentNairobiMonthYear()).toEqual({ month: 9, year: 2026 });
  });

  // 21:30 UTC on the last day of a month is already 00:30 the 1st in
  // Nairobi — the exact window this whole file exists for. A server reading
  // its own UTC clock here would still call it September; Nairobi has
  // already turned over to October.
  it("has already turned the month over when the server's own UTC clock has not", () => {
    vi.setSystemTime(new Date("2026-09-30T21:30:00.000Z"));
    expect(currentNairobiMonthYear()).toEqual({ month: 10, year: 2026 });
  });

  // Same shift at a year boundary: 21:30 UTC on 31 Dec is already the 1st of
  // January in Nairobi.
  it("has already turned the year over when the server's own UTC clock has not", () => {
    vi.setSystemTime(new Date("2026-12-31T21:30:00.000Z"));
    expect(currentNairobiMonthYear()).toEqual({ month: 1, year: 2027 });
  });
});
