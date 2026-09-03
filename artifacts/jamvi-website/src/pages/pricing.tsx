import { useSeo } from "@/hooks/use-seo";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Users, Minus } from "lucide-react";
import { JAMVI_APP_PATH, JAMVI_SUPPORT_EMAIL } from "@/lib/site-links";
import { JAMVI_PACKAGES, ENTITLEMENT } from "@workspace/jamvi-pricing";

const comparisonFeatures = [
  { label: "Personal budgeting & tracking", key: ENTITLEMENT.PERSONAL_BUDGETS },
  { label: "Shared group access", key: ENTITLEMENT.SHARED_GROUP_ACCESS },
  { label: "Shared income & expense tracking", key: ENTITLEMENT.SHARED_INCOME_EXPENSES },
  { label: "Shared bank accounts", key: ENTITLEMENT.SHARED_BANK_ACCOUNTS },
  { label: "Member contribution tracking", key: ENTITLEMENT.MEMBER_CONTRIBUTIONS },
  { label: "Shared budget limits", key: ENTITLEMENT.SHARED_BUDGET_LIMITS },
  { label: "Contribution cycles", key: ENTITLEMENT.CONTRIBUTION_CYCLES },
  { label: "Admin & member roles", key: ENTITLEMENT.ADMIN_MEMBER_ROLES },
  { label: "Detailed reports & exports", key: ENTITLEMENT.EXPORTABLE_RECORDS },
  { label: "Treasurer role", key: ENTITLEMENT.TREASURER_ROLE },
  { label: "Loan & welfare fund tracking", key: ENTITLEMENT.LOAN_TRACKING },
];

const pricingFaqs = [
  {
    question: "Is Personal Free really free permanently?",
    answer: "Yes. Every Jamvi user gets one private Personal budget at no cost. Joining or creating a Shared budget never removes it."
  },
  {
    question: "When does billing start?",
    answer: "Payment processing is not active in this phase. Choosing a package does not charge you or mark it as paid. Jamvi will explain the payment flow before billing launches, and you will not be charged automatically."
  },
  {
    question: "Do invited members pay individually?",
    answer: "No. One group subscription covers one Shared budget. Invited members keep Personal Free and do not need an individual paid plan to participate in that group."
  },
  {
    question: "How does annual billing work?",
    answer: "Annual prices cover twelve months for the cost of ten monthly payments. The exact annual saving is shown on every paid package when you switch to Annual."
  },
  {
    question: "How do member limits work?",
    answer: "Member limits apply per shared group workspace. For example, the Small Group package allows up to 6 members. This means you and up to 5 other people can join that specific shared budget."
  },
  {
    question: "Do I have to pay if I only want to manage my own money?",
    answer: "No. The Personal Free package is completely free forever. You can track your personal income, expenses, and budgets without ever paying a subscription fee."
  },
  {
    question: "Are there any hidden fees or transaction charges?",
    answer: "No. Jamvi is a record-keeping tool, not a payment processor. We do not touch your money, so we do not charge transaction fees. You only pay the flat subscription price for your chosen package."
  },
  {
    question: "Can I upgrade or downgrade my plan later?",
    answer: "Yes. You will be able to change your package at any time. If you downgrade, you simply need to ensure your group size fits within the new plan's member limit."
  }
];

export default function Pricing() {
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("monthly");
  const shouldReduceMotion = useReducedMotion();
  const isAnnual = billingInterval === "annual";

  useSeo({
    title: "Pricing - Transparent and fair",
    description: "Start managing personal and group money with simple, honest Jamvi pricing. Begin for free and choose a clear plan as your chama or team grows.",
  });

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Header */}
      <section className="pt-24 pb-12 text-center px-4 max-w-4xl mx-auto">
        <motion.h1 
          initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary mb-6 font-serif"
        >
          Simple, honest pricing.
        </motion.h1>
        <motion.p 
          initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-lg md:text-xl text-foreground/70 leading-relaxed"
        >
          No hidden fees, no complicated tiers. Your personal budgeting is free forever. Group pricing simply scales with your size.
        </motion.p>
      </section>

      {/* Toggle */}
      <section className="pb-12 px-4 flex justify-center">
        <div className="inline-flex items-center p-1.5 bg-muted/30 rounded-full border border-border shadow-inner">
          <button
            aria-pressed={!isAnnual}
            onClick={() => setBillingInterval("monthly")}
            className={`px-6 py-3 rounded-full text-sm font-bold transition-all ${
              !isAnnual 
                ? "bg-white text-primary shadow-sm ring-1 ring-border" 
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            Pay Monthly
          </button>
          <button
            aria-pressed={isAnnual}
            onClick={() => setBillingInterval("annual")}
            className={`px-6 py-3 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${
              isAnnual 
                ? "bg-white text-primary shadow-sm ring-1 ring-border" 
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            Pay Annually
            <span className={`text-xs px-2 py-0.5 rounded-full ${isAnnual ? 'bg-secondary/10 text-secondary' : 'bg-muted border border-border text-foreground/60'}`}>
              Save ~16%
            </span>
          </button>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-24 px-4">
        <div className="container mx-auto max-w-[1400px]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {JAMVI_PACKAGES.map((plan, index) => {
              const price = isAnnual ? plan.annualPriceKes : plan.monthlyPriceKes;
              const isFree = plan.monthlyPriceKes === 0;

              return (
                <motion.div 
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: shouldReduceMotion ? 0 : index * 0.05 }}
                  key={plan.code}
                  className={`bg-white rounded-[2rem] p-8 flex flex-col relative transition-all duration-300 ${
                    plan.recommended 
                      ? "border-2 border-secondary shadow-xl shadow-secondary/10 z-10 scale-[1.02] lg:scale-[1.05]" 
                      : "border border-border shadow-sm hover:shadow-md"
                  }`}
                >
                  {plan.recommended && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-secondary text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-sm whitespace-nowrap">
                      MOST POPULAR
                    </div>
                  )}
                  
                  <div className="mb-2 mt-2">
                    <h3 className="text-2xl font-bold text-primary">{plan.displayName}</h3>
                  </div>
                  <p className="text-foreground/60 text-sm mb-6 min-h-[40px] leading-relaxed">
                    {plan.description}
                  </p>

                  <div className="mb-6 min-h-[90px]">
                    <div className="flex items-baseline gap-1">
                      {isFree ? (
                        <span className="text-5xl font-bold text-primary tracking-tight">Free</span>
                      ) : (
                        <>
                          <span className="text-xl font-bold text-foreground/50">KES</span>
                          <span className="text-5xl font-bold text-primary tracking-tight">{price.toLocaleString()}</span>
                          <span className="text-foreground/50 font-medium">/{isAnnual ? 'yr' : 'mo'}</span>
                        </>
                      )}
                    </div>
                    {!isFree && isAnnual && plan.annualSavingKes ? (
                      <div className="text-sm font-bold text-secondary mt-3 bg-secondary/10 inline-block px-3 py-1 rounded-md">
                        Save KES {plan.annualSavingKes.toLocaleString()} a year
                      </div>
                    ) : (
                      <div className="h-[28px] mt-3"></div>
                    )}
                  </div>

                  <a 
                    href={JAMVI_APP_PATH} 
                    className={`w-full py-4 px-6 rounded-full font-bold text-center transition-all mb-3 ${
                      plan.recommended
                        ? "bg-secondary text-white hover:bg-secondary/90 shadow-md"
                        : isFree 
                          ? "bg-primary text-white hover:bg-primary/90 shadow-md"
                          : "bg-white text-primary hover:bg-muted/30 border border-border"
                    }`}
                  >
                    {isFree ? "Start for free" : "Select " + plan.displayName.replace('Jamvi ', '')}
                  </a>
                  
                  <p className="text-xs text-center text-foreground/50 font-medium mb-8">
                    {isFree ? "Free permanently. No card required." : "Choose a package now. Payment setup is coming later."}
                  </p>

                  <div className="border-t border-border pt-6 mt-auto">
                    <p className="text-sm font-bold text-foreground/80 mb-4">{plan.inheritanceLabel}</p>
                    <ul className="space-y-4">
                      <li className="flex items-start gap-3">
                        <Users className="w-5 h-5 text-primary shrink-0" />
                        <span className="text-sm font-bold text-foreground/90">
                          {plan.memberLimit ? `Up to ${plan.memberLimit} members` : "Unlimited members"}
                        </span>
                      </li>
                      {plan.featureLabels.map((feature, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <Check className="w-5 h-5 text-secondary shrink-0" />
                          <span className="text-sm text-foreground/80 font-medium leading-tight">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-secondary/5 py-14">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <h2 className="mb-4 font-serif text-3xl font-bold text-primary">
            One subscription covers the whole Shared budget
          </h2>
          <p className="text-lg leading-relaxed text-foreground/70">
            The group owner or administrator chooses one package for that Shared budget.
            Invited members do not each buy a separate subscription, and everyone keeps
            their own Personal budget free permanently.
          </p>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-24 bg-muted/20 border-t border-border">
        <div className="container mx-auto px-4 max-w-[1400px]">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-primary font-serif mb-6">Compare features side by side</h2>
            <p className="text-lg text-foreground/70">
              A detailed breakdown of the capabilities included in each package, to help you find the exact fit for your group.
            </p>
          </div>
          
          <div className="bg-white rounded-3xl border border-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr>
                    <th className="p-6 bg-muted/30 border-b border-border font-bold text-primary w-1/4 sticky left-0 z-20 shadow-[1px_0_0_0_var(--color-border)]">
                      Features
                    </th>
                    {JAMVI_PACKAGES.map(plan => (
                      <th key={plan.code} className="p-6 bg-muted/30 border-b border-border text-center min-w-[140px]">
                        <div className="font-bold text-primary">{plan.displayName.replace('Jamvi ', '')}</div>
                        <div className="text-xs text-foreground/60 font-medium mt-1">
                          {plan.monthlyPriceKes === 0 ? "Free" : `KES ${plan.monthlyPriceKes}/mo`}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y border-border">
                  {comparisonFeatures.map((feature, idx) => (
                    <tr key={idx} className="hover:bg-muted/10 transition-colors">
                      <td className="p-4 px-6 border-r border-border text-sm font-medium text-foreground/80 sticky left-0 bg-white shadow-[1px_0_0_0_var(--color-border)] z-10 group-hover:bg-muted/10">
                        {feature.label}
                      </td>
                      {JAMVI_PACKAGES.map(plan => {
                        const hasFeature = plan.entitlements.includes(feature.key);
                        return (
                          <td key={plan.code} className="p-4 text-center">
                            {hasFeature ? (
                              <div className="flex justify-center">
                                <div className="w-6 h-6 rounded-full bg-secondary/10 flex items-center justify-center">
                                  <Check className="w-3.5 h-3.5 text-secondary" strokeWidth={3} />
                                </div>
                              </div>
                            ) : (
                              <Minus className="w-4 h-4 mx-auto text-border" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td className="p-6 border-r border-border font-bold text-primary sticky left-0 bg-muted/30 shadow-[1px_0_0_0_var(--color-border)] z-10">
                      Member Limit
                    </td>
                    {JAMVI_PACKAGES.map(plan => (
                      <td key={plan.code} className="p-6 text-center font-bold text-sm text-foreground bg-muted/30">
                        {plan.memberLimit ? plan.memberLimit : "Unlimited"}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing FAQ */}
      <section className="py-24 bg-white border-t border-border">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-primary font-serif mb-6">Pricing Questions</h2>
            <p className="text-lg text-foreground/70">
              Everything you need to know about how Jamvi billing works.
            </p>
          </div>

          <div className="space-y-4">
            {pricingFaqs.map((faq, index) => (
              <details key={index} className="group bg-muted/30 rounded-2xl border border-border">
                <summary className="flex justify-between items-center font-bold text-lg cursor-pointer list-none p-6 text-primary group-open:text-secondary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded-2xl">
                  {faq.question}
                  <span className="transition-transform duration-300 group-open:rotate-180 ml-4 flex-shrink-0 w-8 h-8 rounded-full bg-white border border-border flex items-center justify-center text-foreground/50">
                    <svg fill="none" height="20" shapeRendering="geometricPrecision" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="20"><path d="M6 9l6 6 6-6"></path></svg>
                  </span>
                </summary>
                <div className="px-6 pb-6 text-foreground/70 leading-relaxed text-[15px]">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>

          <div className="mt-16 text-center bg-muted/20 rounded-3xl p-10 border border-border">
            <h3 className="text-xl font-bold text-primary mb-4">Still have questions?</h3>
            <p className="text-foreground/70 mb-8 max-w-md mx-auto">
              Our team is based in Nairobi and ready to help you figure out which plan fits your group best.
            </p>
            <a href={`mailto:${JAMVI_SUPPORT_EMAIL}`} className="inline-flex items-center justify-center h-14 px-8 rounded-full bg-primary/10 text-primary font-bold hover:bg-primary/20 transition-colors">
              Contact Support
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
