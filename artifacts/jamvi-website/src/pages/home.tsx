import { useSeo } from "@/hooks/use-seo";
import { SITE_SEO } from "@/lib/site-seo";
import { ArrowRight, ArrowDown, Lock } from "lucide-react";
import { Link } from "wouter";
import { JAMVI_APP_PATH } from "@/lib/site-links";
import { SEGMENTS } from "@/lib/segments";
import { JAMVI_PACKAGE, TRIAL_DAYS } from "@workspace/jamvi-pricing";

/*
 * The home page is built around the product's one trick, shown rather than
 * described: an M-Pesa message going in, a sorted budget line coming out.
 * Names and amounts are made up, and every example says so.
 */

const SAMPLE_BUDGET = [
  { name: "Groceries", detail: "Sample supermarket · 9 entries", spent: 8450, budget: 12000 },
  { name: "Fare", detail: "Matatu and rides · 22 entries", spent: 4900, budget: 4500 },
  { name: "Chama contribution", detail: "Shared with your group", spent: 3000, budget: 3000 },
];

const fmt = (n: number) => n.toLocaleString("en-KE");

export default function Home() {
  const price = JAMVI_PACKAGE.monthlyPriceKes;

  useSeo(SITE_SEO["/"]);

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl pt-14 pb-20 lg:pt-20 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-14 lg:gap-12 items-center">
            <div className="min-w-0">
              <p className="kicker mb-5">Pesa wazi · money, in the open</p>
              <h1 className="text-[2.75rem] leading-[0.95] sm:text-6xl lg:text-[5.25rem] font-extrabold text-foreground">
                Paste your <span className="whitespace-nowrap">M-Pesa.</span> <span className="hl">See where it went.</span>
              </h1>
              <p className="mt-7 text-lg sm:text-xl leading-relaxed text-foreground/75 max-w-[34rem]">
                Jamvi fills in your budget from your M-Pesa: who you paid, what it was for,
                what came in. On Android the app reads your M-Pesa messages if you allow it.
                Anywhere else, import your statement or paste the messages in.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
                <a href={JAMVI_APP_PATH} className="btn-mat h-14 px-7 text-base">
                  Try {TRIAL_DAYS} days free <ArrowRight className="h-5 w-5" />
                </a>
                <Link href="/guides/how-jamvi-reads-mpesa" className="font-bold text-primary underline decoration-accent decoration-[3px] underline-offset-[6px] hover:decoration-primary">
                  How it reads your M-Pesa
                </Link>
              </div>
              <p className="mt-6 text-sm text-muted-foreground">
                KES {price} a month after the trial. Groups cost nothing extra.{" "}
                <Link href="/download" className="font-bold text-primary underline underline-offset-2">Get the Android app</Link>
              </p>
            </div>

            {/* The demo. */}
            <div className="min-w-0 w-full max-w-md lg:justify-self-end" aria-label="Example: an M-Pesa message becoming a budget line">
              <div className="rounded-[18px_18px_18px_4px] bg-[hsl(90_8%_89%)] px-4 py-3.5 max-w-[22rem] shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground mb-1">M-PESA · example message</p>
                <p className="font-mono text-[13px] leading-relaxed text-foreground">
                  SJK4T2LQ8P Confirmed. Ksh1,250.00 paid to SAMPLE SUPERMARKET on 2/10/26 at 6:41 PM.
                  New M-PESA balance is Ksh8,310.00.
                </p>
              </div>

              <p className="font-mono text-sm font-semibold text-secondary flex items-center gap-2 my-4 pl-4">
                <ArrowDown className="h-4 w-4" /> Jamvi sorts it
              </p>

              <div className="bg-primary text-primary-foreground rounded-[4px] px-5 pt-5 pb-3" style={{ boxShadow: "8px 8px 0 hsl(var(--clay-bright))" }}>
                <p className="font-mono text-xs font-semibold tracking-wider text-accent mb-2">OCTOBER · SAMPLE BUDGET</p>
                {SAMPLE_BUDGET.map((row) => {
                  const over = row.spent > row.budget;
                  return (
                    <div key={row.name} className="grid grid-cols-[1fr_auto] gap-x-3 py-3 border-t border-dashed border-accent/35">
                      <div className="min-w-0">
                        <p className="font-serif text-[17px] font-semibold leading-tight">{row.name}</p>
                        <p className="text-xs text-primary-foreground/65 mt-0.5">{row.detail}</p>
                      </div>
                      <p className="font-mono text-sm font-semibold tabular-nums text-right whitespace-nowrap">
                        {fmt(row.spent)} <span className="text-primary-foreground/50">/ {fmt(row.budget)}</span>
                      </p>
                      <div className="col-span-2 mt-2 h-1.5 bg-primary-foreground/15">
                        <div
                          className={over ? "h-full bg-[hsl(var(--clay-bright))]" : "h-full bg-accent"}
                          style={{ width: `${Math.min(100, (row.spent / row.budget) * 100)}%` }}
                        />
                      </div>
                      {over && <p className="col-span-2 mt-1.5 text-xs font-bold text-[hsl(var(--clay-bright))] brightness-125">KES {fmt(row.spent - row.budget)} over</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="weave" aria-hidden="true" />

      {/* The headline feature, in its real three steps. */}
      <section id="mpesa-import" className="bg-primary text-primary-foreground py-20 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          <div className="max-w-2xl">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[0.98]">Your M-Pesa month, sorted in minutes.</h2>
            <p className="mt-5 text-lg text-primary-foreground/80 leading-relaxed">
              Stop typing it in. Every payment is already in your M-Pesa. Jamvi reads it for you, so a whole
              month of budgeting takes minutes instead of an evening.
            </p>
          </div>

          <ol className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-y-10 md:gap-x-10">
            {[
              {
                title: "Bring your M-Pesa",
                desc: "On Android, let the Jamvi app read your M-Pesa messages. Android asks you first. Or choose your statement PDF, or paste messages in. Do as much or as little as you like.",
              },
              {
                title: "Check what Jamvi read",
                desc: "Every payment arrives with who it went to, a suggested category and Fuliza handled properly. You change what is wrong, and Jamvi remembers for next time.",
              },
              {
                title: "Save, and it adds up",
                desc: "Save some now and the rest another day. Jamvi checks the result against your statement's own balance, so you know nothing was missed.",
              },
            ].map((step, i) => (
              <li key={step.title} className="border-t-4 border-accent pt-5">
                <span className="font-mono text-sm font-semibold text-accent">Step {i + 1}</span>
                <h3 className="mt-2 text-2xl font-bold">{step.title}</h3>
                <p className="mt-3 text-primary-foreground/80 leading-relaxed">{step.desc}</p>
              </li>
            ))}
          </ol>

          <p className="mt-14 flex items-start gap-3 text-sm text-primary-foreground/80 max-w-3xl">
            <Lock className="w-4 h-4 mt-0.5 flex-shrink-0 text-accent" />
            <span>
              Your statement and its password are read on your own phone or computer and are never uploaded.
              Messages are read to fill in the list and are not kept, and nothing is saved until you have checked it.
              Jamvi records; it never moves your money.
            </span>
          </p>
        </div>
      </section>

      {/* Alone or together: the range is the point. */}
      <section id="how-it-works" className="py-20 lg:py-28">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[0.98] max-w-3xl">
            On your own, or <span className="hl">around the mat</span> with everyone.
          </h2>
          <p className="mt-5 text-lg text-foreground/75 leading-relaxed max-w-2xl">
            A jamvi is the mat people sit on together. Jamvi keeps your own budget and every
            group you belong to in one place, with one price for you.
          </p>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 border-2 border-foreground">
            <div className="p-7 sm:p-10">
              <p className="kicker">Peke yako · on your own</p>
              <h3 className="mt-3 text-3xl font-bold">Your own money, clear</h3>
              <p className="mt-4 text-foreground/75 leading-relaxed">
                Track what comes in, organise what goes out, set your own goals. See exactly
                where your KES went this month. No group required.
              </p>
              <ul className="mt-6 space-y-2 font-mono text-sm">
                <li>+ Monthly budget by category</li>
                <li>+ Goals: a deposit, a trip, a plot</li>
                <li>+ M-Pesa messages, statements or a paste</li>
              </ul>
            </div>
            <div className="p-7 sm:p-10 bg-accent border-t-2 md:border-t-0 md:border-l-2 border-foreground">
              <p className="font-mono text-sm font-semibold text-foreground">Pamoja · together</p>
              <h3 className="mt-3 text-3xl font-bold">Shared, without the arguments</h3>
              <p className="mt-4 text-foreground/80 leading-relaxed">
                A budget the two of you, the four of you, or the whole chama can see. The same
                history for everyone, so nobody has to remember who paid what.
              </p>
              <ul className="mt-6 space-y-2 font-mono text-sm">
                <li>+ Who paid, and who still owes</li>
                <li>+ Notes on every adjustment</li>
                <li>+ Groups of any size cost nothing extra</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* The shared record, as a ledger. */}
      <section className="pb-20 lg:pb-28">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <div className="min-w-0 order-2 lg:order-1">
              <div className="bg-card border-2 border-foreground rounded-[4px]" style={{ boxShadow: "8px 8px 0 hsl(var(--jade))" }}>
                <div className="flex items-baseline justify-between gap-3 px-5 py-4 border-b-2 border-foreground">
                  <p className="font-serif text-xl font-bold">Household · September</p>
                  <p className="font-mono text-xs text-muted-foreground">Example</p>
                </div>
                {[
                  { who: "N", text: "Nanjala added her share of rent", note: "Sent this morning", amount: "+ 5,000", inn: true },
                  { who: "O", text: "Groceries", note: "Paid by Otieno, split four ways", amount: "− 2,400", inn: false },
                  { who: "W", text: "Electricity tokens", note: "Paid by Wanjiru", amount: "− 1,500", inn: false },
                ].map((row) => (
                  <div key={row.text} className="flex items-center gap-4 px-5 py-4 border-b border-dashed border-border last:border-b-0">
                    <span className="w-9 h-9 shrink-0 grid place-items-center bg-primary text-primary-foreground font-serif font-bold rounded-[3px]">{row.who}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold leading-snug">{row.text}</p>
                      <p className="text-sm text-muted-foreground">{row.note}</p>
                    </div>
                    <p className={`font-mono text-sm font-semibold tabular-nums whitespace-nowrap ${row.inn ? "text-primary" : "text-foreground"}`}>{row.amount}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="min-w-0 order-1 lg:order-2">
              <h2 className="text-4xl md:text-5xl font-extrabold leading-[0.98]">One record everybody trusts.</h2>
              <p className="mt-5 text-lg text-foreground/75 leading-relaxed">
                Jamvi replaces the WhatsApp thread and the spreadsheet with one history the
                whole group reads the same way.
              </p>
              <ul className="mt-7 space-y-3">
                {[
                  "Every transaction in date order",
                  "Who paid, assigned in one tap",
                  "Notes that explain each adjustment",
                  "The same records on every device",
                ].map((item) => (
                  <li key={item} className="flex gap-3 items-baseline">
                    <span className="w-2.5 h-2.5 shrink-0 bg-secondary translate-y-[-1px]" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href="/features" className="mt-8 inline-flex items-center gap-1 font-bold text-primary underline decoration-accent decoration-[3px] underline-offset-[6px] hover:decoration-primary">
                Everything Jamvi does <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Who it is for. Every audience page is linked from here, which is both
          how a reader finds the one that describes them and how a crawler
          reaching the home page finds the rest of the site. */}
      <section className="py-20 lg:py-24 bg-muted border-y-2 border-foreground/10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-10 lg:gap-16">
            <div>
              <h2 className="text-4xl md:text-5xl font-extrabold leading-[0.98]">Whatever you are keeping money for.</h2>
              <p className="mt-5 text-lg text-foreground/75 leading-relaxed">
                A chama chases arrears. A church never chases anybody. A class fund runs for
                ten weeks and stops. Jamvi starts each group with what that kind of group
                actually needs.
              </p>
            </div>
            <ul className="border-t-2 border-foreground">
              {SEGMENTS.map((segment) => (
                <li key={segment.slug} className="border-b-2 border-foreground/15">
                  <Link href={segment.slug} className="group flex items-start gap-4 py-5 outline-none focus-visible:bg-background">
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-2xl font-bold group-hover:text-secondary transition-colors">{segment.label}</p>
                      <p className="mt-1 text-foreground/70 leading-relaxed">{segment.subheading}</p>
                    </div>
                    <ArrowRight className="mt-2 w-6 h-6 shrink-0 text-secondary transition-transform group-hover:translate-x-1" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl py-20 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-10 items-end">
            <div>
              <h2 className="text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[0.92]">Take a seat on the mat.</h2>
              <p className="mt-6 text-lg text-primary-foreground/80 max-w-xl leading-relaxed">
                Free for your first {TRIAL_DAYS} days, then KES {price} a month. Setup takes less than two minutes.
              </p>
            </div>
            <div className="lg:justify-self-end">
              <a href={JAMVI_APP_PATH} className="btn-mat h-16 px-9 text-lg !bg-accent !text-accent-foreground" style={{ boxShadow: "6px 6px 0 hsl(var(--clay-bright))" }}>
                Create your free account
              </a>
            </div>
          </div>
          <p className="mt-12 pt-6 border-t border-primary-foreground/15 text-sm text-primary-foreground/65 max-w-3xl leading-relaxed">
            Jamvi records contributions, expenses, and balances. It does not send, receive, or hold money, and it is not a payment service. Money moves through M-Pesa or your bank, exactly as it does now.
          </p>
        </div>
      </section>
    </div>
  );
}
