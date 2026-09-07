/**
 * Turns the built SPA into a set of real HTML pages.
 *
 * Vite emits one shell with an empty <div id="root">. That is enough for
 * Google, which runs JavaScript, and useless for everything else: Bing,
 * WhatsApp and Slack link previews, and the crawlers behind the AI assistants
 * people now ask for recommendations. They read what they are served.
 *
 * So each route is rendered to HTML here, at build time, with its own title,
 * description, canonical URL and JSON-LD. The client hydrates that markup
 * rather than replacing it, so nobody sees a blank frame while React boots.
 *
 * The sitemap is written from the same route table, because a sitemap that
 * disagrees with the site is worse than none.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "dist", "public");
const shellPath = path.join(outputDir, "index.html");

// Built by `vite build --ssr` just before this script runs.
const server = await import(pathToFileURL(path.join(root, "dist", "server", "entry-server.js")).href);
const { render, structuredDataFor, SITE_SEO, SITE_ORIGIN, DEFAULT_OG_IMAGE } = server;

/**
 * How often each page really changes, and how much it matters. Search engines
 * treat these as hints rather than instructions, but a legal page claiming to
 * change weekly wastes crawl budget the marketing pages could have had.
 */
const CRAWL = {
  "/": { changefreq: "weekly", priority: "1.0" },
  "/features": { changefreq: "monthly", priority: "0.9" },
  "/pricing": { changefreq: "monthly", priority: "0.9" },
  "/faq": { changefreq: "monthly", priority: "0.8" },
  "/about": { changefreq: "monthly", priority: "0.6" },
  "/chama": { changefreq: "monthly", priority: "0.9" },
  "/students": { changefreq: "monthly", priority: "0.8" },
  "/church": { changefreq: "monthly", priority: "0.8" },
  "/clubs": { changefreq: "monthly", priority: "0.8" },
  "/household": { changefreq: "monthly", priority: "0.9" },
  "/terms": { changefreq: "yearly", priority: "0.3" },
  "/privacy": { changefreq: "yearly", priority: "0.3" },
};

const routes = Object.keys(SITE_SEO).filter((route) => route !== "/404");

const shell = await readFile(shellPath, "utf8");

function escapeAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function replaceOrAdd(html, pattern, tag) {
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `    ${tag}\n  </head>`);
}

function renderPage(route, metadata) {
  const title = `${metadata.title} | Jamvi`;
  const canonical = `${SITE_ORIGIN}${route === "/" ? "/" : route}`;

  let html = shell.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttribute(title)}</title>`);
  html = replaceOrAdd(html, /<meta name="description"[^>]*>/, `<meta name="description" content="${escapeAttribute(metadata.description)}" />`);
  html = replaceOrAdd(html, /<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeAttribute(title)}" />`);
  html = replaceOrAdd(html, /<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeAttribute(metadata.description)}" />`);
  html = replaceOrAdd(html, /<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${DEFAULT_OG_IMAGE}" />`);
  html = replaceOrAdd(html, /<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${canonical}" />`);
  html = replaceOrAdd(html, /<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escapeAttribute(title)}" />`);
  html = replaceOrAdd(html, /<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escapeAttribute(metadata.description)}" />`);
  html = replaceOrAdd(html, /<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${DEFAULT_OG_IMAGE}" />`);
  html = replaceOrAdd(html, /<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${canonical}" />`);

  // JSON-LD goes in last so it cannot be clobbered by the replacements above.
  const jsonLd = JSON.stringify(structuredDataFor(route));
  html = html.replace(
    "</head>",
    `    <script type="application/ld+json">${jsonLd.replaceAll("<", "\u003c")}</script>\n  </head>`,
  );

  // The markup a crawler actually reads.
  const body = render(route);
  html = html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);

  return html;
}

function sitemap(lastmod) {
  const entries = routes.map((route) => {
    const { changefreq, priority } = CRAWL[route] ?? { changefreq: "monthly", priority: "0.5" };
    const loc = `${SITE_ORIGIN}${route === "/" ? "/" : route}`;
    return `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}

let rendered = 0;
for (const route of routes) {
  const routeDir = route === "/" ? outputDir : path.join(outputDir, route.slice(1));
  await mkdir(routeDir, { recursive: true });
  const html = renderPage(route, SITE_SEO[route]);

  if (!html.includes('<div id="root"><')) {
    throw new Error(`${route} rendered no markup. The page would ship empty to every crawler.`);
  }

  await writeFile(path.join(routeDir, "index.html"), html);
  rendered += 1;
}

await writeFile(path.join(outputDir, "sitemap.xml"), sitemap(new Date().toISOString().slice(0, 10)));

console.log(`Pre-rendered ${rendered} pages with metadata, JSON-LD and a matching sitemap.`);
