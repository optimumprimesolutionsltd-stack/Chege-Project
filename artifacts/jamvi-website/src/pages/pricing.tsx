import { useSeo } from "@/hooks/use-seo";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Users } from "lucide-react";
import { JAMVI_APP_PATH, JAMVI_SUPPORT_EMAIL } from "@/lib/site-links";
import { JAMVI_PACKAGE, TRIAL_DAYS } from "@workspace/jamvi-pricing";

/**
 * One price, so there is nothing to compare.
 *
 * This page used to lay seven packages side by side with a feature matrix
 * beneath. Jamvi is now a single subscription bought per member, and groups
 * cost nothing on top — so the job of the page changed from "help me choose"
 * to "tell me the price and what it covers".
 */

const pricingFaqs = [
  {
    question: "Does my chama pay as well?",
    answer:
      "No. Groups have no bill at all. Everyone in a Shared budget pays for their own Jamvi subscription, and the group itself is free however many of you there are — two flatmates or fifty chama members.",
  },
  {
    question: "What happens after the free days end?",
    answer:
      `Nothing is deleted, ever. If you do not subscribe, you keep your current month and everything you have already recorded, and you go read-only in any Shared budget you belong to. Earlier months lock rather than disappear, and paying brings all of it straight back.`,
  },
  {
    question: "Can someone join my group before they have paid?",
    answer:
      `Yes. Everyone gets ${TRIAL_DAYS} days free from the day they sign up, so an invitation always works. A group can form and start recording money before anyone pays anything.`,
  },
  {
    question: "How does annual billing work?",
    answer:
      "Annual covers twelve months for the price of ten, so two months are free. It also means one payment a year instead of twelve, which matters if you are paying by M-Pesa.",
  },
  {
    question: "Is there a student price?",
    answer:
      "Yes, through promo codes given to campus representatives, student groups and chama secretaries. If you have a code, enter it when you subscribe. We do not ask anyone to upload a student ID.",
  },
  {
    question: "When does billing start?",
    answer:
      "Payment processing is not live yet. Nothing charges you today, and Jamvi will explain how payment works before any money moves.",
  },
];

export default function Pricing() {
  const shouldReduceMotion = useReducedMotion();
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("monthly");
  const isAnnual = billingInterval === "annual";
  const price = isAnnual ? JAMVI_PACKAGE.annualPriceKes : JAMVI_PACKAGE.monthlyPriceKes;

  useSeo({
    title: "Pricing - One price, groups included",
    description:
      `Jamvi is KES ${JAMVI_PACKAGE.monthlyPriceKes} a month per person, with ${TRIAL_DAYS} days free. Your own budget and every group you are part of, however many people share it.`,
  });

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <section className="pt-24 pb-10 text-center px-4 max-w-3xl mx-auto">
        <motion.h1
          initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary mb-6 font-serif"
        >
          One price. Groups included.
        </motion.h1>
        <motion.p
          initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: shouldReduceMotion ? 0 : 0.08 }}
          className="text-lg text-foreground/70 leading-relaxed"
        >
          Everyone pays for themselves. A Shared budget costs nothing extra, whether it is
          you and a flatmate or a chama of fifty.
        </motion.p>
      </section>

      <section className="pb-6 px-4">
        <div
          role="group"
          aria-label="Billing interval"
          className="mx-auto flex w-fit items-center gap-1 rounded-full bg-muted p-1"
        >
          <button
            aria-pressed={!isAnnual}
            onClick={() => setBillingInterval("monthly")}
            className={`px-6 py-3 rounded-full text-sm font-bold transition-all ${
              !isAnnual
                ? "bg-white text-primary shadow-sm ring-1 ring-border"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            Pay Monthly
          </button>
          <button
            aria-pressed={isAnnual}
            onClick={() => setBillingInterval("annual")}
            className={`px-6 py-3 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${
              isAnnual
                ? "bg-white text-primary shadow-sm ring-1 ring-border"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            Pay Annually
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                isAnnual
                  ? "bg-secondary/10 text-secondary"
                  : "bg-muted border border-border text-foreground/60"
              }`}
            >
              2 months free
            </span>
          </button>
        </div>
      </section>

      <section className="pb-24 px-4">
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: shouldReduceMotion ? 0 : 0.12 }}
          className="mx-auto max-w-2xl rounded-[2rem] border-2 border-secondary bg-white p-8 sm:p-10 shadow-xl shadow-secondary/10"
        >
          <div className="flex flex-col gap-1 text-center">
            <h2 className="text-2xl font-bold text-primary">{JAMVI_PACKAGE.displayName}</h2>
            <p className="text-foreground/70">{JAMVI_PACKAGE.description}</p>
          </div>

          <div className="mt-8 flex items-end justify-center gap-2">
            <span className="text-5xl font-bold text-primary tabular-nums">
              KES {price.toLocaleString("en-KE")}
            </span>
            <span className="mb-2 text-foreground/60">
              per person / {isAnnual ? "year" : "month"}
            </span>
          </div>

          <p className="mt-3 text-center text-sm font-semibold text-secondary">
            First {TRIAL_DAYS} days free — no card, no M-Pesa prompt
          </p>

          <div className="mt-8 flex items-center justify-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm text-foreground/70">
            <Users className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
            <span>No limit on how many people share a budget</span>
          </div>

          <ul className="mt-8 flex flex-col gap-3">
            {JAMVI_PACKAGE.featureLabels.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <Check className="mt-1 h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
                <span className="text-foreground/80">{feature}</span>
              </li>
            ))}
          </ul>

          <a
            href={JAMVI_APP_PATH}
            className="mt-9 inline-flex h-14 w-full items-center justify-center rounded-full bg-primary px-8 text-base font-bold text-white shadow-lg transition-transform hover:scale-[1.02] hover:bg-primary/90 active:scale-95"
          >
            Start free for {TRIAL_DAYS} days
          </a>
        </motion.div>
      </section>

      <section className="pb-24 px-4">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-8 text-center text-3xl font-bold text-primary font-serif">
            Questions
          </h2>
          <div className="flex flex-col gap-4">
            {pricingFaqs.map((faq) => (
              <div key={faq.question} className="rounded-2xl border border-border bg-white p-6">
                <h3 className="mb-2 font-bold text-primary">{faq.question}</h3>
                <p className="leading-relaxed text-foreground/70">{faq.answer}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-foreground/70">
            Something not answered here?{" "}
            <a href={`mailto:${JAMVI_SUPPORT_EMAIL}`} className="font-semibold text-secondary hover:underline">
              {JAMVI_SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
