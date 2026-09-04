import { useSeo } from "@/hooks/use-seo";
import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { JAMVI_SUPPORT_EMAIL } from "@/lib/site-links";

export default function FAQ() {
  useSeo({
    title: "FAQ - Frequently Asked Questions",
    description: "Find answers about Jamvi personal budgets, shared group finances, permissions, security, pricing, currencies, and getting started in Kenya.",
  });

  const faqs = [
    {
      question: "Is Jamvi a bank account?",
      answer: "No. Jamvi records contributions, expenses, and balances. It does not send, receive, or hold money, and it is not a payment service. You still use M-Pesa or your bank to move money; Jamvi is where you record, track, and share the history so everyone is on the same page."
    },
    {
      question: "Can I use Jamvi for just myself?",
      answer: "Absolutely. While Jamvi is great for groups, it includes powerful personal finance tools. You can create a private workspace to track your own income, expenses, and savings goals."
    },
    {
      question: "Does Jamvi support multiple currencies?",
      answer: "Currently, Jamvi is optimized for Kenyan Shillings (KES) to provide the best local experience. We plan to support other East African currencies in the future."
    },
    {
      question: "How secure is my data?",
      answer: "We take your privacy seriously. Your financial data is encrypted and securely stored. We never sell your personal data or financial history to third parties."
    },
    {
      question: "Can group members edit transactions?",
      answer: "This depends on the permissions set by the group admin. By default, to maintain trust and an accurate audit log, modifying past transactions leaves a visible 'correction reason' so everyone knows why a change was made."
    },
    {
      question: "What happens if our chama grows beyond 6 people?",
      answer: "Every user gets one Personal budget free permanently. Shared budgets use one group subscription chosen by the owner or administrator. Member limits depend on that Shared package, and invited members do not pay individually."
    },
    {
      question: "Does Jamvi offer a non-profit discount?",
      answer: "Non-profit discount details have not been confirmed yet. Contact us if your organisation would like to discuss eligibility."
    }
  ];

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
