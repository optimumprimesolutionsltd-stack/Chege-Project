import { useSeo } from "@/hooks/use-seo";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { JAMVI_APP_PATH } from "@/lib/site-links";
import { Link } from "wouter";

export default function Pricing() {
  useSeo({
    title: "Pricing - Transparent and fair",
    description: "Start managing personal and group money with simple, honest Jamvi pricing. Begin for free and choose a clear plan as your chama or team grows.",
  });

  return (
    <div className="flex flex-col min-h-screen bg-muted/30">
      {/* Header */}
      <section className="pt-24 pb-16 text-center px-4">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary mb-6 font-serif"
        >
          Simple, honest pricing.
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-lg md:text-xl text-foreground/70 max-w-2xl mx-auto leading-relaxed"
        >
          No hidden fees, no complicated tiers. Start managing your money for free today.
        </motion.p>
      </section>

      {/* Pricing Cards */}
      <section className="pb-24 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            
            {/* Free Tier */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-[2.5rem] p-8 md:p-10 border border-border shadow-lg"
            >
              <h3 className="text-2xl font-bold text-primary mb-2">Personal</h3>
              <p className="text-foreground/60 mb-6">Perfect for individuals and small families.</p>
              
              <div className="mb-8">
                <span className="text-5xl font-bold text-primary">Free</span>
                <span className="text-foreground/50 font-medium ml-2">forever</span>
              </div>
              
              <a href={JAMVI_APP_PATH} className="flex items-center justify-center w-full h-14 rounded-full bg-primary/10 text-primary font-bold hover:bg-primary/20 transition-colors mb-10">
                Get Started
              </a>
              
              <div className="space-y-4">
                <p className="font-bold text-sm uppercase tracking-wider text-foreground/50">Includes:</p>
                {[
                  "Unlimited personal workspaces",
                  "1 shared group workspace",
                  "Up to 5 members per group",
                  "Basic expense categorization",
                  "Standard history log"
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-secondary flex-shrink-0" />
                    <span className="text-foreground/80 font-medium">{feature}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Pro Tier */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-primary text-white rounded-[2.5rem] p-8 md:p-10 border border-primary-border shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-6">
                <span className="bg-accent text-accent-foreground text-xs font-bold uppercase tracking-wider py-1 px-3 rounded-full">
                  Most Popular
                </span>
              </div>
              
              <h3 className="text-2xl font-bold text-white mb-2">Chama Pro</h3>
              <p className="text-primary-foreground/70 mb-6">For investment groups, large chamas, and growing teams.</p>
              
              <div className="mb-8 flex items-baseline">
                <span className="text-2xl font-bold text-primary-foreground/80 mr-1">KES</span>
                <span className="text-5xl font-bold text-white">500</span>
                <span className="text-primary-foreground/60 font-medium ml-2">/ month</span>
              </div>
              
              <a href={JAMVI_APP_PATH} className="flex items-center justify-center w-full h-14 rounded-full bg-accent text-accent-foreground font-bold hover:bg-accent/90 transition-transform hover:scale-105 active:scale-95 mb-10 shadow-lg">
                Upgrade to Pro
              </a>
              
              <div className="space-y-4">
                <p className="font-bold text-sm uppercase tracking-wider text-primary-foreground/50">Everything in Free, plus:</p>
                {[
                  "Unlimited shared workspaces",
                  "Unlimited members per group",
                  "Advanced goal tracking features",
                  "Custom permissions & roles",
                  "Priority support",
                  "Data export (CSV/PDF)"
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-accent flex-shrink-0" />
                    <span className="text-primary-foreground/90 font-medium">{feature}</span>
                  </div>
                ))}
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* FAQ Teaser */}
      <section className="py-16 bg-white border-t border-border">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h2 className="text-2xl font-bold text-primary mb-4 font-serif">Have questions about pricing?</h2>
          <p className="text-foreground/70 mb-6">
            We're committed to making Jamvi accessible. Check out our FAQ for details on billing, refunds, and non-profit discounts.
          </p>
          <Link href="/faq" className="text-secondary font-bold hover:underline">
            Read the FAQ &rarr;
          </Link>
        </div>
      </section>
    </div>
  );
}
