import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Download as DownloadIcon, ShieldCheck, Smartphone, MessageSquare, Globe, ExternalLink, Copy, Check, Laptop, Rocket } from "lucide-react";
import { useSeo } from "@/hooks/use-seo";
import { SITE_SEO } from "@/lib/site-seo";
import { JAMVI_APK_PATH, JAMVI_APP_PATH, JAMVI_SMS_APK_PATH, JAMVI_SUPPORT_EMAIL } from "@/lib/site-links";

const STEPS = [
  "Tap Download for Android above, on the phone you will use Jamvi on.",
  "If Chrome says the file might be harmful, tap Download anyway. If nothing seems to happen, open Chrome's menu, then Downloads - a blocked download waits there for you to keep it.",
  "Open the file when it finishes. If Android asks, allow installs from your browser (or WhatsApp, if the link came there).",
  "If Google Play Protect warns about an app it does not know, tap More details, then Install anyway. Jamvi is not in the Play Store yet, so Google has not seen it.",
  "Open Jamvi and sign in with Google. You start with a free trial.",
];

/**
 * The version that reads M-Pesa messages asks Android for SMS permission, and
 * Chrome on a phone blocks that APK outright ("Dangerous download blocked")
 * while Google reviews it. A file that arrives through WhatsApp is not checked
 * by Chrome, so the way round is a computer: download there, send it over.
 */
const SMS_VERSION_STEPS = [
  "On a computer, download the file below. A computer's browser does not block it.",
  "Open WhatsApp on the computer (web.whatsapp.com or the WhatsApp app) and open the chat with yourself.",
  "Tap the paperclip, choose Document, and send jamvi-sms.apk. Send it as a document, not as a photo or video.",
  "On your phone, open that chat, tap the file, then Install. If Android asks, allow installs from WhatsApp.",
];

/**
 * Starting with Jamvi, in the order that wastes no time: the statement is
 * asked for first, because M-Pesa emails it and it can take a while, so it is
 * waiting by the time Jamvi is installed. Then the app reads it in, from the
 * day chosen, and keeps up with new messages after that (the app's first M-Pesa
 * screen, lib/mpesaFirstStart). "The first instance should be a user being told
 * to import an mpesa statement from date of his choice ... and from there
 * onwards the app starts reading" (8 Oct 2026).
 */
const GETTING_STARTED = [
  {
    title: "Ask M-Pesa for your statement first",
    body: "It comes by email and can take a while, so ask now. In the M-PESA or My Safaricom app go to Statements, or dial *334#, choose My Account, then M-PESA Statement. Choose the day you want Jamvi to start from (the start of the year is a good choice) up to today. M-Pesa sends the PDF's password by SMS.",
  },
  {
    title: "Install Jamvi and sign in",
    body: "With the button above - or the message-reading version below, so Jamvi can keep up with new M-Pesa messages by itself. Sign in with Google; the free trial starts there.",
  },
  {
    title: "Read your statement in",
    body: "Open M-Pesa in Jamvi. Pick the same day you started from, choose the statement PDF from your email and type its password. Look through the list, then save.",
  },
  {
    title: "Let Jamvi keep up",
    body: "Tap Read new M-Pesa messages for me. From then on Jamvi reads M-Pesa's new messages each time you open it, and nothing is saved until you say so. On the version without message reading, share M-Pesa's messages to Jamvi instead.",
  },
];

/**
 * Browsers inside other apps (WhatsApp, Facebook, Instagram...) cannot save
 * files, so the Download button does nothing there. Android System WebView
 * marks itself with "; wv)"; the social apps add their own names.
 */
const IN_APP_BROWSER = /; wv\)|FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Snapchat|TikTok|musical_ly|Line\//i;

/** Opens this page in Chrome from an Android in-app browser. */
function openInChromeHref(): string {
  const { host, pathname, href } = window.location;
  return `intent://${host}${pathname}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}

/**
 * jamvi.co.ke/download - the one link to give people for the Android app,
 * until Jamvi is in the Play Store. The button goes through /download/jamvi.apk,
 * which the server points at the newest build, so this page never needs
 * changing when a new APK comes out.
 */
export default function Download() {
  useSeo(SITE_SEO["/download"]);

  // Decided after hydration: the page is prerendered, and the server cannot know the browser.
  const [inAppBrowser, setInAppBrowser] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  // A phone's Chrome blocks the message-reading APK outright, so a phone is
  // never offered it to download - only told how to get it ("do not confuse the
  // user with giving him an apk that will be blocked anyway", 8 Oct 2026).
  // Unknown until the browser is read: the page is prerendered.
  const [onPhone, setOnPhone] = useState<boolean | null>(null);
  const [tapped, setTapped] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setInAppBrowser(IN_APP_BROWSER.test(navigator.userAgent));
    setIsAndroid(/Android/i.test(navigator.userAgent));
    setOnPhone(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
  }, []);

  const copyLink = async () => {
    const pageUrl = `${window.location.origin}/download`;
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link and open it in Chrome:", pageUrl);
    }
  };

  const helpButtons = (size: string) => (
    <div className="mt-3 flex flex-wrap gap-3">
      {isAndroid && (
        <a href={openInChromeHref()} className={`btn-line ${size}`} data-testid="open-in-chrome">
          <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open in Chrome
        </a>
      )}
      <button type="button" onClick={copyLink} className={`btn-line ${size}`}>
        {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );

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
          {inAppBrowser && (
            <div className="mx-auto mb-6 max-w-xl rounded-[4px] border-2 border-accent bg-card p-4 text-left" role="alert" data-testid="in-app-browser">
              <p className="font-bold text-foreground">This browser cannot download apps.</p>
              <p className="mt-1 text-sm text-foreground/75">
                You opened this link inside another app. Open it in Chrome, then tap Download for Android there.
              </p>
              {helpButtons("h-11 px-5 text-base")}
            </div>
          )}
          <a
            href={JAMVI_APK_PATH}
            onClick={() => setTapped(true)}
            className="btn-mat h-14 px-7 text-lg"
            data-testid="download-android"
          >
            <DownloadIcon className="h-5 w-5" aria-hidden="true" />
            Download for Android
          </a>
          <p className="mt-3 text-sm text-foreground/60">About 60 MB, so Wi-Fi is best. Android 7 or newer.</p>
          {tapped && (
            <div className="mx-auto mt-6 max-w-xl rounded-[4px] bg-card p-4 text-left shadow-sm" role="status" data-testid="download-help">
              <p className="font-bold text-foreground">Download not starting?</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/75">
                <li>Look at the bottom of the screen: Chrome may be asking you to tap <strong>Download anyway</strong>.</li>
                <li>Open Chrome&rsquo;s menu (&#8942;), then <strong>Downloads</strong>. A held-back APK waits there for you to keep it.</li>
                <li>Opened from WhatsApp, Facebook or Instagram? Open this page in Chrome instead.</li>
              </ul>
              {helpButtons("h-10 px-4 text-sm")}
            </div>
          )}
        </div>
      </section>

      <section className="pb-12 px-4" id="read-mpesa-messages" data-testid="sms-version">
        <div className="container mx-auto max-w-3xl rounded-[4px] border-2 border-accent bg-card p-6 shadow-sm sm:p-8">
          <h2 className="mb-2 flex items-center gap-2 text-xl font-bold text-primary">
            <MessageSquare className="h-5 w-5" aria-hidden="true" /> Want Jamvi to read your M-Pesa messages?
          </h2>
          <p className="mb-4 text-foreground/75">
            There is a version that fills in your budget straight from M-Pesa&rsquo;s text messages. Because it asks to read
            messages, Chrome on a phone blocks it for now while Google reviews it. Get it with a computer instead:
          </p>
          {onPhone && (
            <div className="mb-4 rounded-[4px] bg-muted/40 p-4 text-sm text-foreground/80" data-testid="sms-version-on-phone">
              <p className="font-bold text-foreground">You are on a phone, so there is no download button here - it would only be blocked.</p>
              <p className="mt-1">
                Open <strong>jamvi.co.ke/download</strong> on a computer and follow the steps below. Or, if someone you know
                already has it, they can send it to you on WhatsApp as a document.
              </p>
              <button type="button" onClick={copyLink} className="btn-line mt-3 h-10 px-4 text-sm" data-testid="sms-version-copy-link">
                {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied ? "Link copied" : "Copy the link for the computer"}
              </button>
            </div>
          )}
          <ol className="space-y-3">
            {SMS_VERSION_STEPS.map((step, index) => (
              <li key={step} className="flex gap-3 text-foreground/80">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] bg-primary/10 text-sm font-bold text-primary">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {onPhone === false && (
            <a href={JAMVI_SMS_APK_PATH} className="btn-line mt-5 h-12 px-5 text-base" data-testid="download-sms-version">
              <Laptop className="h-5 w-5" aria-hidden="true" /> Download the message-reading version
            </a>
          )}
          <p className="mt-3 text-sm text-foreground/60">
            Already have Jamvi? It installs over it and keeps everything. No computer? Use the button above; you can still
            import your M-Pesa statement or paste messages in.
          </p>
        </div>
      </section>

      <section className="pb-12 px-4" id="getting-started" data-testid="getting-started">
        <div className="container mx-auto max-w-3xl rounded-[4px] border-2 border-primary bg-card p-6 shadow-sm sm:p-8">
          <h2 className="mb-2 flex items-center gap-2 text-xl font-bold text-primary">
            <Rocket className="h-5 w-5" aria-hidden="true" /> Getting started with your M-Pesa
          </h2>
          <p className="mb-4 text-foreground/75">
            One statement brings in everything from the day you choose. After that, Jamvi keeps up on its own.
          </p>
          <ol className="space-y-4">
            {GETTING_STARTED.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] bg-primary text-sm font-bold text-primary-foreground">{index + 1}</span>
                <span>
                  <span className="block font-semibold text-foreground">{step.title}</span>
                  <span className="text-foreground/75">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
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
            <p className="text-sm text-foreground/70">The <a href="#read-mpesa-messages" className="text-primary underline">message-reading version</a> reads M-Pesa&rsquo;s messages for you, but only if you ask it to and Android asks you first. <a href="/privacy" className="text-primary underline">How that works</a>.</p>
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
