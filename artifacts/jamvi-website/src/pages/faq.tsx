import { useSeo } from "@/hooks/use-seo";
import { SITE_SEO } from "@/lib/site-seo";
import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { JAMVI_SUPPORT_EMAIL } from "@/lib/site-links";
import { FAQ_ENTRIES } from "@/lib/faq-content";

export default function FAQ() {
  useSeo(SITE_SEO["/faq"]);

  // Shared with the FAQPage structured data, which must match what is on
  // the page or Google drops the rich result.
  const faqs = FAQ_ENTRIES;

  return (
    <div className="flex flex-col min-h-screen bg-muted/20">
      <section className="pt-24 pb-16 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-bold text-primary mb-6 font-serif"
          >
            Frequently Asked Questions
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-foreground/70"
          >
            Everything you need to know about getting started and managing your groups.
          </motion.p>
        </div>
      </section>

      <section className="pb-24 px-4">
        <div className="container mx-auto max-w-3xl">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-[2rem] p-6 md:p-10 border border-border shadow-md"
          >
            {/* 
              Note: We don't have the shadcn Accordion installed yet in this environment, 
              so we'll use a simple accessible HTML details/summary implementation 
              that fits the design instead of relying on missing dependencies. 
            */}
            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <details key={index} className="group border-b border-border last:border-0 pb-4 last:pb-0">
                  <summary className="flex justify-between items-center font-bold text-lg cursor-pointer list-none py-4 text-primary group-open:text-secondary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded px-2">
                    {faq.question}
                    <span className="transition group-open:rotate-180 ml-4 flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-foreground/50">
                      <svg fill="none" height="24" shapeRendering="geometricPrecision" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24"><path d="M6 9l6 6 6-6"></path></svg>
                    </span>
                  </summary>
                  <p className="text-foreground/70 mt-2 leading-relaxed px-2 pb-4">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </motion.div>

          <div className="mt-12 text-center">
            <p className="text-foreground/70 mb-4">Still have questions?</p>
            <a href={`mailto:${JAMVI_SUPPORT_EMAIL}`} className="inline-flex items-center justify-center h-12 px-8 rounded-full bg-primary/10 text-primary font-bold hover:bg-primary/20 transition-colors">
              Contact Support
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
