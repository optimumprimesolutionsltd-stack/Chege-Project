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

  // 6 Oct 2026: Chrome blocks the APK that asks for SMS, so the website's main
  // download leaves SMS out and the message-reading one has its own address.
  it('offers the message-reading version at its own address, with the computer-and-WhatsApp way round', () => {
    expect(read('../jamvi-website/src/lib/site-links.ts')).toContain('export const JAMVI_SMS_APK_PATH = "/download/jamvi-sms.apk";');
    const page = read('../jamvi-website/src/pages/download.tsx');
    expect(page).toContain('href={JAMVI_SMS_APK_PATH}');
    expect(page).toContain('choose Document');
    const serving = read('../api-server/src/lib/webAppServing.ts');
    expect(serving).toContain('app.get("/download/jamvi-sms.apk"');
    expect(serving).toContain('releases/download/jamvi-android/jamvi-sms.apk');
    expect(serving).toContain('env.JAMVI_SMS_APK_URL');
  });

  // "Do not confuse the user with giving him an apk that will be blocked anyway" (8 Oct 2026).
  it('never offers a phone the message-reading download, only how to get it', () => {
    const page = read('../jamvi-website/src/pages/download.tsx');
    expect(page).toContain('setOnPhone(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));');
    expect(page).toMatch(/\{onPhone === false && \(\s+<a href=\{JAMVI_SMS_APK_PATH\}/);
    expect(page).toContain('data-testid="sms-version-on-phone"');
  });

  // "The first instance should be a user being told to import an mpesa statement
  // from date of his choice ... from there onwards the app starts reading" (8 Oct 2026).
  it('guides the start: the statement first, then install, read it in, keep up - linked from the home page', () => {
    const page = read('../jamvi-website/src/pages/download.tsx');
    expect(page).toContain('id="getting-started"');
    expect(page).toContain('title: "Ask M-Pesa for your statement first",');
    expect(page).toContain('title: "Let Jamvi keep up",');
    expect(read('../jamvi-website/src/pages/home.tsx')).toContain('<Link href="/download#getting-started"');
  });
});
