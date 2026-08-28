import { Link } from "wouter";
import { JAMVI_APP_PATH, JAMVI_SUPPORT_EMAIL } from "@/lib/site-links";

export function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground py-16 md:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 lg:gap-16">
          <div className="md:col-span-1">
            <Link href="/" className="inline-block mb-6 focus-visible:ring-2 focus-visible:ring-white rounded outline-none">
              <img src={`${import.meta.env.BASE_URL}branding/jamvi-wordmark.png`} alt="Jamvi" className="h-11 w-auto brightness-0 invert opacity-95" />
            </Link>
            <p className="text-primary-foreground/80 text-sm leading-relaxed max-w-xs font-medium">
              The shared mat where personal and group money meets. Built for trust, transparency, and the Kenyan everyday.
            </p>
          </div>
          
          <div>
            <h4 className="font-serif text-lg mb-6 text-white font-medium">Product</h4>
            <ul className="space-y-4">
              <li><Link href="/features" className="text-primary-foreground/70 hover:text-accent transition-colors text-sm font-medium outline-none focus-visible:text-accent">Features</Link></li>
              <li><Link href="/pricing" className="text-primary-foreground/70 hover:text-accent transition-colors text-sm font-medium outline-none focus-visible:text-accent">Pricing</Link></li>
              <li><a href={JAMVI_APP_PATH} className="text-primary-foreground/70 hover:text-accent transition-colors text-sm font-medium outline-none focus-visible:text-accent">Sign up free</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-serif text-lg mb-6 text-white font-medium">Company</h4>
            <ul className="space-y-4">
              <li><Link href="/about" className="text-primary-foreground/70 hover:text-accent transition-colors text-sm font-medium outline-none focus-visible:text-accent">Our Story</Link></li>
              <li><Link href="/faq" className="text-primary-foreground/70 hover:text-accent transition-colors text-sm font-medium outline-none focus-visible:text-accent">FAQ</Link></li>
              <li><a href={`mailto:${JAMVI_SUPPORT_EMAIL}`} className="text-primary-foreground/70 hover:text-accent transition-colors text-sm font-medium outline-none focus-visible:text-accent">Contact</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-serif text-lg mb-6 text-white font-medium">Legal</h4>
            <ul className="space-y-4">
              <li><a href="#" className="text-primary-foreground/70 hover:text-accent transition-colors text-sm font-medium outline-none focus-visible:text-accent">Terms of Service</a></li>
              <li><a href="#" className="text-primary-foreground/70 hover:text-accent transition-colors text-sm font-medium outline-none focus-visible:text-accent">Privacy Policy</a></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-primary-foreground/10 mt-16 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-2 text-primary-foreground/60 text-sm font-medium">
            <p>© {new Date().getFullYear()} Jamvi Platform. All rights reserved.</p>
            <p className="text-xs">
              A product by{" "}
              <a
                href="https://optimumprimesolutions.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-foreground/75 hover:text-accent transition-colors"
              >
                Optimum Prime Solutions
              </a>
            </p>
          </div>
          <div className="flex items-center gap-2 text-primary-foreground/60 text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-accent inline-block"></span>
            Proudly built in Kenya
          </div>
        </div>
      </div>
    </footer>
  );
}
