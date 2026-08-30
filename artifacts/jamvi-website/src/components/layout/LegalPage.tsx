import type { ReactNode } from "react";

/**
 * Shared shell for the Terms and the Privacy Policy.
 *
 * These two pages are read rarely and under pressure — usually by somebody
 * deciding whether to trust us with a group's money records, or checking what
 * we do with their data. So they are plain, unanimated, and readable, rather
 * than styled like the marketing pages.
 */

export function LegalPage({
  title,
  effective,
  children,
}: {
  title: string;
  effective: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <section className="pt-24 pb-12 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">
            {title}
          </h1>
          <p className="text-primary-foreground/70 text-sm font-medium">
            Effective {effective} · Jamvi is operated by Optimum Prime Solutions Ltd, Nairobi, Kenya.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div
          className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl
            [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-primary
            [&_h2]:mt-12 [&_h2]:mb-4 [&_h2:first-child]:mt-0
            [&_h3]:font-semibold [&_h3]:text-lg [&_h3]:text-primary [&_h3]:mt-8 [&_h3]:mb-3
            [&_p]:text-foreground/75 [&_p]:leading-relaxed [&_p]:mb-4
            [&_li]:text-foreground/75 [&_li]:leading-relaxed [&_li]:mb-2
            [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4
            [&_strong]:text-primary [&_strong]:font-semibold
            [&_a]:text-secondary [&_a]:underline [&_a]:underline-offset-2"
        >
          {children}
        </div>
      </section>
    </div>
  );
}
