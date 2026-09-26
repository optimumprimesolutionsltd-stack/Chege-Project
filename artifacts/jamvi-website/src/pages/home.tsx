import { useSeo } from "@/hooks/use-seo";
import { SITE_SEO } from "@/lib/site-seo";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowRight, CheckCircle2, FileText, Lock, Users, Wallet, Target, Upload, ListChecks } from "lucide-react";
import { Link } from "wouter";
import { JAMVI_APP_PATH } from "@/lib/site-links";
import { SEGMENTS } from "@/lib/segments";
import { JAMVI_PACKAGE, TRIAL_DAYS } from "@workspace/jamvi-pricing";

export default function Home() {
  const shouldReduceMotion = useReducedMotion();
  const price = JAMVI_PACKAGE.monthlyPriceKes;

  useSeo(SITE_SEO["/"]);

  const fadeUp: Variants = {
    hidden: { opacity: 0.84, y: 8 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" } }
  };

  const staggerContainer: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: shouldReduceMotion ? 0 : 0.06 }
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden bg-white">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_right,var(--color-muted),transparent_50%)] opacity-50"></div>
        <div className="absolute top-20 -left-20 w-64 h-64 bg-secondary/10 rounded-full blur-2xl opacity-60"></div>
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-accent/10 rounded-full blur-2xl opacity-60"></div>
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            <motion.div 
              initial={shouldReduceMotion ? false : "hidden"}
              animate="visible"
              variants={staggerContainer}
              className="max-w-2xl"
            >
              <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/10 text-secondary text-sm font-semibold mb-6 border border-secondary/20">
                <span className="w-2 h-2 rounded-full bg-secondary"></span>
                 KES {price} a month. Free for your first {TRIAL_DAYS} days.
              </motion.div>
              <motion.h1 variants={fadeUp} className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.1] mb-6 text-primary">
                 Your M-Pesa month, <br/><span className="text-secondary">sorted in minutes.</span>
              </motion.h1>
              <motion.p variants={fadeUp} className="text-lg sm:text-xl text-foreground/70 mb-8 leading-relaxed max-w-lg">
                 Import your M-Pesa statement, or paste your messages, and Jamvi fills in
                 your budget for you: who you paid, what it was for, what came in. No more
                 typing it all in. Then share it with your partner, your family or your
                 chama, at no extra cost.
              </motion.p>
              <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4">
                <a href={JAMVI_APP_PATH} className="inline-flex items-center justify-center h-14 px-8 rounded-full bg-primary text-white text-base font-bold hover:bg-primary/90 transition-transform hover:scale-105 active:scale-95 shadow-lg">
                  Get started for free <ArrowRight className="ml-2 h-5 w-5" />
                </a>
                <Link href="/pricing" className="inline-flex items-center justify-center h-14 px-8 rounded-full bg-white text-primary text-base font-bold hover:bg-muted border border-border transition-colors">
                  See simple pricing
                </Link>
              </motion.div>
              
              <motion.p variants={fadeUp} className="mt-10 text-sm font-medium text-foreground/60">
                Your statement is read on your phone and never uploaded. Built in Nairobi, for how Kenyans actually manage money.
              </motion.p>
            </motion.div>
            
            <motion.div 
              initial={shouldReduceMotion ? false : { opacity: 0.94, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.45, delay: shouldReduceMotion ? 0 : 0.1 }}
              className="relative lg:h-[600px] flex items-center justify-center"
            >
              {/* Abstract decorative graphic representing the "mat" (Jamvi) and connection */}
              {/* Taller than a square on purpose: the card is absolutely positioned
                  inside this box, so the box gives it height, and the progress bar
                  and rows do not fit a square. */}
              <div className="relative w-full max-w-md aspect-[4/5]">
                <div className="absolute inset-0 bg-primary rounded-[3rem] rotate-6 opacity-5 shadow-2xl"></div>
                <div className="absolute inset-0 bg-secondary rounded-[3rem] -rotate-3 opacity-10 shadow-xl"></div>
                <div className="absolute inset-0 bg-white rounded-[2.5rem] border border-border shadow-2xl overflow-hidden flex flex-col p-6">

                  {/*
                    The product's best trick, shown rather than described: a
                    statement becoming a sorted month. The names and amounts are
                    made up, and the card says so.
                  */}
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <div className="text-xs font-bold text-foreground/50 uppercase tracking-wider mb-2">
                        Example · Your statement
                      </div>
                      <div className="text-3xl font-serif font-bold text-primary leading-none">
                        194 entries read
                      </div>
                      <div className="text-sm font-medium text-foreground/60 mt-1">
                        sorted into categories, ready to check
                      </div>
                    </div>
                    <div className="w-12 h-12 shrink-0 rounded-full bg-accent/20 flex items-center justify-center text-accent-foreground">
                      <FileText className="w-6 h-6" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {[
                      { who: "Sample Employer", tag: "Salary", amount: "+ KES 45,000", incoming: true },
                      { who: "Sample Landlord", tag: "Rent", amount: "- KES 15,000", incoming: false },
                      { who: "Sample Grocer", tag: "Groceries", amount: "- KES 1,250", incoming: false },
                      { who: "Airtime", tag: "Data and airtime", amount: "- KES 100", incoming: false },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-muted/50">
                        <div>
                          <div className="font-bold text-foreground">{item.who}</div>
                          <div className="mt-1 inline-block rounded-full bg-secondary/10 px-2 py-0.5 text-xs font-semibold text-secondary">
                            {item.tag}
                          </div>
                        </div>
                        <span className={`font-bold ${item.incoming ? "text-secondary" : "text-foreground"}`}>
                          {item.amount}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto pt-6">
                    <div className="flex items-center justify-center gap-2 rounded-xl bg-secondary/10 py-3 text-sm font-bold text-secondary">
                      <CheckCircle2 className="w-5 h-5" /> Matches your statement
                    </div>
                  </div>

                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* The headline feature, in three steps. */}
      <section id="mpesa-import" className="py-24 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-5 font-serif">Stop typing your M-Pesa in.</h2>
            <p className="text-lg text-primary-foreground/80 leading-relaxed">
              Every payment is already in your M-Pesa. Jamvi reads it for you, so a whole
              month of budgeting takes minutes instead of an evening.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Upload,
                title: "Bring your M-Pesa",
                desc: "Choose your M-Pesa statement PDF, or select your M-Pesa messages and paste them in. Do as much or as little as you like.",
              },
              {
                icon: ListChecks,
                title: "Check what Jamvi read",
                desc: "Every payment arrives with who it went to, a suggested category and Fuliza handled properly. You change what is wrong, and Jamvi remembers for next time.",
              },
              {
                icon: CheckCircle2,
                title: "Save, and it adds up",
                desc: "Save some now and the rest another day. Jamvi checks the result against your statement's own balance, so you know nothing was missed.",
              },
            ].map((step, i) => (
              <div key={i} className="p-8 rounded-3xl bg-white/10 border border-white/15">
                <div className="w-14 h-14 rounded-2xl bg-accent/20 text-accent flex items-center justify-center mb-6">
                  <step.icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold mb-3">{i + 1}. {step.title}</h3>
                <p className="text-primary-foreground/80 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center">
            <Link href="/guides/how-jamvi-reads-mpesa" className="text-accent font-bold hover:underline inline-flex items-center">
              How Jamvi reads your M-Pesa without guessing <ArrowRight className="ml-1 w-4 h-4" />
            </Link>
          </p>
          <p className="mt-6 flex items-start justify-center gap-2 text-center text-sm font-medium text-primary-foreground/80 max-w-3xl mx-auto">
            <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              Your statement and its password are read on your own phone or computer and are never uploaded.
              Messages you paste are read to fill in the list and are not kept. Jamvi records; it never moves your money.
            </span>
          </p>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="py-10 border-y border-border bg-muted/30">
        <div className="container mx-auto px-4 max-w-6xl">
          <p className="text-center text-sm font-bold text-foreground/50 uppercase tracking-widest mb-6">Designed for the way we actually manage money</p>
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 text-foreground/70 font-serif font-medium text-lg lg:text-xl">
            <span>Transparent</span>
            <span className="text-accent">•</span>
            <span>Secure</span>
            <span className="text-accent">•</span>
            <span>Local</span>
            <span className="text-accent">•</span>
            <span>Collaborative</span>
          </div>
        </div>
      </section>

      {/* Features Outline */}
      <section id="how-it-works" className="py-24 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-primary mb-6">Money shouldn't be a solo journey.</h2>
            <p className="text-lg text-foreground/70 leading-relaxed">
              We built Jamvi because managing money in Kenya is inherently social. Whether you are budgeting for yourself, splitting bills with a partner, or running a large chama, you need a tool that speaks your language.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Wallet,
                title: "Your own money, clear",
                desc: "Track what comes in, organise what goes out, set your own goals. See exactly where your KES went this month — no group required.",
                color: "text-primary",
                bg: "bg-primary/10"
              },
              {
                icon: Users,
                title: "Shared, without the arguments",
                desc: "A budget the two of you, the four of you, or the whole chama can see. The same history for everyone, so nobody has to remember who paid what.",
                color: "text-secondary",
                bg: "bg-secondary/10"
              },
              {
                icon: Target,
                title: "Saving towards something",
                desc: "A deposit, a trip, a plot. Set the target once and watch it fill as people add to it, with everyone seeing how far there is to go.",
                color: "text-accent",
                bg: "bg-accent/10"
              }
            ].map((feature, i) => (
              <div key={i} className="p-8 rounded-3xl bg-muted/40 border border-border/50 hover:bg-muted transition-colors">
                <div className={`w-14 h-14 rounded-2xl ${feature.bg} ${feature.color} flex items-center justify-center mb-6`}>
                  <feature.icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-primary mb-3">{feature.title}</h3>
                <p className="text-foreground/70 leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Detail Section */}
      <section className="py-24 bg-primary text-primary-foreground overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 font-serif">No more spreadsheet headaches.</h2>
              <p className="text-lg text-primary-foreground/80 mb-8 leading-relaxed">
                Keeping track of who paid what shouldn't require an accounting degree. Jamvi replaces messy WhatsApp groups and fragile spreadsheets with a clean, beautifully simple history.
              </p>
              <ul className="space-y-4">
                {[
                  "Clear chronological history of every transaction",
                  "Assign payers to expenses instantly",
                  "Leave explanatory notes on adjustments",
                  "Keep your records available across your devices"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-6 h-6 text-accent flex-shrink-0" />
                    <span className="text-primary-foreground/90 font-medium">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-10">
                <Link href="/features" className="text-accent font-bold hover:underline inline-flex items-center">
                  Explore all features <ArrowRight className="ml-1 w-4 h-4" />
                </Link>
              </div>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 bg-secondary blur-3xl opacity-20 rounded-full"></div>
              <div className="bg-white text-foreground p-8 rounded-[2.5rem] shadow-2xl relative">
                <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
                  <h3 className="font-bold font-serif text-xl">Recent Activity</h3>
                  <span className="text-sm font-bold text-secondary">September</span>
                </div>
                <div className="space-y-5">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center text-accent-foreground font-bold flex-shrink-0">N</div>
                    <div>
                      <p className="font-bold">Nanjala added her share of rent</p>
                      <p className="text-sm text-foreground/60">"Sent this morning"</p>
                      <p className="text-secondary font-bold mt-1">KES 5,000</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold flex-shrink-0">G</div>
                    <div>
                      <p className="font-bold">Groceries</p>
                      <p className="text-sm text-foreground/60">Paid by Otieno, split four ways</p>
                      <p className="text-primary font-bold mt-1">KES 2,400</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Who this is actually for.
          Every audience page is linked from here, which is both how a reader
          finds the one that describes them and how a crawler reaching the home
          page finds the rest of the site. */}
      <section className="py-24 bg-muted/30 border-t border-border">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-primary mb-6">Whatever you are keeping money for.</h2>
            <p className="text-lg text-foreground/70 leading-relaxed">
              A chama chases arrears. A church never chases anybody. A class fund runs for
              ten weeks and stops. Jamvi starts each group with what that kind of group
              actually needs.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {SEGMENTS.map((segment) => (
              <Link
                key={segment.slug}
                href={segment.slug}
                className="group p-8 rounded-3xl bg-white border border-border/60 hover:border-secondary/40 hover:shadow-lg transition-all"
              >
                <h3 className="text-xl font-bold text-primary mb-3">{segment.label}</h3>
                <p className="text-foreground/70 leading-relaxed mb-5">{segment.subheading}</p>
                <span className="inline-flex items-center text-secondary font-bold text-sm">
                  See how <ArrowRight className="ml-1 w-4 h-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-white text-center">
        <div className="container mx-auto px-4 max-w-4xl">
          <img src={`${import.meta.env.BASE_URL}branding/jamvi-mark-inline.png`} alt="Jamvi Mark" className="w-20 h-20 mx-auto mb-8 drop-shadow-md" />
          <h2 className="text-4xl md:text-5xl font-bold text-primary mb-6">Take a seat on the mat.</h2>
          <p className="text-xl text-foreground/70 mb-6 max-w-2xl mx-auto leading-relaxed">
            Start managing your money with clarity and confidence. Free for your first {TRIAL_DAYS} days, and setup takes less than two minutes.
          </p>
          <p className="mx-auto mb-10 max-w-2xl text-sm font-medium leading-relaxed text-foreground/60">
            Jamvi records contributions, expenses, and balances. It does not send, receive, or hold money, and it is not a payment service. Money moves through M-Pesa or your bank, exactly as it does now.
          </p>
          <a href={JAMVI_APP_PATH} className="inline-flex items-center justify-center h-16 px-10 rounded-full bg-secondary text-white text-lg font-bold hover:bg-secondary/90 transition-transform hover:scale-105 active:scale-95 shadow-xl">
            Create your free account
          </a>
        </div>
      </section>
    </div>
  );
}
