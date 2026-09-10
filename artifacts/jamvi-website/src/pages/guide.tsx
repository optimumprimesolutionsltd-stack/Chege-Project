import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, Clock } from "lucide-react";
import { useSeo } from "@/hooks/use-seo";
import { JAMVI_APP_PATH } from "@/lib/site-links";
import { GUIDES, type Guide } from "@/lib/guides";
import { TRIAL_DAYS } from "@workspace/jamvi-pricing";

/**
 * One guide.
 *
 * A plain article: heading, a lede, a handful of sections, a takeaway, and one
 * link to the part of Jamvi that does the tedious bit. The other guides sit at
 * the foot so a reader — and a crawler — moves between them.
 */
export function GuidePage({ guide }: { guide: Guide }) {
  useSeo({ title: guide.title, description: guide.description });

  const others = GUIDES.filter((entry) => entry.slug !== guide.slug);
  const updated = new Date(guide.updated).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col bg-white">
      <article className="mx-auto w-full max-w-3xl px-4 pt-16 pb-8 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <p className="mb-4 text-sm font-bold uppercase tracking-widest text-secondary">
            <Link href="/guides" className="hover:underline">Guides</Link>
          </p>
          <h1 className="mb-5 text-4xl font-bold leading-[1.14] text-primary sm:text-5xl">
            {guide.heading}
          </h1>
          <p className="mb-6 text-lg leading-relaxed text-foreground/70">{guide.intro}</p>
          <p className="flex items-center gap-2 text-sm text-foreground/50">
            <Clock className="h-4 w-4" aria-hidden="true" />
            {guide.readingMinutes} min read
            <span aria-hidden="true">·</span>
            Reviewed {updated}
          </p>
        </motion.div>

        <div className="prose prose-lg mt-12 max-w-none prose-headings:font-bold prose-headings:text-primary prose-p:text-foreground/80 prose-p:leading-relaxed">
          {guide.sections.map((section) => (
            <section key={section.heading} className="mt-10 first:mt-0">
              <h2 className="text-2xl">{section.heading}</h2>
              {section.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <div className="my-12 rounded-3xl border border-secondary/20 bg-secondary/10 p-8">
          <h2 className="mb-3 mt-0 text-xl font-bold text-secondary">The short version</h2>
          <p className="m-0 font-medium leading-relaxed text-foreground">{guide.takeaway}</p>
        </div>

        <div className="rounded-3xl border border-border/60 bg-muted/40 p-8">
          <p className="mb-2 text-sm font-bold uppercase tracking-widest text-primary/60">
            Where Jamvi helps
          </p>
          <h2 className="mb-3 mt-0 text-2xl font-bold text-primary">{guide.related.label}</h2>
          <p className="mb-6 leading-relaxed text-foreground/70">{guide.related.blurb}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={guide.related.slug}
              className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-white transition-colors hover:bg-primary/90"
            >
              {guide.related.label} <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <a
              href={JAMVI_APP_PATH}
              className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-white px-6 text-sm font-bold text-primary transition-colors hover:bg-muted"
            >
              Start free for {TRIAL_DAYS} days
            </a>
          </div>
        </div>
      </article>

      <section className="border-t border-border bg-muted/30 py-14">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-6 text-xl font-bold text-primary">More guides</h2>
          <ul className="space-y-3">
            {others.map((other) => (
              <li key={other.slug}>
                <Link
                  href={other.slug}
                  className="group flex items-start gap-3 rounded-2xl border border-border bg-white p-4 transition-colors hover:bg-white/60"
                >
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-secondary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  <span>
                    <span className="block font-bold text-primary">{other.heading}</span>
                    <span className="block text-sm text-foreground/60">{other.description}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
