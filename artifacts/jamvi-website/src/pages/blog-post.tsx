import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, Clock, Download } from "lucide-react";
import { useSeo } from "@/hooks/use-seo";
import { JAMVI_APP_PATH } from "@/lib/site-links";
import { BLOG_POSTS, type BlogPost } from "@/lib/blog";
import { TRIAL_DAYS } from "@workspace/jamvi-pricing";

/**
 * One blog post.
 *
 * Reads like a guide — heading, lede, sections — but a post can carry a dated
 * timeline and bold-led benefit lines, and it closes on the same call to
 * action the home page ends with. Other posts sit at the foot.
 */
export function BlogPostPage({ post }: { post: BlogPost }) {
  useSeo({ title: post.title, description: post.description });

  const others = BLOG_POSTS.filter((entry) => entry.slug !== post.slug);
  const published = new Date(post.published).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col bg-background">
      <article className="mx-auto w-full max-w-3xl px-4 pt-16 pb-16 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0.85, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <p className="mb-4 text-sm font-bold uppercase tracking-widest text-secondary">
            <Link href="/blog" className="hover:underline">Blog</Link>
          </p>
          <h1 className="mb-5 text-4xl font-bold leading-[1.14] text-primary sm:text-5xl">
            {post.heading}
          </h1>
          <p className="mb-6 text-lg leading-relaxed text-foreground/70">{post.intro}</p>
          <p className="flex items-center gap-2 text-sm text-foreground/50">
            <Clock className="h-4 w-4" aria-hidden="true" />
            {post.readingMinutes} min read
            <span aria-hidden="true">·</span>
            {published}
          </p>
        </motion.div>

        <div className="prose prose-lg mt-12 max-w-none prose-headings:font-bold prose-headings:text-primary prose-p:text-foreground/80 prose-p:leading-relaxed">
          {post.sections.map((section) => (
            <section key={section.heading} className="mt-10 first:mt-0">
              <h2 className="text-2xl">{section.heading}</h2>
              {section.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}

              {section.milestones && (
                <ol className="not-prose mt-6 border-l-2 border-secondary/30 pl-0">
                  {section.milestones.map((milestone) => (
                    <li key={`${milestone.date}-${milestone.title}`} className="relative pb-6 pl-6 last:pb-0">
                      <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-secondary" aria-hidden="true" />
                      <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-secondary">
                        {milestone.date}
                      </p>
                      <p className="mt-1 font-bold text-primary">{milestone.title}</p>
                      <p className="mt-1 leading-relaxed text-foreground/70">{milestone.text}</p>
                    </li>
                  ))}
                </ol>
              )}

              {section.points?.map((point) => (
                <p key={point.title}>
                  <strong className="text-primary">{point.title}</strong> {point.text}
                </p>
              ))}
            </section>
          ))}
        </div>
      </article>

      {/* The same close as the home page: the mat-coloured band, one strong button. */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <h2 className="text-4xl font-extrabold leading-[0.95] md:text-5xl">{post.cta.heading}</h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-primary-foreground/80">{post.cta.text}</p>
          <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
            <a
              href={JAMVI_APP_PATH}
              className="btn-mat h-14 px-7 text-base !bg-accent !text-accent-foreground"
              style={{ boxShadow: "6px 6px 0 hsl(var(--clay-bright))" }}
            >
              Try {TRIAL_DAYS} days free <ArrowRight className="h-5 w-5" />
            </a>
            <Link
              href="/download"
              className="inline-flex items-center gap-2 font-bold text-primary-foreground underline decoration-accent decoration-[3px] underline-offset-[6px] hover:decoration-primary-foreground"
            >
              <Download className="h-5 w-5" aria-hidden="true" /> Get the Android app
            </Link>
          </div>
        </div>
      </section>

      {others.length > 0 && (
        <section className="border-t border-border bg-muted/30 py-14">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <h2 className="mb-6 text-xl font-bold text-primary">More from the blog</h2>
            <ul className="space-y-3">
              {others.map((other) => (
                <li key={other.slug}>
                  <Link
                    href={other.slug}
                    className="group flex items-start gap-3 rounded-[4px] border border-border bg-card p-4 transition-colors hover:bg-white/60"
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
      )}
    </div>
  );
}
