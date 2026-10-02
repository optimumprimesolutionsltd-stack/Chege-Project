import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { START_GROUP_NEEDS_SUBSCRIPTION, startGroupRefusal } from "./group-start";

describe("starting a new Shared group", () => {
  it("is allowed while the trial or subscription is active, or with no subscription row", () => {
    expect(startGroupRefusal({ fullAccess: true, status: "trial" })).toBeNull();
    expect(startGroupRefusal({ fullAccess: true, status: "active" })).toBeNull();
    expect(startGroupRefusal({ fullAccess: false, status: null })).toBeNull();
  });

  it("is refused once it has ended, with a way forward rather than an error code", () => {
    expect(startGroupRefusal({ fullAccess: false, status: "trial" })).toBe(START_GROUP_NEEDS_SUBSCRIPTION);
    expect(startGroupRefusal({ fullAccess: false, status: "expired" })).toBe(START_GROUP_NEEDS_SUBSCRIPTION);
  });

  it("is checked by POST /groups before anything is written, as a 402", () => {
    const route = readFileSync(new URL("../routes/group.ts", import.meta.url), "utf8");
    const handler = route.slice(route.indexOf('router.post("/groups"'));
    const refusal = handler.indexOf("await refuseStartingGroup(req.user!.id)");
    expect(refusal).toBeGreaterThan(0);
    expect(refusal).toBeLessThan(handler.indexOf("db.transaction"));
    expect(handler).toContain("res.status(402).json({ error: refusal })");
  });
});
