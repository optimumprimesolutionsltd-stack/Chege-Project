/**
 * Renders each page to HTML at build time.
 *
 * Without this the site ships `<div id="root"></div>` and nothing else. Google
 * will execute the JavaScript eventually, but Bing, WhatsApp link previews and
 * the AI crawlers do not - they read the HTML they are given and move on. A
 * marketing site that is invisible to them is invisible where it matters.
 *
 * The pages have no data fetching and touch no browser API while rendering, so
 * this is a plain renderToString with no plumbing.
 */

import { renderToString } from "react-dom/server";
import App from "./App";

export { SITE_SEO, SITE_ORIGIN, DEFAULT_OG_IMAGE } from "./lib/site-seo";
export { structuredDataFor } from "./lib/structured-data";

export function render(url: string): string {
  return renderToString(<App ssrPath={url} />);
}
