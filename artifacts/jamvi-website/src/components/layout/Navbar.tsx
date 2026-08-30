import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
    { href: "/about", label: "About" },
    { href: "/faq", label: "FAQ" }
  ];

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b border-border/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <div className="flex items-center justify-between h-20">
          <Link href="/" className="flex-shrink-0 flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded">
            <img src={`${import.meta.env.BASE_URL}branding/jamvi-wordmark.png`} alt="Jamvi" className="h-9 w-auto object-contain" />
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link 
                key={link.href} 
                href={link.href} 
                className={`text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded px-2 py-1 ${
                  location === link.href ? "text-secondary" : "text-foreground/80 hover:text-secondary"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <a 
              href={JAMVI_APP_PATH}
              className="text-sm font-medium text-foreground hover:text-secondary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded px-3 py-2"
            >
              Log in
            </a>
            <a 
              href={JAMVI_APP_PATH}
              className="inline-flex items-center justify-center h-10 px-6 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-transform hover:scale-105 active:scale-95 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Sign up
            </a>
          </div>

          <button 
            className="md:hidden p-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded" 
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
            aria-expanded={isOpen}
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="md:hidden bg-white border-b border-border overflow-hidden"
          >
            <div className="px-4 pt-2 pb-6 space-y-2 container mx-auto">
              {navLinks.map((link) => (
                <Link 
                  key={link.href} 
                  href={link.href} 
                  className={`block text-lg font-medium py-3 px-4 rounded-xl ${
                    location === link.href ? "bg-muted text-secondary" : "text-foreground hover:bg-muted"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-4 mt-2 flex flex-col gap-3 border-t border-border px-4">
                <a 
                  href={JAMVI_APP_PATH}
                  className="block text-center text-lg font-medium text-foreground py-3 rounded-xl border border-border hover:bg-muted transition-colors"
                >
                  Log in
                </a>
                <a 
                  href={JAMVI_APP_PATH}
                  className="block text-center text-lg font-medium bg-primary text-primary-foreground rounded-full py-3 hover:bg-primary/90 transition-colors shadow-sm"
                >
                  Sign up
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
