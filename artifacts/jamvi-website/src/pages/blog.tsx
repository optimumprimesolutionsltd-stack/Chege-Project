import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, Clock } from "lucide-react";
import { useSeo } from "@/hooks/use-seo";
import { SITE_SEO } from "@/lib/site-seo";
import { BLOG_POSTS } from "@/lib/blog";

/**
 * The blog page. Every post is linked from here, newest first, which is how a
 * reader browses them and how a crawler reaching this page finds the rest.
 */
export default function Blog() {
  useSeo(SITE_SEO["/blog"]);

  const posts = [...BLOG_POSTS].sort((a, b) => b.published.localeCompare(a.published));

  return (
    <div className="flex flex-col bg-background">
      <section className="border-b border-border bg-muted/30 pt-20 pb-14">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0.85, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <p className="mb-4 text-sm font-bold uppercase tracking-widest text-secondary">Blog</p>
            <h1 className="mb-5 text-4xl font-bold leading-[1.14] text-primary sm:text-5xl">
              News from the mat
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-foreground/70">
              What we have built into Jamvi, what changed, and what it means for your money and
              your group's.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <ul className="space-y-5">
            {posts.map((post) => (
              <li key={post.slug}>
                <Link
                  href={post.slug}
                  className="group block rounded-[4px] border border-border/60 bg-card p-7 transition-colors hover:border-secondary/40 hover:bg-muted/30"
                >
                  <h2 className="mb-2 text-2xl font-bold text-primary group-hover:text-secondary">
                    {post.heading}
                  </h2>
                  <p className="mb-4 leading-relaxed text-foreground/70">{post.description}</p>
                  <p className="flex items-center gap-2 text-sm font-medium text-secondary">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    {post.readingMinutes} min read
                    <span aria-hidden="true">·</span>
                    {new Date(post.published).toLocaleDateString("en-KE", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
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
