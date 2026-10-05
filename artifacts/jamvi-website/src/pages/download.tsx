import { motion } from "framer-motion";
import { Download as DownloadIcon, ShieldCheck, Smartphone, MessageSquare, Globe } from "lucide-react";
import { useSeo } from "@/hooks/use-seo";
import { SITE_SEO } from "@/lib/site-seo";
import { JAMVI_APK_PATH, JAMVI_APP_PATH, JAMVI_SUPPORT_EMAIL } from "@/lib/site-links";

const STEPS = [
  "Tap Download for Android above, on the phone you will use Jamvi on.",
  "Open the file when it finishes. If Android asks, allow installs from your browser (or WhatsApp, if the link came there).",
  "If Google Play Protect warns about an app it does not know, tap More details, then Install anyway. Jamvi is not in the Play Store yet, so Google has not seen it.",
  "Open Jamvi and sign in with Google. You start with a free trial.",
];

/**
 * jamvi.co.ke/download - the one link to give people for the Android app,
 * until Jamvi is in the Play Store. The button goes through /download/jamvi.apk,
 * which the server points at the newest build, so this page never needs
 * changing when a new APK comes out.
 */
export default function Download() {
  useSeo(SITE_SEO["/download"]);

  return (
    <div className="flex flex-col min-h-screen bg-muted/20">
      <section className="pt-24 pb-12 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <motion.h1
            initial={{ opacity: 0.85, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-bold text-primary mb-6 font-serif"
          >
            Get Jamvi on your phone
          </motion.h1>
          <motion.p
            initial={{ opacity: 0.85, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-foreground/70 mb-8"
          >
            The Android app, straight from us. Once it is installed, updates arrive inside the app.
          </motion.p>
          <a
            href={JAMVI_APK_PATH}
            className="btn-mat h-14 px-7 text-lg"
            data-testid="download-android"
          >
            <DownloadIcon className="h-5 w-5" aria-hidden="true" />
            Download for Android
          </a>
          <p className="mt-3 text-sm text-foreground/60">About 100 MB. Android only.</p>
        </div>
      </section>

      <section className="pb-12 px-4">
        <div className="container mx-auto max-w-3xl rounded-[4px] bg-card p-6 shadow-sm sm:p-8">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-primary">
            <Smartphone className="h-5 w-5" aria-hidden="true" /> Installing it
          </h2>
          <ol className="space-y-3">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3 text-foreground/80">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] bg-primary/10 text-sm font-bold text-primary">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="pb-12 px-4">
        <div className="container mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
          <div className="rounded-[4px] bg-card p-5 shadow-sm">
            <ShieldCheck className="mb-2 h-5 w-5 text-primary" aria-hidden="true" />
            <h3 className="mb-1 font-semibold text-foreground">Why the warnings</h3>
            <p className="text-sm text-foreground/70">Android warns about any app installed from outside the Play Store. It is the same Jamvi as on the web, made by Optimum Prime Solutions.</p>
          </div>
          <div className="rounded-[4px] bg-card p-5 shadow-sm">
            <MessageSquare className="mb-2 h-5 w-5 text-primary" aria-hidden="true" />
            <h3 className="mb-1 font-semibold text-foreground">Your M-Pesa messages</h3>
            <p className="text-sm text-foreground/70">The app can read M-Pesa&rsquo;s messages for you, but only if you ask it to and Android asks you first. <a href="/privacy" className="text-primary underline">How that works</a>.</p>
          </div>
          <div className="rounded-[4px] bg-card p-5 shadow-sm">
            <Globe className="mb-2 h-5 w-5 text-primary" aria-hidden="true" />
            <h3 className="mb-1 font-semibold text-foreground">On an iPhone?</h3>
            <p className="text-sm text-foreground/70">Use Jamvi in your browser - it does everything the app does except read messages. <a href={JAMVI_APP_PATH} className="text-primary underline">Open Jamvi</a>.</p>
          </div>
        </div>
      </section>

      <section className="pb-24 px-4">
        <p className="container mx-auto max-w-3xl text-center text-sm text-foreground/60">
          Coming to the Play Store. Trouble installing? Write to{" "}
          <a href={`mailto:${JAMVI_SUPPORT_EMAIL}`} className="text-primary underline">{JAMVI_SUPPORT_EMAIL}</a>.
        </p>
      </section>
    </div>
  );
}
