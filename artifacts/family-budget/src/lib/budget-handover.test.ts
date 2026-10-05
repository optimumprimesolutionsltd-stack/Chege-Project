import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handoverSteps, mayUseHandover, type HandoverInput } from "./budget-handover";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const owner = { userId: "me", role: "owner" };
const current = (input: HandoverInput) => handoverSteps(input).find((step) => step.state === "current")?.id;

describe("the handover guide on the web", () => {
  it("walks a Personal budget from turning it shared to the optional leave", () => {
    expect(current({ isPrivate: true, userId: "me", members: [owner], invitations: [] })).toBe("make-shared");
    expect(current({ isPrivate: false, userId: "me", members: [owner], invitations: [] })).toBe("invite");
    expect(current({
      isPrivate: false, userId: "me", members: [owner], invitations: [{ id: 1, email: "x@example.com", status: "pending" }],
    })).toBe("accept");
    expect(current({
      isPrivate: false, userId: "me", members: [owner, { userId: "w", role: "member" }], invitations: [],
    })).toBe("make-owner");
    expect(current({
      isPrivate: false, userId: "me", members: [{ userId: "me", role: "admin" }, { userId: "w", role: "owner" }], invitations: [],
    })).toBe("leave");
  });

  it("is not offered to a plain member", () => {
    expect(mayUseHandover({
      isPrivate: false, userId: "me", members: [{ userId: "me", role: "member" }, { userId: "o", role: "owner" }], invitations: [],
    })).toBe(false);
  });

  it("opens from Settings for a Personal budget and for a group's owner", () => {
    const settings = read("../pages/settings.tsx");
    expect(settings).toContain('<Link href="/handover" data-testid="button-handover">');
    expect(settings).toContain('isPrivateWorkspace || myMembership?.role === "owner"');
    expect(read("../App.tsx")).toContain('<Route path="/handover" component={BudgetHandover} />');
  });
});
