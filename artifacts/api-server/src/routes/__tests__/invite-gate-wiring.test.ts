/**
 * Every way into a group answers to the invite gate.
 *
 * The gate itself was never the hard part - the bug was that no route called
 * it. A unit test of requireInviteEligibility passes happily while the paywall
 * leaks, so this checks the wiring instead: each way of bringing somebody into
 * a group must consult it, and each way of taking access away must not.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(__dirname, "..", file), "utf8");

/** The handler body for one route, up to the start of the next one. */
function handler(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  expect(start, `${declaration} should exist`).toBeGreaterThan(-1);
  const rest = source.slice(start + declaration.length);
  const next = rest.search(/\n\w[\w.]*\.(post|get|patch|delete)\(/);
  return next === -1 ? rest : rest.slice(0, next);
}

const WAYS_IN: Array<[string, string]> = [
  ["invitations.ts", 'invitationsRouter.post("/group-invitations"'],
  ["invitations.ts", 'invitationsRouter.post("/group-invitations/batch"'],
  ["invitations.ts", 'invitationsRouter.post("/group-invitations/:id/resend"'],
  ["invite-links.ts", 'inviteLinksRouter.post("/group-invite-links"'],
  ["view-links.ts", 'viewLinksRouter.post("/group-view-links"'],
  ["members.ts", 'router.post("/members"'],
];

describe("every way of bringing somebody in is gated", () => {
  it.each(WAYS_IN)("%s %s", (file, declaration) => {
    expect(handler(read(file), declaration)).toContain("requireInviteEligibility");
  });
});

const WAYS_OUT: Array<[string, string]> = [
  ["invitations.ts", 'invitationsRouter.delete("/group-invitations/:id"'],
  ["invite-links.ts", 'inviteLinksRouter.delete("/group-invite-links/:id"'],
  ["view-links.ts", 'viewLinksRouter.delete("/group-view-links"'],
];

describe("taking access away stays open", () => {
  // A lapsed manager who spots a stale join link must still be able to kill it.
  // Revocation is a safety action, and putting it behind a payment would be the
  // one place where lapsing makes a group less safe rather than less capable.
  it.each(WAYS_OUT)("%s %s", (file, declaration) => {
    expect(handler(read(file), declaration)).not.toContain("requireInviteEligibility");
  });
});
