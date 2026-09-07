import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, Check, CheckCircle2 } from "lucide-react";
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
      <section className="relative overflow-hidden bg-white pt-20 pb-16">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_right,var(--color-muted),transparent_55%)] opacity-60" />
        <div className="container relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <p className="mb-4 text-sm font-bold uppercase tracking-widest text-secondary">
              {segment.label}
            </p>
            <h1 className="mb-6 text-4xl font-bold leading-[1.12] text-primary sm:text-5xl lg:text-6xl">
              {segment.heading}
            </h1>
            <p className="mb-8 max-w-2xl text-lg leading-relaxed text-foreground/70 sm:text-xl">
              {segment.subheading}
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <a
                href={JAMVI_APP_PATH}
                className="inline-flex h-14 items-center justify-center rounded-full bg-primary px-8 text-base font-bold text-white shadow-lg transition-transform hover:scale-105 hover:bg-primary/90 active:scale-95"
              >
                Start free for {TRIAL_DAYS} days <ArrowRight className="ml-2 h-5 w-5" />
              </a>
              <Link
                href="/pricing"
                className="inline-flex h-14 items-center justify-center rounded-full border border-border bg-white px-8 text-base font-bold text-primary transition-colors hover:bg-muted"
              >
                See pricing
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* The situation the reader is already in. Naming it plainly earns the
          right to describe the tool. */}
      <section className="border-y border-border bg-muted/30 py-16">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <p className="font-serif text-xl leading-relaxed text-foreground/80 sm:text-2xl">
            {segment.problem}
          </p>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-12 text-3xl font-bold text-primary md:text-4xl">
            What Jamvi does about it
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {segment.points.map((point) => (
              <div
                key={point.title}
                className="rounded-3xl border border-border/50 bg-muted/40 p-8 transition-colors hover:bg-muted"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
                  <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mb-3 text-xl font-bold text-primary">{point.title}</h3>
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
                className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-3 font-medium"
              >
                <Check className="h-4 w-4 text-accent" aria-hidden="true" />
                {section}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-10 text-3xl font-bold text-primary md:text-4xl">
            Questions {segment.label.toLowerCase()} ask
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
                className="rounded-full border border-border bg-white px-5 py-3 font-medium text-primary transition-colors hover:bg-white/60"
              >
                {other.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20 text-center">
        <div className="container mx-auto max-w-3xl px-4">
          <h2 className="mb-6 text-3xl font-bold text-primary md:text-4xl">
            Start with your next contribution
          </h2>
          <p className="mx-auto mb-8 max-w-xl leading-relaxed text-foreground/70">
            Setup takes a couple of minutes, and the first {TRIAL_DAYS} days are free.
          </p>
          <a
            href={JAMVI_APP_PATH}
            className="inline-flex h-16 items-center justify-center rounded-full bg-secondary px-10 text-lg font-bold text-white shadow-xl transition-transform hover:scale-105 hover:bg-secondary/90 active:scale-95"
          >
            Create your free account
          </a>
        </div>
      </section>
    </div>
  );
}
