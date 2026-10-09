import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { forgetAllReports, reportCache } from "../report-cache";

// A tiny app standing in for the API: who is asking (x-user) and in which budget
// (x-group) as requireMember would set them, one report that counts how often it
// is worked out, and a save.
function app() {
  let worked = 0;
  let total = 100;
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    const group = req.header("x-group");
    if (group) req.group = { id: Number(group), role: "owner", isPrivate: true } as typeof req.group;
    (req as unknown as { user: { id: string } }).user = { id: req.header("x-user") ?? "u1" };
    next();
  });
  server.use(reportCache);
  server.get("/dashboard/trends", (_req, res) => {
    worked += 1;
    res.json({ total, worked });
  });
  server.get("/dashboard/broken", (_req, res) => {
    worked += 1;
    res.status(500).json({ error: "no" });
  });
  server.post("/expenses", (req, res) => {
    total += Number(req.body.amount);
    res.status(201).json({ ok: true });
  });
  return { server, worked: () => worked };
}

describe("Reports remembered until their budget changes", () => {
  beforeEach(() => forgetAllReports());

  it("answers the same report again without working it out", async () => {
    const { server, worked } = app();
    const first = await request(server).get("/dashboard/trends").set("x-group", "1");
    const second = await request(server).get("/dashboard/trends").set("x-group", "1");
    expect(second.body).toEqual(first.body);
    expect(second.headers["x-report-cache"]).toBe("hit");
    expect(worked()).toBe(1);
  });

  it("works it out again once anything in that budget is saved", async () => {
    const { server, worked } = app();
    await request(server).get("/dashboard/trends").set("x-group", "1");
    await request(server).post("/expenses").set("x-group", "1").send({ amount: 50 });
    const after = await request(server).get("/dashboard/trends").set("x-group", "1");
    expect(after.body.total).toBe(150);
    expect(worked()).toBe(2);
  });

  it("keeps each budget and each person apart", async () => {
    const { server, worked } = app();
    await request(server).get("/dashboard/trends").set("x-group", "1");
    await request(server).get("/dashboard/trends").set("x-group", "2");
    await request(server).get("/dashboard/trends").set("x-group", "1").set("x-user", "u2");
    expect(worked()).toBe(3);
    // A save in budget 2 leaves budget 1's report kept.
    await request(server).post("/expenses").set("x-group", "2").send({ amount: 1 });
    const one = await request(server).get("/dashboard/trends").set("x-group", "1");
    expect(one.headers["x-report-cache"]).toBe("hit");
  });

  it("a different address is a different report", async () => {
    const { server, worked } = app();
    await request(server).get("/dashboard/trends?months=6").set("x-group", "1");
    await request(server).get("/dashboard/trends?months=12").set("x-group", "1");
    expect(worked()).toBe(2);
  });

  it("never keeps a failed answer, or one with no budget", async () => {
    const { server, worked } = app();
    await request(server).get("/dashboard/broken").set("x-group", "1");
    await request(server).get("/dashboard/broken").set("x-group", "1");
    await request(server).get("/dashboard/trends");
    await request(server).get("/dashboard/trends");
    expect(worked()).toBe(4);
  });
});
