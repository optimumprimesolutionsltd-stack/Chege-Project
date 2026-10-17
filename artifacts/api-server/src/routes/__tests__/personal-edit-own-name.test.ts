import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// "0 of 2 filed. HTTP 403: Personal account activity must be recorded in your
// own name" (17 Oct 2026): Search filed two money-in entries without naming
// anyone, and the entries carried no name - every such edit was refused.
describe("an edit in a Personal budget that names nobody", () => {
  const route = readFileSync("src/routes/joint-account.ts", "utf8");

  it("is the owner's, the only one who can open it", () => {
    expect(route).toContain("? (req.group?.isPrivate && req.user?.id ? req.user.id : existing.madeById)");
  });

  it("still keeps a shared group's entry under whoever it was", () => {
    const at = route.indexOf("const requestedMadeById = parsed.data.madeById === undefined");
    expect(route.slice(at, at + 200)).toContain(": existing.madeById)");
    expect(route).toContain("if (!requireMemberSelfAttribution(req, res, requestedAttributions)) return;");
  });
});
