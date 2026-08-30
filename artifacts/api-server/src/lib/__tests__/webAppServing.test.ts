import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { attachWebBuild, defaultBuildDir } from "../webAppServing";

const directories: string[] = [];
const originalWorkingDirectory = process.cwd();

async function buildFixture(title = "Jamvi"): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "jamvi-web-build-"));
  directories.push(directory);
  await writeFile(
    path.join(directory, "index.html"),
    `<!doctype html><title>${title}</title>`,
  );
  await writeFile(path.join(directory, "asset.txt"), "private budget");
  return directory;
}

/**
 * Writes a prerendered route the way generate-seo-pages.mjs does: a directory
 * named for the route, holding an index.html with that page's own metadata.
 */
async function writePrerenderedRoute(
  buildDirectory: string,
  route: string,
  title: string,
): Promise<void> {
  const routeDirectory = path.join(buildDirectory, route);
  await mkdir(routeDirectory, { recursive: true });
  await writeFile(
    path.join(routeDirectory, "index.html"),
    `<!doctype html><title>${title}</title>`,
  );
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

  it("keeps the legacy single-build mounting behavior", async () => {
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

  it(
    "serves marketing at the root and the authenticated app under /app/",
    async () => {
      const app = express();
      attachWebBuild(app, {
        enabled: true,
        marketingBuildDir: await buildFixture("Jamvi marketing"),
        appBuildDir: await buildFixture("Jamvi budget"),
      });

      await expect(
        request(app).get("/pricing").set("Accept", "text/html"),
      ).resolves.toMatchObject({
        status: 200,
        text: expect.stringContaining("<title>Jamvi marketing</title>"),
      });
      await expect(request(app).get("/app")).resolves.toMatchObject({
        status: 308,
        headers: { location: "/app/" },
      });
      await expect(
        request(app).get("/app/settings").set("Accept", "text/html"),
      ).resolves.toMatchObject({
        status: 200,
        text: expect.stringContaining("<title>Jamvi budget</title>"),
      });
      await expect(
        request(app).get("/app/asset.txt"),
      ).resolves.toMatchObject({
        status: 200,
        text: "private budget",
      });
    },
  );

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

  it("leaves API requests untouched with both builds mounted", async () => {
    const app = express();
    attachWebBuild(app, {
      enabled: true,
      marketingBuildDir: await buildFixture("Jamvi marketing"),
      appBuildDir: await buildFixture("Jamvi budget"),
    });
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

  it("serves a prerendered page's own metadata rather than the home page", async () => {
    // Each public route is generated with its own title, description, and
    // canonical URL. Serving the root shell instead makes every page claim to
    // be the home page, which is invisible in the browser and wrong to a
    // crawler — the failure this test exists to catch.
    const marketingBuildDir = await buildFixture("Jamvi marketing");
    await writePrerenderedRoute(marketingBuildDir, "faq", "FAQ | Jamvi");

    const app = express();
    attachWebBuild(app, {
      enabled: true,
      marketingBuildDir,
      appBuildDir: await buildFixture("Jamvi budget"),
    });

    const response = await request(app).get("/faq/");

    expect(response.text).toContain("FAQ | Jamvi");
    expect(response.text).not.toContain("Jamvi marketing");
  });

  it("still falls back to the shell for a route with no prerendered file", async () => {
    const marketingBuildDir = await buildFixture("Jamvi marketing");

    const app = express();
    attachWebBuild(app, {
      enabled: true,
      marketingBuildDir,
      appBuildDir: await buildFixture("Jamvi budget"),
    });

    // The client router owns this one, including the 404 page.
    const response = await request(app).get("/nothing-prerendered-here");

    expect(response.text).toContain("Jamvi marketing");
  });

  it("does not let a browser cache HTML for a year", async () => {
    // index.html names the current asset hashes. Cached immutably, a returning
    // visitor stays on whatever was deployed the day they first arrived.
    const marketingBuildDir = await buildFixture("Jamvi marketing");
    await writePrerenderedRoute(marketingBuildDir, "pricing", "Pricing | Jamvi");

    const app = express();
    attachWebBuild(app, {
      enabled: true,
      marketingBuildDir,
      appBuildDir: await buildFixture("Jamvi budget"),
    });

    const html = await request(app).get("/pricing/");
    expect(html.headers["cache-control"]).toContain("no-cache");

    const asset = await request(app).get("/asset.txt");
    expect(asset.headers["cache-control"]).toContain("immutable");
  });

  it("keeps the authenticated app a single-page app", async () => {
    // family-budget is a real SPA with no prerendered routes; every path must
    // still reach its shell so the client router can handle it.
    const app = express();
    attachWebBuild(app, {
      enabled: true,
      marketingBuildDir: await buildFixture("Jamvi marketing"),
      appBuildDir: await buildFixture("Jamvi budget"),
    });

    const response = await request(app).get("/app/groups/7/expenses");

    expect(response.text).toContain("Jamvi budget");
  });

  it("does not redirect /app/ to itself", async () => {
    // Express does not distinguish "/app" from "/app/", so the route that adds
    // the trailing slash also matches the path that already has one. Left
    // alone it answers /app/ with a redirect to /app/, and the browser stops
    // with ERR_TOO_MANY_REDIRECTS. Every deeper path keeps working, so the app
    // looks fine from the outside while its front door is unreachable.
    const app = express();
    attachWebBuild(app, {
      enabled: true,
      marketingBuildDir: await buildFixture("Jamvi marketing"),
      appBuildDir: await buildFixture("Jamvi budget"),
    });

    const response = await request(app).get("/app/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("Jamvi budget");
  });

  it("still adds the trailing slash to /app", async () => {
    const app = express();
    attachWebBuild(app, {
      enabled: true,
      marketingBuildDir: await buildFixture("Jamvi marketing"),
      appBuildDir: await buildFixture("Jamvi budget"),
    });

    const response = await request(app).get("/app");

    expect(response.status).toBe(308);
    expect(response.headers.location).toBe("/app/");
  });

  it("sends the addresses people actually type to the app", async () => {
    // /login is not a route in the marketing app, so without a redirect it
    // reaches the catch-all and renders the not-found page with a 200 — the
    // visitor sees a broken site and the crawler sees a soft 404.
    const app = express();
    attachWebBuild(app, {
      enabled: true,
      marketingBuildDir: await buildFixture("Jamvi marketing"),
      appBuildDir: await buildFixture("Jamvi budget"),
    });

    for (const path of ["/login", "/signin", "/sign-in", "/signup", "/sign-up", "/register"]) {
      const response = await request(app).get(path);
      expect(response.status, `${path} should redirect`).toBe(302);
      expect(response.headers.location, `${path} should point at the app`).toBe("/app/");
    }
  });

  it("leaves ordinary marketing routes alone", async () => {
    const app = express();
    attachWebBuild(app, {
      enabled: true,
      marketingBuildDir: await buildFixture("Jamvi marketing"),
      appBuildDir: await buildFixture("Jamvi budget"),
    });

    const response = await request(app).get("/pricing");

    expect(response.status).toBe(200);
    expect(response.text).toContain("Jamvi marketing");
  });
});
