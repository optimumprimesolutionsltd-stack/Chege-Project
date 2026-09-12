// Submit URLs to IndexNow, reading the LIVE sitemap rather than the local
// build, so what gets announced is what is actually being served.
//
//   pnpm --filter @workspace/jamvi-website indexnow
//       submit every URL in the live sitemap
//
//   pnpm --filter @workspace/jamvi-website indexnow -- guides/track-who-has-paid/
//       submit specific paths or full URLs
//
// On Git Bash for Windows, drop the leading slash — write `guides/x/`, not
// `/guides/x/`. MSYS rewrites a leading-slash argument into a Windows path
// before the script ever sees it, so `/pricing` arrives as
// "C:/Program Files/Git/pricing" and gets submitted as that. It is on the right
// host, so the off-origin check below cannot catch it. PowerShell and any Unix
// shell are unaffected, as is MSYS_NO_PATHCONV=1.
//
// Note the trailing slashes. generate-seo-pages.mjs writes every route as a
// directory and the sitemap names that form, so a path passed here should match
// it: guides/ rather than guides.
//
// One POST reaches Bing, Yandex, Seznam and Naver. Google does NOT participate:
// it is covered by Search Console, which needs a human to prove ownership.
//
// Ownership here is proven by a key file served from the site root, whose
// contents are the key itself. Rotating the key means renaming public/<key>.txt
// and changing KEY below.

const SITE_ORIGIN = "https://jamvi.co.ke";
const KEY = "9c4e2c3f5bd00f8c410d557dba980aae";
const ENDPOINT = "https://api.indexnow.org/IndexNow";

function toUrl(arg) {
  if (arg.startsWith("http://") || arg.startsWith("https://")) return arg;
  return `${SITE_ORIGIN}${arg.startsWith("/") ? "" : "/"}${arg}`;
}

async function urlsFromLiveSitemap() {
  const res = await fetch(`${SITE_ORIGIN}/sitemap.xml`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`sitemap fetch failed: HTTP ${res.status}`);

  const xml = await res.text();
  // A 200 that is actually the SPA shell would mean the sitemap is missing and
  // a fallback answered. The marketing catch-all returns a real 404 now, so
  // this should be unreachable — but submitting the home page seventeen times
  // because something quietly served HTML is worth refusing outright rather
  // than reporting as "nothing to submit".
  if (!xml.trimStart().startsWith("<?xml")) {
    throw new Error("sitemap.xml did not return XML — is the site deployed?");
  }

  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const urls = args.length ? args.map(toUrl) : await urlsFromLiveSitemap();

  if (!urls.length) {
    console.log("Nothing to submit.");
    return;
  }

  // IndexNow rejects the WHOLE batch if one URL does not belong to the declared
  // host, so catch it here with a message that names the offender rather than
  // letting the engine refuse everything for an unstated reason.
  const foreign = urls.filter((u) => !u.startsWith(`${SITE_ORIGIN}/`));
  if (foreign.length) {
    console.error(`Refusing to submit ${foreign.length} URL(s) not on ${SITE_ORIGIN}:`);
    for (const u of foreign) console.error(`  ${u}`);
    process.exit(1);
  }

  // Without the key file being served the engine cannot verify the submission
  // and silently discards it — an accepted-looking response that did nothing.
  // This repo does not auto-deploy, so "merged but never shipped" is the normal
  // way to arrive here with the key missing.
  const keyRes = await fetch(`${SITE_ORIGIN}/${KEY}.txt`, {
    signal: AbortSignal.timeout(15000),
  });
  const keyBody = keyRes.ok ? (await keyRes.text()).trim() : "";
  if (keyBody !== KEY) {
    console.error(`Key file check failed: ${SITE_ORIGIN}/${KEY}.txt`);
    console.error(`  HTTP ${keyRes.status}, body "${keyBody.slice(0, 40)}" — expected "${KEY}"`);
    console.error("  Has the latest commit been deployed? Deploys here are manual.");
    process.exit(1);
  }
  console.log(`Key file verified. Submitting ${urls.length} URL(s)…`);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: new URL(SITE_ORIGIN).host,
      key: KEY,
      keyLocation: `${SITE_ORIGIN}/${KEY}.txt`,
      urlList: urls,
    }),
    signal: AbortSignal.timeout(30000),
  });

  // 200 accepted, 202 accepted pending key validation. Anything else is a real
  // failure and should exit non-zero so a caller notices.
  if (res.status === 200 || res.status === 202) {
    console.log(`Accepted: HTTP ${res.status}`);
    for (const u of urls.slice(0, 10)) console.log(`  ${u}`);
    if (urls.length > 10) console.log(`  …and ${urls.length - 10} more`);
    console.log("\nNote: acceptance is not indexing. The engines decide what to");
    console.log("crawl and when; confirm coverage in their webmaster tools.");
  } else {
    console.error(`Rejected: HTTP ${res.status}`);
    console.error(await res.text().catch(() => ""));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`indexnow failed: ${err.message}`);
  process.exit(1);
});
