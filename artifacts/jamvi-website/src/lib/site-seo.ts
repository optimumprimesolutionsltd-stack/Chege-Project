export const SITE_ORIGIN = "https://jamvi.co.ke";
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/branding/jamvi-mark.png`;

export const SITE_SEO = {
  "/": {
    title: "Gather Around Your Money",
    description:
      "Jamvi brings clarity, trust, and warmth to personal budgets and shared money. Track everyday spending or manage a chama with confidence.",
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
  "/404": {
    title: "Page Not Found",
    description: "The Jamvi page you are looking for does not exist.",
  },
} as const;

export type SiteRoute = keyof typeof SITE_SEO;

export function getSiteSeo(pathname: string) {
  return SITE_SEO[pathname as SiteRoute] ?? SITE_SEO["/404"];
}