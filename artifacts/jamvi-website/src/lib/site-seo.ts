import { JAMVI_PACKAGE, TRIAL_DAYS } from "@workspace/jamvi-pricing";
import { SEGMENTS } from "./segments";
import { GUIDES } from "./guides";

export const SITE_ORIGIN = "https://jamvi.co.ke";
// 1200x630, which is the slot WhatsApp, X and LinkedIn actually render. The
// square logo mark is still the Organization logo in the structured data,
// where a square is what is wanted.
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/branding/jamvi-og.png`;

export interface SeoEntry {
  title: string;
  description: string;
}

/**
 * Every page's title and description, in one table.
 *
 * The pages read this, the build script renders from it, and the sitemap is
 * generated from its keys - so a page cannot exist without a description, or
 * quietly drift from the one search engines were given.
 *
 * The titles name what people actually type. "Gather Around Your Money" is the
 * better sentence and nobody has ever searched for it; someone looking for
 * this app searches "chama app", "class fund" or "budget app Kenya". The
 * warmth belongs on the page, where a person reads it. A title tag is read by
 * a machine deciding whether to show us at all.
 */
const PAGES: Record<string, SeoEntry> = {
  "/": {
    title: "Chama & Household Budget App, Built in Kenya",
    description: `Track chama contributions, split household bills and see who has paid - in one shared record everybody trusts. KES ${JAMVI_PACKAGE.monthlyPriceKes} a month per member; groups of any size cost nothing extra. Free for ${TRIAL_DAYS} days.`,
  },
  "/features": {
    title: "Features for Chamas, Families & Roommates",
    description:
      "Record monthly contributions for the whole group at once, see who has paid on a month-by-month sheet, split expenses, set savings goals, and keep one history nobody can quietly edit.",
  },
  "/pricing": {
    title: `Pricing - KES ${JAMVI_PACKAGE.monthlyPriceKes} a Month, Groups Free`,
    description: `One subscription covers your own budget and every group you belong to. KES ${JAMVI_PACKAGE.monthlyPriceKes} per member per month or KES ${JAMVI_PACKAGE.annualPriceKes.toLocaleString("en-KE")} a year. No group fee, no member limit, no tiers. Free for your first ${TRIAL_DAYS} days.`,
  },
  "/about": {
    title: "Built in Nairobi, for Kenyan Money",
    description:
      "Why Jamvi exists: chamas, churches, families and student groups in Kenya run real money on WhatsApp threads and fragile spreadsheets. Jamvi gives them one clear record instead.",
  },
  "/faq": {
    title: "Questions About Chamas, Groups & Your Money",
    description:
      "Is Jamvi a bank? Can a chama of fifty use it? Who can edit a transaction? Straight answers about contributions, permissions, security, currencies and pricing in Kenya.",
  },
  "/guides": {
    title: "Guides: Keeping Group Money Clear",
    description:
      "Practical guides on chama record-keeping, tracking who has paid, and splitting household bills without keeping score - useful whether or not you use Jamvi.",
  },
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
  "/404": {
    title: "Page Not Found",
    description: "The Jamvi page you are looking for does not exist.",
  },
};

// The per-audience pages carry their own titles, written next to the copy they
// describe rather than restated here.
for (const segment of SEGMENTS) {
  PAGES[segment.slug] = { title: segment.title, description: segment.description };
}

// Guides do the same - their title and description live beside the article.
for (const guide of GUIDES) {
  PAGES[guide.slug] = { title: guide.title, description: guide.description };
}

export const SITE_SEO: Record<string, SeoEntry> = PAGES;

export function getSiteSeo(pathname: string): SeoEntry {
  return SITE_SEO[pathname] ?? SITE_SEO["/404"];
}
