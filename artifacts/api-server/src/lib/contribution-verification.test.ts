import { describe, expect, it } from "vitest";
import { groupVerifyCode, resolveVerifyCode } from "./contribution-verification";

describe("contribution report verification codes", () => {
  it("round-trips a group id through a code", () => {
    for (const id of [1, 7, 42, 1000, 999999]) {
      expect(resolveVerifyCode(groupVerifyCode(id))).toBe(id);
    }
  });

  it("is case-insensitive and tolerates surrounding whitespace", () => {
    const code = groupVerifyCode(42);
    expect(resolveVerifyCode(`  ${code.toUpperCase()} `)).toBe(42);
  });

  it("rejects a code whose signature does not match its group", () => {
    const real = groupVerifyCode(42);
    const forged = real.replace(/-.*/, "-0000000000");
    expect(resolveVerifyCode(forged)).toBeNull();
  });

  it("rejects a code for a different group by swapping the id part", () => {
    const [, sig] = groupVerifyCode(42).split("-");
    expect(resolveVerifyCode(`${(43).toString(36)}-${sig}`)).toBeNull();
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "nope", "42", "42-", "-abcdef0123", "zz-xyz"]) {
      expect(resolveVerifyCode(bad)).toBeNull();
    }
  });
});
