import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MPESA_CARD_KEY, shouldShowMpesaCard } from '@/lib/mpesaCard';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// The M-Pesa import is the headline: the first thing on Home until it has been
// used or dismissed, and the site says the same in the same words.
describe('the Home card for the M-Pesa import', () => {
  it('shows until the import has been used or dismissed', () => {
    expect(shouldShowMpesaCard(null)).toBe(true);
    expect(shouldShowMpesaCard(undefined)).toBe(true);
    expect(shouldShowMpesaCard('dismissed')).toBe(false);
    expect(shouldShowMpesaCard('done')).toBe(false);
    expect(MPESA_CARD_KEY).toBe('jamvi:mpesa-card');
  });

  it('sits at the top of Home, above the setup guide', () => {
    const home = read('app/(tabs)/index.tsx');
    expect(home).toContain('<MpesaImportCard />');
    expect(home.indexOf('<MpesaImportCard />')).toBeLessThan(home.indexOf('<WorkspaceSetupGuide />'));
  });

  it('opens the import, and is done once something has been saved', () => {
    const card = read('components/MpesaImportCard.tsx');
    expect(card).toContain("router.push('/mpesa-import'");
    expect(read('app/mpesa-import.tsx')).toContain("if (result.saved > 0) void rememberMpesaCard('done');");
  });

  it('only says what is true: a statement is not uploaded', () => {
    const card = read('components/MpesaImportCard.tsx');
    expect(card).toContain('never uploaded');
    expect(card).not.toMatch(/bconnect|bsync(s|ed)?b|bautomatic/i);
  });
});

describe('the website leads with it', () => {
  const home = read('../jamvi-website/src/pages/home.tsx');
  const seo = read('../jamvi-website/src/lib/site-seo.ts');
  it('has the headline, the steps and the privacy line', () => {
    expect(home).toContain('Your M-Pesa month,');
    expect(home).toContain('sorted in minutes.');
    expect(home).toContain('id="mpesa-import"');
    expect(home).toContain('never uploaded');
  });
  it('is titled for what people search', () => {
    expect(seo).toContain('title: "M-Pesa Budget App, Built in Kenya"');
  });
  it('has a guide and FAQ answers that make no claim we cannot keep', () => {
    const guides = read('../jamvi-website/src/lib/guides.ts');
    const faq = read('../jamvi-website/src/lib/faq-content.ts');
    expect(guides).toContain('/guides/import-mpesa-statement-budget');
    expect(faq).toContain('Can Jamvi read my M-Pesa statement?');
    for (const text of [home, guides.slice(guides.indexOf('import-mpesa-statement-budget'), guides.indexOf('how-to-budget-in-kenya')), faq]) {
      expect(text).not.toMatch(/connects to M-Pesa|syncs with M-Pesa|automatically imports/i);
    }
  });
});
