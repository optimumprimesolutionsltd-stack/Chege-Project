import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

// Asked for 3 Oct 2026: one link to share the Android app until it is in the
// Play Store - jamvi.co.ke/download, always the newest build.
describe('jamvi.co.ke/download', () => {
  it('is a page on the site, in its SEO table, sitemap, breadcrumbs, menu and footer', () => {
    expect(read('../jamvi-website/src/App.tsx')).toContain('<Route path="/download" component={Download} />');
    expect(read('../jamvi-website/src/lib/site-seo.ts')).toContain('"/download": {');
    expect(read('../jamvi-website/scripts/generate-seo-pages.mjs')).toContain('"/download": { changefreq: "monthly"');
    expect(read('../jamvi-website/src/lib/structured-data.ts')).toContain('"/download": "Android app"');
    expect(read('../jamvi-website/src/components/layout/Navbar.tsx')).toContain('{ href: "/download", label: "Get the app" }');
    expect(read('../jamvi-website/src/components/layout/Footer.tsx')).toContain('href="/download"');
  });

  it('downloads through an address on jamvi.co.ke that the server points at the newest build', () => {
    expect(read('../jamvi-website/src/lib/site-links.ts')).toContain('export const JAMVI_APK_PATH = "/download/jamvi.apk";');
    expect(read('../jamvi-website/src/pages/download.tsx')).toContain('href={JAMVI_APK_PATH}');
    const serving = read('../api-server/src/lib/webAppServing.ts');
    expect(serving).toContain('for (const alias of ["/download/jamvi.apk", "/apk"])');
    expect(serving).toContain('releases/download/jamvi-android/jamvi.apk');
    expect(serving).toContain('env.JAMVI_APK_URL');
  });
});
