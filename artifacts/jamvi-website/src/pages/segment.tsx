import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, Check } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useSeo } from "@/hooks/use-seo";
import { JAMVI_APP_PATH } from "@/lib/site-links";
import { SEGMENTS, type Segment } from "@/lib/segments";
import { TRIAL_DAYS } from "@workspace/jamvi-pricing";

/**
 * One page per kind of group.
 *
 * Every segment gets the same shape - the situation, what the app does about
 * it, what the group starts with, and the questions that kind of group
 * actually asks - because the shape is not what distinguishes them. The words
 * are, and those live in segments.ts.
 *
 * The links to the other segments at the foot are not decoration: they are how
 * a crawler arriving on one of these finds the rest, and how a reader who
 * picked the wrong one gets to the right one.
 */
export function SegmentPage({ segment }: { segment: Segment }) {
  useSeo({ title: segment.title, description: segment.description });

  const others = SEGMENTS.filter((entry) => entry.slug !== segment.slug);

  return (
    <div className="flex flex-col">
      <section className="relative pt-16 pb-16 lg:pt-20">
        <div className="container relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0.85, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <p className="kicker mb-4">
              {segment.label}
            </p>
            <h1 className="mb-6 text-[2.6rem] font-extrabold leading-[0.98] text-foreground sm:text-6xl lg:text-7xl">
              {segment.heading}
            </h1>
            <p className="mb-8 max-w-2xl text-lg leading-relaxed text-foreground/70 sm:text-xl">
              {segment.subheading}
            </p>
            <div className="flex flex-col gap-5 sm:flex-row">
              <a
                href={JAMVI_APP_PATH}
                className="btn-mat h-14 px-8 text-base"
              >
                Start free for {TRIAL_DAYS} days <ArrowRight className="ml-2 h-5 w-5" />
              </a>
              <Link
                href="/pricing"
                className="btn-line h-14 px-8 text-base"
              >
                See pricing
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* The situation the reader is already in. Naming it plainly earns the
          right to describe the tool. */}
      <div className="weave" aria-hidden="true" />
      <section className="bg-accent py-16">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <p className="font-serif text-xl font-semibold leading-relaxed text-accent-foreground sm:text-2xl">
            {segment.problem}
          </p>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-12 text-4xl font-extrabold leading-none md:text-5xl">
            What Jamvi does about it
          </h2>
          <div className="grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-2">
            {segment.points.map((point) => (
              <div key={point.title} className="border-t-4 border-primary pt-5">
                <h3 className="mb-3 text-2xl font-bold">{point.title}</h3>
                <p className="leading-relaxed text-foreground/70">{point.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What the group sees on day one. Concrete, and it answers the question
          every treasurer asks before signing up: how much do I have to set up? */}
      <section className="bg-primary py-20 text-primary-foreground">
        <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-4 font-serif text-3xl font-bold md:text-4xl">
            What you start with
          </h2>
          <p className="mb-8 max-w-2xl leading-relaxed text-primary-foreground/80">
            {segment.sectionsNote}
          </p>
          <ul className="flex flex-wrap gap-3">
            {segment.sections.map((section) => (
              <li
                key={section}
                className="inline-flex items-center gap-2 rounded-[3px] bg-white/10 px-5 py-3 font-medium"
              >
                <Check className="h-4 w-4 text-accent" aria-hidden="true" />
                {section}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-card py-20">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-10 text-3xl font-bold text-primary md:text-4xl">
            {segment.faqHeading ?? `Questions ${segment.label.toLowerCase()} ask`}
          </h2>
          <Accordion type="single" collapsible className="w-full">
            {segment.faqs.map((faq, index) => (
              <AccordionItem key={faq.question} value={`item-${index}`}>
                <AccordionTrigger className="text-left text-lg font-bold text-primary">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-base leading-relaxed text-foreground/70">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30 py-16">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-8 text-xl font-bold text-primary">Jamvi is also used by</h2>
          <div className="flex flex-wrap gap-3">
            {others.map((other) => (
              <Link
                key={other.slug}
                href={other.slug}
                className="rounded-[3px] border border-border bg-card px-5 py-3 font-medium text-primary transition-colors hover:bg-white/60"
              >
                {other.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-card py-20 text-center">
        <div className="container mx-auto max-w-3xl px-4">
          <h2 className="mb-6 text-3xl font-bold text-primary md:text-4xl">
            {segment.ctaHeading ?? "Start with your next contribution"}
          </h2>
          <p className="mx-auto mb-8 max-w-xl leading-relaxed text-foreground/70">
            Setup takes a couple of minutes, and the first {TRIAL_DAYS} days are free.
          </p>
          <a
            href={JAMVI_APP_PATH}
            className="btn-mat h-16 px-10 text-lg"
          >
            Create your free account
          </a>
        </div>
      </section>
    </div>
  );
}
