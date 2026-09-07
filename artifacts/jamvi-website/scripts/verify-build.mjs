/**
 * Checks that the built site is actually a site.
 *
 * A build exiting 0 is not the assurance it looks like. The failure this
 * guards against is the one the site already shipped with for months: every
 * page present, every status 200, and nothing inside them - because the
 * markup is produced by a separate pre-render pass that can silently do
 * nothing. An exit code cannot see that.
 *
 * So this asserts what a crawler would find. It runs as the last step of the
 * build, which means Render fails the deploy rather than replacing a working
 * site with blank pages.
 */

import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "dist", "public");

const problems = [];
const note = (route, message) => problems.push(`${route}: ${message}`);

const sitemapXml = await readFile(path.join(outputDir, "sitemap.xml"), "utf8");
const locations = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

if (locations.length === 0) {
  problems.push("sitemap.xml lists no URLs at all.");
}

for (const location of locations) {
  const route = new URL(location).pathname;
  const file = path.join(outputDir, route === "/" ? "" : route, "index.html");

  try {
    await access(file);
  } catch {
    note(route, "listed in the sitemap but no page was written for it.");
    continue;
  }

  const html = await readFile(file, "utf8");

  // The whole point of the pre-render pass.
  if (!/<div id="root"><\w/.test(html)) {
    note(route, "shipped an empty #root - a crawler would see a blank page.");
  }

  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  if (!title) note(route, "has no <title>.");

  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  if (!description) note(route, "has no meta description.");

  // Every page inheriting the shell's canonical would tell search engines the
  // whole site is the home page, which is how duplicate-content penalties
  // start.
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  if (!canonical) {
    note(route, "has no canonical URL.");
  } else if (new URL(canonical).pathname !== route) {
    note(route, `canonical points at ${new URL(canonical).pathname}, not itself.`);
  }

  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (blocks.length !== 1) {
    note(route, `has ${blocks.length} JSON-LD blocks, expected exactly 1.`);
  } else {
    try {
      const parsed = JSON.parse(blocks[0][1].replaceAll("\\u003c", "<"));
      if (!Array.isArray(parsed["@graph"]) || parsed["@graph"].length === 0) {
        note(route, "has JSON-LD with an empty @graph.");
      }
    } catch (error) {
      note(route, `has JSON-LD that does not parse: ${error.message}`);
    }
  }

  // A hashed bundle that is not there means a white page for every visitor,
  // whatever the HTML says.
  const asset = html.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1];
  if (!asset) {
    note(route, "loads no JavaScript bundle.");
  } else {
    try {
      await access(path.join(outputDir, asset.replace(/^\//, "")));
    } catch {
      note(route, `references ${asset}, which was not built.`);
    }
  }
}

if (problems.length > 0) {
  console.error(`\nThe built site is not shippable:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(`Verified ${locations.length} pages: markup, metadata, canonical, JSON-LD and assets.`);
