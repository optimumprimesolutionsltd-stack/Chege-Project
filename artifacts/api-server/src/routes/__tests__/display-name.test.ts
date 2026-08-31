import { describe, expect, it } from "vitest";
import { UpdateDisplayNameBody } from "../auth";

describe("display name validation", () => {
  it.each([
    "🙂 let's go? $",
    "Élodie Ng",
    "नाम • 家",
  ])("accepts printable Unicode display name %s", (name) => {
    expect(UpdateDisplayNameBody.parse({ name }).name).toBe(name);
  });

  it.each([
    "name\nwith line break",
    "name\u0000with control character",
    "   ",
  ])("rejects unsafe or empty display name %j", (name) => {
    expect(() => UpdateDisplayNameBody.parse({ name })).toThrow();
  });
});