import { Link, useLocation } from "wouter";
import { Download, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { JAMVI_APP_PATH } from "@/lib/site-links";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    setIsOpen(false);
    window.scrollTo(0, 0);
  }, [location]);

  const navLinks = [
    { href: "/features", label: "Features" },
    { href: "/pricing", label: "Pricing" },
    { href: "/guides", label: "Guides" },
    { href: "/about", label: "About" },
    { href: "/faq", label: "FAQ" },
    { href: "/download", label: "Get the app" }
  ];

  const isActive = (href: string) => location === href || location.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-50 w-full bg-background">
      {/* The mat's edge. The same strip closes the footer. */}
      <div className="weave-thin" aria-hidden="true" />
      <div className="border-b-2 border-foreground/10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          <div className="flex items-center justify-between h-[4.5rem]">
            <Link href="/" className="flex-shrink-0 flex items-center outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
              <img src={`${import.meta.env.BASE_URL}branding/jamvi-wordmark.png`} alt="Jamvi" className="h-9 w-auto object-contain" />
            </Link>

            <nav className="hidden md:flex items-center gap-7">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={`text-[15px] py-1 border-b-[3px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm ${
                    isActive(link.href)
                      ? "border-accent text-foreground font-bold"
                      : "border-transparent text-foreground/75 hover:text-foreground hover:border-accent/60"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="hidden md:flex items-center gap-5">
              <a
                href={JAMVI_APP_PATH}
                className="text-[15px] font-bold text-primary hover:underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                Log in
              </a>
              <a href={JAMVI_APP_PATH} className="btn-mat btn-mat-sm h-10 px-5 text-[15px]">
                Start free
              </a>
            </div>

            {/* On phones the nav links sit behind the menu, so the app gets its own button. */}
            <div className="md:hidden flex items-center gap-2">
              <Link href="/download" className="btn-line h-9 px-3 text-sm" data-testid="nav-get-app">
                <Download className="h-4 w-4" aria-hidden="true" /> Get the app
              </Link>
              <button
                className="md:hidden p-2 -mr-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Toggle menu"
                aria-expanded={isOpen}
              >
                {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="md:hidden bg-primary text-primary-foreground border-b-4 border-accent">
          <nav className="container mx-auto px-4 py-4 flex flex-col">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`font-serif text-2xl font-bold py-2.5 border-b border-primary-foreground/10 ${
                  isActive(link.href) ? "text-accent" : "text-primary-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-5 flex gap-3">
              <a href={JAMVI_APP_PATH} className="flex-1 text-center font-bold py-3 rounded-[3px] border-2 border-primary-foreground/40">
                Log in
              </a>
              <a href={JAMVI_APP_PATH} className="flex-1 text-center font-bold py-3 rounded-[3px] bg-accent text-accent-foreground">
                Start free
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
