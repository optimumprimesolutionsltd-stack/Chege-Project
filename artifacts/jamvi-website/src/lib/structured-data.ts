/**
 * JSON-LD, per route.
 *
 * Meta tags tell a search engine how to render a link. Structured data tells
 * it what the thing *is* - that Jamvi is an application, that it costs KES 100
 * a month, that these are questions with answers. That is what earns a rich
 * result rather than a plain blue line, and what the AI crawlers read when
 * they answer "what is a good chama app".
 *
 * Everything here is checkable against the visible page. Claiming a rating or
 * a review that is not shown is what gets a site penalised, so there is none.
 */

import { JAMVI_PACKAGE, TRIAL_DAYS } from "@workspace/jamvi-pricing";
import { FAQ_ENTRIES } from "./faq-content";
import { SITE_ORIGIN, DEFAULT_OG_IMAGE } from "./site-seo";

const ORGANISATION_ID = `${SITE_ORIGIN}/#organisation`;
const WEBSITE_ID = `${SITE_ORIGIN}/#website`;

const organisation = {
  "@type": "Organization",
  "@id": ORGANISATION_ID,
  name: "Jamvi",
  url: SITE_ORIGIN,
  logo: `${SITE_ORIGIN}/branding/jamvi-mark.png`,
  slogan: "Pesa yetu, wazi",
  areaServed: { "@type": "Country", name: "Kenya" },
};

const website = {
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  url: SITE_ORIGIN,
  name: "Jamvi",
  inLanguage: "en-KE",
  publisher: { "@id": ORGANISATION_ID },
};

/**
 * The application itself. `offers` is the part that matters commercially: it
 * puts the price in the search result, and a price shown there is the single
 * biggest filter on who bothers to click.
 */
const application = {
  "@type": "SoftwareApplication",
  name: "Jamvi",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web, Android, iOS",
  url: SITE_ORIGIN,
  image: DEFAULT_OG_IMAGE,
  inLanguage: "en-KE",
  publisher: { "@id": ORGANISATION_ID },
  description:
    "Jamvi is a Kenyan budgeting app for chamas, families and households. Record contributions, track who has paid, split expenses and keep one shared history everybody can see.",
  offers: {
    "@type": "Offer",
    price: String(JAMVI_PACKAGE.monthlyPriceKes),
    priceCurrency: "KES",
    category: "subscription",
    description: `KES ${JAMVI_PACKAGE.monthlyPriceKes} per member per month, or KES ${JAMVI_PACKAGE.annualPriceKes} a year. Free for the first ${TRIAL_DAYS} days. Groups cost nothing extra, whatever their size.`,
    availability: "https://schema.org/InStock",
  },
};

function faqPage() {
  return {
    "@type": "FAQPage",
    mainEntity: FAQ_ENTRIES.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

/** A trail in the search result instead of a bare URL. The home page has none:
 *  a single-item breadcrumb is noise. */
function breadcrumbs(route: string, label: string) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_ORIGIN}/` },
      { "@type": "ListItem", position: 2, name: label, item: `${SITE_ORIGIN}${route}` },
    ],
  };
}

const BREADCRUMB_LABELS: Record<string, string> = {
  "/features": "Features",
  "/pricing": "Pricing",
  "/about": "About",
  "/faq": "Questions",
  "/terms": "Terms of Service",
  "/privacy": "Privacy Policy",
};

export function structuredDataFor(route: string): object {
  const graph: object[] = [organisation, website];

  if (route === "/") graph.push(application);
  if (route === "/pricing") graph.push(application);
  if (route === "/faq") graph.push(faqPage());

  const label = BREADCRUMB_LABELS[route];
  if (label) graph.push(breadcrumbs(route, label));

  return { "@context": "https://schema.org", "@graph": graph };
}
