import { describe, expect, it } from "vitest";
import { summarizePayouts } from "../payouts";

const members = [
  { id: 1, name: "Mary" },
  { id: 2, name: "John" },
  { id: 3, name: "Grace" },
];

describe("summarizePayouts", () => {
  it("starts at round 1 with nobody having received", () => {
    const result = summarizePayouts([], members);
    expect(result.nextRound).toBe(1);
    expect(result.totalPaidOut).toBe(0);
    expect(result.members).toEqual([
      { id: 1, name: "Mary", timesReceived: 0, lastRound: null },
      { id: 2, name: "John", timesReceived: 0, lastRound: null },
      { id: 3, name: "Grace", timesReceived: 0, lastRound: null },
    ]);
  });

  it("advances the round and tracks who has had a turn", () => {
    const result = summarizePayouts(
      [
        { roundNumber: 1, contributorId: 2, amount: 30000 },
        { roundNumber: 2, contributorId: 1, amount: 32000 },
      ],
      members,
    );
    expect(result.nextRound).toBe(3);
    expect(result.totalPaidOut).toBe(62000);
    expect(result.members).toEqual([
      { id: 1, name: "Mary", timesReceived: 1, lastRound: 2 },
      { id: 2, name: "John", timesReceived: 1, lastRound: 1 },
      { id: 3, name: "Grace", timesReceived: 0, lastRound: null },
    ]);
  });

  it("counts a second turn and keeps the latest round", () => {
    const result = summarizePayouts(
      [
        { roundNumber: 1, contributorId: 1, amount: 10000 },
        { roundNumber: 2, contributorId: 2, amount: 10000 },
        { roundNumber: 3, contributorId: 3, amount: 10000 },
        { roundNumber: 4, contributorId: 1, amount: 10000 },
      ],
      members,
    );
    expect(result.nextRound).toBe(5);
    expect(result.members[0]).toEqual({ id: 1, name: "Mary", timesReceived: 2, lastRound: 4 });
  });

  it("is not confused by payouts arriving newest-first", () => {
    const result = summarizePayouts(
      [
        { roundNumber: 3, contributorId: 3, amount: 10000 },
        { roundNumber: 2, contributorId: 2, amount: 10000 },
        { roundNumber: 1, contributorId: 1, amount: 10000 },
      ],
      members,
    );
    expect(result.nextRound).toBe(4);
  });

  it("stays sane when a middle round is removed, leaving a gap", () => {
    // Rounds 1, 2, 4 remain after round 3 was undone.
    const result = summarizePayouts(
      [
        { roundNumber: 1, contributorId: 1, amount: 10000 },
        { roundNumber: 2, contributorId: 2, amount: 10000 },
        { roundNumber: 4, contributorId: 1, amount: 10000 },
      ],
      members,
    );
    expect(result.nextRound).toBe(5);
    expect(result.totalPaidOut).toBe(30000);
    expect(result.members[0]).toEqual({ id: 1, name: "Mary", timesReceived: 2, lastRound: 4 });
    expect(result.members[2]).toEqual({ id: 3, name: "Grace", timesReceived: 0, lastRound: null });
  });
});
