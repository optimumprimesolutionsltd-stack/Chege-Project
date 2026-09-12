/**
 * Ping IndexNow with every URL in the live sitemap.
 *
 *   pnpm --filter @workspace/jamvi-website indexnow
 *
 * IndexNow is a push protocol: rather than waiting to be crawled, we tell the
 * participating engines a URL changed. One POST reaches Bing, Yandex, Seznam
 * and Naver. Google does NOT participate — Google is covered by Search Console,
 * which needs a human to prove domain ownership and cannot be automated here.
 *
 * Ownership is proven by a key file served from the site root. That file is
 * public/${KEY}.txt and its contents are the key itself; the engines fetch it to
 * confirm whoever submitted controls the domain. Rotating the key means renaming
 * that file and changing KEY below, and the file has to be live before a
 * submission will validate.
 *
 * The URL list comes from the deployed sitemap rather than a hardcoded array,
 * so it keeps covering new pages as generate-seo-pages.mjs adds them — there
 * are seventeen today and the count moves.
 */

const KEY = "9c4e2c3f5bd00f8c410d557dba980aae";
const HOST = "jamvi.co.ke";
const ORIGIN = `https://${HOST}`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

async function sitemapUrls() {
  const response = await fetch(`${ORIGIN}/sitemap.xml`);
  if (!response.ok) throw new Error(`sitemap.xml returned ${response.status}`);

  const body = await response.text();
  // A 200 that is actually the SPA shell would mean the sitemap is missing and
  // something else answered. Since the marketing catch-all now returns 404 for
  // anything with no file, that should be impossible — but submitting the home
  // page seventeen times because a fallback was silently serving HTML is the
  // kind of failure worth refusing outright rather than reporting as success.
  if (!body.trimStart().startsWith("<?xml")) {
    throw new Error("sitemap.xml did not return XML — is the site deployed?");
  }

  return [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
}

async function main() {
  const keyUrl = `${ORIGIN}/${KEY}.txt`;
  const keyResponse = await fetch(keyUrl);
  if (!keyResponse.ok || (await keyResponse.text()).trim() !== KEY) {
    throw new Error(`key file not serving correctly at ${keyUrl} — deploy first`);
  }

  const urlList = await sitemapUrls();
  console.log(`submitting ${urlList.length} url(s)`);

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: keyUrl, urlList }),
  });

  // 200 accepted, 202 accepted while the key is still being validated. Anything
  // else is worth reading: 422 usually means the key or host did not match.
  console.log(`${response.status} ${response.statusText}`, (await response.text()).trim());
  if (response.status !== 200 && response.status !== 202) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
