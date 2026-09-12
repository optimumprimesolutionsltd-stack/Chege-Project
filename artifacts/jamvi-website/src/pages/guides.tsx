import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, Clock } from "lucide-react";
import { useSeo } from "@/hooks/use-seo";
import { SITE_SEO } from "@/lib/site-seo";
import { GUIDES } from "@/lib/guides";

/**
 * The guides hub. Every guide is linked from here, which is how a reader
 * browses them and how a crawler reaching this page finds the rest.
 */
export default function Guides() {
  useSeo(SITE_SEO["/guides"]);

  return (
    <div className="flex flex-col bg-white">
      <section className="border-b border-border bg-muted/30 pt-20 pb-14">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <p className="mb-4 text-sm font-bold uppercase tracking-widest text-secondary">Guides</p>
            <h1 className="mb-5 text-4xl font-bold leading-[1.14] text-primary sm:text-5xl">
              Keeping group money clear
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-foreground/70">
              Practical notes on the parts that cause arguments — chama records, who has paid,
              splitting the bills at home — plus straight answers on how Jamvi itself works, what
              it costs and how M-Pesa payments go through.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <ul className="space-y-5">
            {GUIDES.map((guide) => (
              <li key={guide.slug}>
                <Link
                  href={guide.slug}
                  className="group block rounded-3xl border border-border/60 bg-white p-7 transition-colors hover:border-secondary/40 hover:bg-muted/30"
                >
                  <h2 className="mb-2 text-2xl font-bold text-primary group-hover:text-secondary">
                    {guide.heading}
                  </h2>
                  <p className="mb-4 leading-relaxed text-foreground/70">{guide.description}</p>
                  <p className="flex items-center gap-2 text-sm font-medium text-secondary">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    {guide.readingMinutes} min read
                    <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
