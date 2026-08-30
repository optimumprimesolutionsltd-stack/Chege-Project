import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "dist", "public");
const shellPath = path.join(outputDir, "index.html");
const origin = "https://jamvi.co.ke";
const image = `${origin}/branding/jamvi-mark.png`;

const pages = {
  // NOTE: these duplicate the useSeo() calls in each page component. The
  // prerendered HTML is what a crawler reads, so a change made only in the
  // component is invisible where it matters most.
  "/": {
    title: "Gather Around Your Money",
    description:
      "Jamvi keeps your own budget and the ones you share in one place — with a partner, a family, flatmates, or a chama. Built in Kenya, for Kenyan money.",
  },
  "/features": {
    title: "Features - Everything you need",
    description:
      "Discover Jamvi features for personal budgets and shared group finances, including transparent history, savings goals, categories, and member permissions.",
  },
  "/pricing": {
    title: "Pricing - Transparent and fair",
    description:
      "Start managing personal and group money with simple, honest Jamvi pricing. Begin for free and choose a clear plan as your chama or team grows.",
  },
  "/about": {
    title: "About Us - The story behind the mat",
    description:
      "Learn why Jamvi was built for Kenyan families, chamas, and groups that want clarity, warmth, and trust when managing money together.",
  },
  "/faq": {
    title: "FAQ - Frequently Asked Questions",
    description:
      "Find answers about Jamvi personal budgets, shared group finances, permissions, security, pricing, currencies, and getting started in Kenya.",
  },
  // The legal pages are listed so they carry their own canonical URL. Without
  // an entry each would inherit the shell's, and tell search engines it was
  // the home page.
  "/terms": {
    title: "Terms of Service",
    description:
      "The terms on which Jamvi is provided: what the service does, what it deliberately does not do, and the responsibilities of everyone using it.",
  },
  "/privacy": {
    title: "Privacy Policy",
    description:
      "What personal data Jamvi collects, why, who processes it, where it is stored, and the rights you have over it under Kenya's Data Protection Act.",
  },
};

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
  const canonical = `${origin}${route === "/" ? "/" : route}`;
  let html = shell.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttribute(title)}</title>`);
  html = replaceOrAdd(html, /<meta name="description"[^>]*>/, `<meta name="description" content="${escapeAttribute(metadata.description)}" />`);
  html = replaceOrAdd(html, /<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeAttribute(title)}" />`);
  html = replaceOrAdd(html, /<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeAttribute(metadata.description)}" />`);
  html = replaceOrAdd(html, /<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${image}" />`);
  html = replaceOrAdd(html, /<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${canonical}" />`);
  html = replaceOrAdd(html, /<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escapeAttribute(title)}" />`);
  html = replaceOrAdd(html, /<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escapeAttribute(metadata.description)}" />`);
  html = replaceOrAdd(html, /<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${image}" />`);
  html = replaceOrAdd(html, /<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${canonical}" />`);
  return html;
}

for (const [route, metadata] of Object.entries(pages)) {
  const routeDir = route === "/" ? outputDir : path.join(outputDir, route.slice(1));
  await mkdir(routeDir, { recursive: true });
  await writeFile(path.join(routeDir, "index.html"), renderPage(route, metadata));
}

console.log(`Generated server-rendered metadata for ${Object.keys(pages).length} public routes.`);