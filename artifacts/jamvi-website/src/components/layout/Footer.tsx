import { Link } from "wouter";
import { JAMVI_APP_PATH, JAMVI_SUPPORT_EMAIL } from "@/lib/site-links";
import { SEGMENTS } from "@/lib/segments";
import { GUIDES } from "@/lib/guides";

export function Footer() {
  return (
    <footer className="bg-foreground text-primary-foreground">
      <div className="weave" aria-hidden="true" />
      <div className="py-16 md:py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-12 lg:gap-16">
          <div className="md:col-span-1">
            <Link href="/" className="inline-block mb-6 focus-visible:ring-2 focus-visible:ring-white rounded-sm outline-none">
              <img src={`${import.meta.env.BASE_URL}branding/jamvi-wordmark.png`} alt="Jamvi" className="h-11 w-auto brightness-0 invert opacity-95" />
            </Link>
            <p className="text-primary-foreground/80 text-sm leading-relaxed max-w-xs font-medium">
              Pesa wazi. Your own budget and every group you belong to, on one mat.
            </p>
          </div>
          
          <div>
            <h4 className="font-mono text-xs uppercase tracking-[0.12em] mb-5 text-accent font-semibold">Product</h4>
            <ul className="space-y-3">
              <li><Link href="/features" className="text-primary-foreground/80 hover:text-accent hover:underline underline-offset-4 transition-colors text-[15px] outline-none focus-visible:text-accent">Features</Link></li>
              <li><Link href="/pricing" className="text-primary-foreground/80 hover:text-accent hover:underline underline-offset-4 transition-colors text-[15px] outline-none focus-visible:text-accent">Pricing</Link></li>
              <li><a href={JAMVI_APP_PATH} className="text-primary-foreground/80 hover:text-accent hover:underline underline-offset-4 transition-colors text-[15px] outline-none focus-visible:text-accent">Sign up free</a></li>
              <li><Link href="/download" className="text-primary-foreground/80 hover:text-accent hover:underline underline-offset-4 transition-colors text-[15px] outline-none focus-visible:text-accent">Android app</Link></li>
            </ul>
          </div>

          {/* Every audience page hangs off here. Without it they would exist
              and be reachable only from each other. */}
          <div>
            <h4 className="font-mono text-xs uppercase tracking-[0.12em] mb-5 text-accent font-semibold">Who it is for</h4>
            <ul className="space-y-3">
              {SEGMENTS.map((segment) => (
                <li key={segment.slug}>
                  <Link href={segment.slug} className="text-primary-foreground/80 hover:text-accent hover:underline underline-offset-4 transition-colors text-[15px] outline-none focus-visible:text-accent">{segment.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* The guides hub and each article, so a crawler reaching the footer
              from any page finds the informational pages too. */}
          <div>
            <h4 className="font-mono text-xs uppercase tracking-[0.12em] mb-5 text-accent font-semibold">Guides</h4>
            <ul className="space-y-3">
              <li><Link href="/guides" className="text-primary-foreground/80 hover:text-accent hover:underline underline-offset-4 transition-colors text-[15px] outline-none focus-visible:text-accent">All guides</Link></li>
              {GUIDES.map((guide) => (
                <li key={guide.slug}>
                  <Link href={guide.slug} className="text-primary-foreground/80 hover:text-accent hover:underline underline-offset-4 transition-colors text-[15px] outline-none focus-visible:text-accent">{guide.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-mono text-xs uppercase tracking-[0.12em] mb-5 text-accent font-semibold">Company</h4>
            <ul className="space-y-3">
              <li><Link href="/about" className="text-primary-foreground/80 hover:text-accent hover:underline underline-offset-4 transition-colors text-[15px] outline-none focus-visible:text-accent">Our Story</Link></li>
              <li><Link href="/blog" className="text-primary-foreground/80 hover:text-accent hover:underline underline-offset-4 transition-colors text-[15px] outline-none focus-visible:text-accent">Blog</Link></li>
              <li><Link href="/faq" className="text-primary-foreground/80 hover:text-accent hover:underline underline-offset-4 transition-colors text-[15px] outline-none focus-visible:text-accent">FAQ</Link></li>
              <li><a href={`mailto:${JAMVI_SUPPORT_EMAIL}`} className="text-primary-foreground/80 hover:text-accent hover:underline underline-offset-4 transition-colors text-[15px] outline-none focus-visible:text-accent">Contact</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-mono text-xs uppercase tracking-[0.12em] mb-5 text-accent font-semibold">Legal</h4>
            <ul className="space-y-3">
              <li><Link href="/terms" className="text-primary-foreground/80 hover:text-accent hover:underline underline-offset-4 transition-colors text-[15px] outline-none focus-visible:text-accent">Terms of Service</Link></li>
              <li><Link href="/privacy" className="text-primary-foreground/80 hover:text-accent hover:underline underline-offset-4 transition-colors text-[15px] outline-none focus-visible:text-accent">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-primary-foreground/10 mt-16 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-2 text-primary-foreground/60 text-sm font-medium">
            <p>© {new Date().getFullYear()} Optimum Prime Solutions Ltd. All rights reserved.</p>
            <p className="text-xs">
              Jamvi is a product of{" "}
              <a
                href="https://optimumprimesolutions.co.ke"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-foreground/75 hover:text-accent transition-colors"
              >
                Optimum Prime Solutions Ltd, Nairobi.
              </a>
            </p>
          </div>
          <div className="flex items-center gap-2 text-primary-foreground/60 text-sm font-medium">
            <span className="w-2.5 h-2.5 bg-accent inline-block"></span>
            Proudly built in Kenya
          </div>
        </div>
      </div>
      </div>
    </footer>
  );
}
