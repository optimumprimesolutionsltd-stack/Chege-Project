/**
 * Click-to-chat on WhatsApp, with the question half-written already.
 *
 * The WhatsApp Business Platform number Optimum runs — the same one that
 * answers the assistant in the chat panel, so a question asked in either place
 * reaches the same conversation rather than one person's personal handset.
 *
 * A wa.me link rather than an embedded chat widget on purpose: a widget is a
 * third-party script on every page, and this needs no script at all.
 */
const WHATSAPP_NUMBER = "254727209720";

/**
 * What the visitor's message says before they type anything.
 *
 * A blank WhatsApp thread puts the work of starting the conversation on
 * somebody who was only browsing, and "Hi" tells us nothing about what they
 * wanted — so the first reply has to be "how can I help?" instead of an answer.
 * Naming the page they came from means it can be an answer.
 *
 * Every opener names Jamvi, which is also what the assistant keys on if the
 * conversation moves to WhatsApp.
 */
const OPENERS: Record<string, string> = {
  "/pricing": "Hi Jamvi — I'm looking at your pricing and have a question.",
  "/features": "Hi Jamvi — I have a question about what the app does.",
  "/faq": "Hi Jamvi — I have a question that wasn't in your FAQ.",
  "/about": "Hi Jamvi — I'd like to know more about you.",
  "/guides": "Hi Jamvi — I was reading one of your guides and have a question.",
};

const DEFAULT_OPENER = "Hi Jamvi — I'd like to know more about the app.";

export function whatsAppLink(path: string): string {
  // Guides and segment pages live under a section; anything beneath a known
  // one inherits its opener rather than falling back to the generic line.
  const match = Object.keys(OPENERS).find((p) => path === p || path.startsWith(`${p}/`));
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(match ? OPENERS[match] : DEFAULT_OPENER)}`;
}

/** WhatsApp's own glyph. Inlined so the button costs no extra request. */
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.83 9.83 0 0 1 2.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.945c0 2.096.549 4.142 1.595 5.945L0 24l6.305-1.654a11.9 11.9 0 0 0 5.683 1.448h.005c6.582 0 11.941-5.359 11.944-11.945a11.9 11.9 0 0 0-3.417-8.4" />
    </svg>
  );
}
