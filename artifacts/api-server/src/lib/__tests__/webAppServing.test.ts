import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { attachWebBuild, defaultBuildDir } from "../webAppServing";

const directories: string[] = [];
const originalWorkingDirectory = process.cwd();

async function buildFixture(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "jamvi-web-build-"));
  directories.push(directory);
  await writeFile(
    path.join(directory, "index.html"),
    "<!doctype html><title>Jamvi</title>",
  );
  await writeFile(path.join(directory, "asset.txt"), "private budget");
  return directory;
}

afterEach(async () => {
  process.chdir(originalWorkingDirectory);
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe("attachWebBuild", () => {
  it("finds the sibling web build when started from the API package", () => {
    const apiServerDirectory = path.resolve(import.meta.dirname, "../../..");
    const expectedBuildDirectory = path.resolve(
      apiServerDirectory,
      "..",
      "family-budget",
      "dist",
      "public",
    );

    process.chdir(apiServerDirectory);

    expect(defaultBuildDir()).toBe(expectedBuildDirectory);
  });

  it("serves static files and the SPA shell for browser routes", async () => {
    const app = express();
    attachWebBuild(app, { enabled: true, buildDir: await buildFixture() });

    await expect(request(app).get("/asset.txt")).resolves.toMatchObject({
      status: 200,
      text: "private budget",
    });
    await expect(
      request(app).get("/settings").set("Accept", "text/html"),
    ).resolves.toMatchObject({
      status: 200,
      text: expect.stringContaining("<title>Jamvi</title>"),
    });
  });

  it("leaves API requests for the API router", async () => {
    const app = express();
    attachWebBuild(app, { enabled: true, buildDir: await buildFixture() });
    app.get("/api/healthz", (_req, res) => res.json({ ok: true }));

    await expect(
      request(app).get("/api/healthz").set("Accept", "text/html"),
    ).resolves.toMatchObject({
      status: 200,
      body: { ok: true },
    });
    await expect(
      request(app).get("/api/not-found").set("Accept", "text/html"),
    ).resolves.toMatchObject({
      status: 404,
    });
  });

  it("fails clearly when the built web app is absent", () => {
    const app = express();
    expect(() =>
      attachWebBuild(app, {
        enabled: true,
        buildDir: path.join(os.tmpdir(), "jamvi-web-build-missing"),
      }),
    ).toThrow("Build @workspace/family-budget before starting the API server.");
  });
});
