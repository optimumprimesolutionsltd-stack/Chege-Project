import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canMakeGroupPersonal,
  canRemovePersonalBudget,
  makeGroupPersonal,
  makePersonalBudgetShared,
  makePersonalConfirmation,
  makeSharedConfirmation,
  removeUnusedPersonalBudget,
} from "./budget-conversion";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe('"Make this my Personal budget" is offered', () => {
  const owner = { userId: "me", role: "owner" };
  const shared = { isPrivate: false };

  it("to the owner of a Shared group they are alone in", () => {
    expect(canMakeGroupPersonal({ group: shared, members: [owner], userId: "me" })).toBe(true);
  });
  it("not while anybody else is in it, a viewer included", () => {
    expect(canMakeGroupPersonal({ group: shared, members: [owner, { userId: "l", role: "member" }], userId: "me" })).toBe(false);
    expect(canMakeGroupPersonal({ group: shared, members: [owner, { userId: "v", role: "viewer" }], userId: "me" })).toBe(false);
  });
  it("not to an admin, nor in a Personal budget, nor before members load", () => {
    expect(canMakeGroupPersonal({ group: shared, members: [{ userId: "me", role: "admin" }], userId: "me" })).toBe(false);
    expect(canMakeGroupPersonal({ group: { isPrivate: true }, members: [owner], userId: "me" })).toBe(false);
    expect(canMakeGroupPersonal({ group: shared, members: undefined, userId: "me" })).toBe(false);
  });
});

describe('"Remove my unused Personal budget" is offered', () => {
  it("only when there is one and nothing is recorded in it", () => {
    expect(canRemovePersonalBudget({ exists: true, empty: true })).toBe(true);
    expect(canRemovePersonalBudget({ exists: true, empty: false })).toBe(false);
    expect(canRemovePersonalBudget({ exists: false, empty: false })).toBe(false);
    expect(canRemovePersonalBudget(undefined)).toBe(false);
  });
});

describe("the confirmations", () => {
  it("turning into a group warns that invitees see everything, past entries included", () => {
    expect(makeSharedConfirmation("lydiah and chege").message)
      .toContain("Everyone you invite will see everything in this budget, including past entries.");
  });
  it("the swap says what happens to the Personal budget they already have", () => {
    expect(makePersonalConfirmation("x", { exists: false, empty: false }).message).toContain("You don't have a Personal budget now");
    expect(makePersonalConfirmation("x", { exists: true, empty: true }).message).toContain("so it will be removed");
    expect(makePersonalConfirmation("x", { exists: true, empty: false }).message).toContain('"Old personal budget"');
  });
});

describe("the calls", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(status: number, body: unknown) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("send cookies to the right endpoints", async () => {
    const fetchMock = stubFetch(200, { id: 3 });
    await makePersonalBudgetShared("Us", "family");
    await makeGroupPersonal(7);
    await removeUnusedPersonalBudget();
    expect(fetchMock.mock.calls.map(([url, init]) => [url, (init as RequestInit).method, (init as RequestInit).credentials])).toEqual([
      ["/api/workspaces/personal/make-shared", "POST", "include"],
      ["/api/workspaces/7/make-personal", "POST", "include"],
      ["/api/workspaces/personal", "DELETE", "include"],
    ]);
  });

  it("surface the server's own sentence on a refusal", async () => {
    stubFetch(409, { error: "Lydiah is also in it" });
    await expect(makeGroupPersonal(7)).rejects.toThrow("Lydiah is also in it");
  });
});

describe("web wiring", () => {
  const component = read("../components/budget-conversion.tsx");
  const settings = read("../pages/settings.tsx");
  const myGroups = read("../pages/my-groups.tsx");

  it("resets every cached answer and goes Home after a conversion or removal", () => {
    const settle = component.slice(component.indexOf("function useSettle"), component.indexOf("export function TurnPersonalIntoGroup"));
    expect(settle).toContain("await queryClient.resetQueries();");
    expect(settle).toContain('navigate("/");');
    expect(component.match(/await settle\(\);/g)?.length).toBe(3);
  });

  it("turning into a group needs the subscription, like starting one", () => {
    expect(component).toContain("mayStartGroup(entitlements)");
  });

  it("shows each option only in its situation", () => {
    expect(settings).toContain("{isPrivateWorkspace ? <TurnPersonalIntoGroup /> : null}");
    expect(settings).toContain("canMakeGroupPersonal({ group, members, userId: user?.id })");
    expect(component).toContain("if (!canRemovePersonalBudget(status)) return null;");
    expect(myGroups).toContain("<RemoveUnusedPersonalBudget />");
  });

  it("never calls the Personal budget free", () => {
    expect(read("../components/budget-chooser.tsx")).not.toMatch(/free, private/i);
    expect(myGroups).toContain("Your Jamvi subscription covers it");
  });
});
