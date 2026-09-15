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

// Warnings are things worth fixing that do not make the build unshippable, so
// they are reported without failing the deploy. A title a few pixels over the
// SERP limit costs you the tail of a headline; it does not break the page, and
// failing a deploy over it would be worse than the problem.
const warnings = [];
const warn = (route, message) => warnings.push(`${route}: ${message}`);

// Google truncates result titles on rendered WIDTH, not character count, which
// is why a 62-character lowercase title can fit where a 58-character one full
// of capitals does not. This approximates Arial at the desktop SERP size; it is
// close enough to catch a title drifting over, which a .length check is not.
const NARROW_CHARS = "iljtfrI.,:;'|!()[]- ";
const WIDE_CHARS = "mwMW" + String.fromCharCode(8212) + String.fromCharCode(8230) + "@%";
const TITLE_WIDTH_LIMIT = 600;

// generate-seo-pages.mjs escapes the title, so "&" arrives here as "&amp;" and
// would be measured as five characters rather than one - enough on its own to
// push a title 43px over the limit and report a problem that does not exist.
// Measure what a reader sees, not the markup.
function decodeEntities(text) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: String.fromCharCode(34),
    apos: String.fromCharCode(39),
    nbsp: " ",
    mdash: String.fromCharCode(8212),
    ndash: String.fromCharCode(8211),
    hellip: String.fromCharCode(8230),
  };
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (whole, name) => (name in named ? named[name] : whole));
}

function titleWidth(text) {
  let width = 0;
  for (const character of text) {
    if (NARROW_CHARS.includes(character)) width += 5.6;
    else if (WIDE_CHARS.includes(character)) width += 16.5;
    else if (character >= "A" && character <= "Z") width += 13.3;
    else width += 10.4;
  }
  return Math.round(width);
}

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
  if (!title) {
    note(route, "has no <title>.");
  } else {
    const width = titleWidth(decodeEntities(title));
    if (width > TITLE_WIDTH_LIMIT) {
      warn(
        route,
        `title renders ~${width}px, over the ~${TITLE_WIDTH_LIMIT}px SERP limit - Google will truncate it.`,
      );
    }
  }

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

// llms.txt is a hand-maintained file, not generated from GUIDES the way the
// sitemap is — which is exactly how a guide added after it was last edited
// went missing from it. The sitemap is already the source of truth for
// "which guides exist"; this just makes sure llms.txt actually agrees.
const llmsTxt = await readFile(path.join(outputDir, "llms.txt"), "utf8");
for (const location of locations) {
  if (!new URL(location).pathname.startsWith("/guides/")) continue;
  if (!llmsTxt.includes(location)) {
    note(new URL(location).pathname, "is in the sitemap but missing from llms.txt.");
  }
}

if (warnings.length > 0) {
  console.warn("");
  console.warn("Shippable, but worth fixing:");
  console.warn("");
  for (const warning of warnings) console.warn(`  - ${warning}`);
  console.warn("");
}

if (problems.length > 0) {
  console.error(`\nThe built site is not shippable:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(`Verified ${locations.length} pages: markup, metadata, canonical, JSON-LD and assets.`);
