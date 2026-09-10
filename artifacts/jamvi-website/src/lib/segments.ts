/**
 * The kinds of group Jamvi is built for, one page each.
 *
 * The app has supported chamas, churches, clubs, teams and student groups
 * since the section defaults were written, and the website said "chama" and
 * left it there. A church treasurer looking for a way to record offerings, or
 * a class rep looking for somewhere to track a trip kitty, found nothing and
 * had no reason to think this was for them.
 *
 * These are not doorway pages. Each describes a different job in different
 * words because the jobs are different: a chama chases arrears, a church never
 * chases anybody, a class fund exists for ten weeks and then stops. Where they
 * say the app does something, it does.
 *
 * `sections` mirrors DEFAULTS in lib/db/src/schema/budget-sections.ts. That
 * module cannot be imported here - it sits behind the database package, which
 * would drag Drizzle into a browser bundle - so it is restated. If the
 * defaults change there, change them here.
 */

export interface Segment {
  slug: string;
  /** Menu and breadcrumb label. */
  label: string;
  title: string;
  description: string;
  heading: string;
  subheading: string;
  /** The situation the reader is already in. */
  problem: string;
  /** What the app does about it. Each must be true. */
  points: { title: string; body: string }[];
  /** The tabs this kind of group starts with. */
  sections: string[];
  sectionsNote: string;
  faqs: { question: string; answer: string }[];
  /** Overrides for the two headings that otherwise assume a group. */
  faqHeading?: string;
  ctaHeading?: string;
}

const NOT_A_BANK =
  "Jamvi records money; it never holds or moves it. Cash and M-Pesa go where they always went - Jamvi is where the record lives, so everyone sees the same thing.";

export const SEGMENTS: Segment[] = [
  {
    slug: "/personal",
    label: "On your own",
    title: "Budget Your Salary - Personal Expense Tracker, Kenya",
    description:
      "For anyone running their own salary: rent, transport, data, the money that goes home every month, and whatever is left. See where it went, set limits that hold, and save towards something. No group needed.",
    heading: "Your salary, from payday to month-end",
    subheading:
      "Rent, transport, data, the money that goes home - and what is actually left.",
    problem:
      "The salary lands and for two days it feels like enough. Then rent, then fare, then a bundle, then somebody at home needs something and you send it, because of course you do. By the twentieth you are counting, and you genuinely cannot say where it went - not because you were careless, but because it left in forty small pieces and nobody writes those down.",
    points: [
      {
        title: "See where it actually went",
        body: "Record what you spend and it sorts into categories, with sub-categories underneath when one is not enough - rent apart from water, fare apart from fuel. At month-end the answer is written down rather than guessed at.",
      },
      {
        title: "Money sent home is a category, not a leak",
        body: "Support sent upcountry is a real, monthly, planned part of a Kenyan salary. Give it a line and a limit like anything else, so it stops being the thing that quietly explains the gap.",
      },
      {
        title: "Salary and the side hustle, counted separately",
        body: "More than one thing coming in? Record each source and see what each really contributed over a period, instead of one blurred figure.",
      },
      {
        title: "Saving towards something specific",
        body: "A deposit, a laptop, a plot, fees. Set the target once and watch it fill - a number to aim at holds better than an intention to save whatever is left.",
      },
    ],
    sections: [
      "Expenses",
      "Budget",
      "Savings goals",
      "Accounts",
      "Reports",
      "Activity",
      "Contributions",
    ],
    sectionsNote:
      "A personal budget starts with everything on. Turn off whatever you do not use - most people never open half of it, and that is fine.",
    faqHeading: "Questions people ask about budgeting alone",
    ctaHeading: "Start with this month",
    faqs: [
      {
        question: "Do I have to join a group to use Jamvi?",
        answer:
          "No. A personal budget stands on its own. If you later join a chama or share a house budget, the same subscription covers it - but nothing requires you to.",
      },
      {
        question: "Can anyone else see my personal budget?",
        answer:
          "No. A personal budget is private to you. Only what you record inside a shared budget is visible to the people in it.",
      },
      {
        question: "Do I have to record every single M-Pesa payment?",
        answer:
          "No, and most people should not try. Record what you want to understand - the categories that keep surprising you - and leave the rest. A budget you keep beats a complete one you abandon in week three.",
      },
      {
        question: "What does it cost for one person?",
        answer:
          "KES 100 a month, or KES 1,000 a year, with the first 30 days free. That is the whole price whether you use Jamvi alone or belong to five groups.",
      },
      { question: "Does Jamvi connect to my M-Pesa or bank?", answer: NOT_A_BANK },
    ],
  },
  {
    slug: "/chama",
    label: "Chamas",
    title: "Chama Management App - Contributions & Arrears",
    description:
      "Record the whole chama's monthly contributions in one action, see who has paid and who is behind on a month-by-month sheet, and keep a history nobody can quietly edit. KES 100 per member; the group pays nothing.",
    heading: "Run your chama without the notebook",
    subheading:
      "Contributions, arrears and the group balance - in one record every member can see.",
    problem:
      "Most chamas run on a notebook the treasurer carries, a WhatsApp thread nobody scrolls back through, and a spreadsheet one person can open. It works until somebody asks what they paid in April, or the treasurer travels, or the book gets rained on. The money is rarely the problem. The record is.",
    points: [
      {
        title: "Record the whole meeting in one entry",
        body: "Everyone starts ticked at the usual amount. Untick the two who have not paid and save once. You are not typing forty identical figures, and the group balance moves in the same action.",
      },
      {
        title: "See who is behind, at a glance",
        body: "Names down the side, months across the top - the sheet you already keep, filled in. Switch on show only those who still owe and you have the list to chase, with the shortfall beside each name.",
      },
      {
        title: "The month's sheet, sent round",
        body: "Download the contribution sheet for any run of months as a PDF and drop it in the group chat, instead of typing it out. There is one for each member too. Every sheet carries a link back to Jamvi, so anyone who receives it can check the figures were not changed after it was sent.",
      },
      {
        title: "The whole chama can watch, for free",
        body: "Send a read-only link and every member can open the group and see the balance, the contributions and the reports - without being able to change anything, and without paying. Only the people who record money need a subscription.",
      },
      {
        title: "Members who do not use the app still count",
        body: "Add somebody by name. No smartphone, no invitation, no email. The treasurer records for them and they appear in the sheet like anybody else.",
      },
      {
        title: "Corrections are visible, not silent",
        body: "Nothing is deleted. A changed entry keeps a reason attached, so a correction reads as a correction rather than as something being hidden.",
      },
    ],
    sections: ["Contributions", "Group account", "Reports", "Activity"],
    sectionsNote:
      "A chama collects and reports; it does not usually keep a household budget, so those tabs stay off until you want them.",
    faqs: [
      {
        question: "Does every member need to pay for Jamvi?",
        answer:
          "Only the people who use the app. Each member's own subscription covers their personal budget and every group they belong to. The chama itself has no bill and no member limit - a chama of fifty costs the group nothing.",
      },
      {
        question: "Can members see the records without being able to change them?",
        answer:
          "Yes. A viewer can open the group and read everything, and cannot record, edit or delete anything. It is the right role for members who want to check their own contributions without being able to touch the books.",
      },
      {
        question: "What if someone pays in two instalments?",
        answer:
          "Both land in the same month and add up. The sheet shows the total for that month and what is still short of the expected amount.",
      },
      { question: "Is Jamvi a bank or a sacco?", answer: NOT_A_BANK },
    ],
  },
  {
    slug: "/students",
    label: "Student groups",
    title: "Class Fund & Student Group Money Tracker",
    description:
      "For class reps, campus welfare groups and trip committees: collect contributions, show everyone what came in and what it was spent on, and hand over clean records at the end of the semester.",
    heading: "For the class rep holding everyone's money",
    subheading:
      "Trip kitties, welfare funds, class projects - collected in the open, accounted for in the open.",
    problem:
      "Being the one who collects is thankless. Sixty people send money at different times through different numbers, three of them insist they already paid, and at the end somebody asks where it all went. You are not doing anything wrong, but with the record in your own phone you cannot easily show it - and that is what makes it uncomfortable.",
    points: [
      {
        title: "Everyone can see the same list",
        body: "Share a view link and the whole class can check whether their name is ticked, without being able to change anything. Most of the questions stop arriving, because the answer is already visible.",
      },
      {
        title: "Protect the link with a passphrase",
        body: "A view link can carry a passphrase, so a class list is not something a stranger stumbles into.",
      },
      {
        title: "Record what was spent, not only what came in",
        body: "The bus, the venue, the printing. Expenses sit beside contributions, so where did it go has a written answer rather than a memory.",
      },
      {
        title: "Hand it over cleanly",
        body: "When the semester ends and somebody else takes over, the record goes with the group rather than with your phone.",
      },
    ],
    sections: ["Contributions", "Expenses", "Group account", "Reports", "Activity"],
    sectionsNote:
      "A student group both collects and spends, so expenses are on from the start.",
    faqs: [
      {
        question: "Is there a student price?",
        answer:
          "Yes, through promo codes given to campus representatives, student groups and chama secretaries. Enter the code when you subscribe. Nobody is asked to upload a student ID.",
      },
      {
        question: "Do all sixty classmates need accounts?",
        answer:
          "No. Add them by name. Only the people actually recording or reviewing need an account, and anybody else can be given a read-only view link.",
      },
      {
        question: "What happens to the records when I graduate?",
        answer:
          "They stay with the group, not with you. Hand the group to whoever takes over and the history goes with it - which is the point of not keeping it in a notebook.",
      },
      { question: "Does Jamvi hold the money?", answer: NOT_A_BANK },
    ],
  },
  {
    slug: "/church",
    label: "Churches",
    title: "Church Offerings & Contributions Record",
    description:
      "Record offerings, pledges and project giving, keep expenses beside them, and produce a clear account for the congregation. Nobody is chased, and no giving is treated as owed.",
    heading: "An honest record of what was given",
    subheading: "Offerings, pledges and projects - recorded plainly, reported clearly.",
    problem:
      "A church's books are read by the people who gave, so they should be easy to read. But offerings arrive as cash and M-Pesa across several services, projects run alongside the general fund, and whoever keeps the record often inherited a book with somebody else's handwriting in it.",
    points: [
      {
        title: "Giving is recorded, never chased",
        body: "Where there is no expected amount, Jamvi shows no arrears - not a debt of zero, but nothing at all. A church is not collecting a subscription, and the record should not imply that it is.",
      },
      {
        title: "Projects sit beside the general fund",
        body: "A roof, a bus, a harambee. Each keeps its own running total, so the congregation can see how a project is doing without unpicking the general account.",
      },
      {
        title: "Members without the app are still recorded",
        body: "Most of a congregation will never install anything. Add them by name and record on their behalf; nobody is left out of the book for lack of a smartphone.",
      },
      {
        title: "Reports the congregation can be shown",
        body: "What came in and what went out, over a period you choose, in a form you can read aloud or hand round.",
      },
    ],
    sections: ["Contributions", "Expenses", "Group account", "Reports", "Activity"],
    sectionsNote:
      "Savings goals and household budgeting are off by default; switch them on if a project needs a target.",
    faqs: [
      {
        question: "Can we record giving without naming the giver?",
        answer:
          "Yes. Record it against the group rather than a person where that is appropriate. Where you do name people, the record is visible only to those you have given access.",
      },
      {
        question: "Who has to pay for Jamvi?",
        answer:
          "Only those who use the app - typically the treasurer and whoever reviews the books. The congregation does not need accounts, and the church has no bill of its own.",
      },
      {
        question: "Can elders review the books without editing them?",
        answer:
          "Yes. A viewer can read everything and change nothing, which is usually the right role for oversight.",
      },
      { question: "Does Jamvi handle the offering itself?", answer: NOT_A_BANK },
    ],
  },
  {
    slug: "/clubs",
    label: "Clubs & teams",
    title: "Club & Team Treasurer App - Subs, Kitty, Events",
    description:
      "For sports clubs, societies and teams: track subscriptions, plan a season by category, record what events actually cost, and show the committee where the money went.",
    heading: "For whoever ended up as treasurer",
    subheading:
      "Subs, the kitty, kit and events - planned against a budget, recorded as they happen.",
    problem:
      "A club plans a year and then spends it. So much for events, so much for equipment, a little for the away trip. The plan usually lives in one person's head or a spreadsheet made in January, and by August nobody can say whether the equipment line still has anything left in it.",
    points: [
      {
        title: "Plan the year, then watch it spend",
        body: "Set what each category is meant to hold - events, kit, travel - and see what is left as the season runs, rather than finding out at the AGM.",
      },
      {
        title: "Subs collected like a register",
        body: "Members down the side, months across the top. Tick the whole club at once and untick whoever has not paid.",
      },
      {
        title: "An event, accounted for",
        body: "Record what a fixture or a social actually cost against what was collected for it, so the next one is planned on a real number.",
      },
      {
        title: "Handover without a handover meeting",
        body: "The record belongs to the club. When the committee changes, nothing has to be rebuilt from receipts and memory.",
      },
    ],
    sections: [
      "Contributions",
      "Expenses",
      "Budget",
      "Savings goals",
      "Group account",
      "Reports",
      "Activity",
    ],
    sectionsNote:
      "A club is a small organisation, so it starts with everything switched on. Turn off whatever you do not use.",
    faqs: [
      {
        question: "Can we track more than one thing at once?",
        answer:
          "Yes. Categories keep their own running totals, so the tour fund and the kit fund do not blur into one balance.",
      },
      {
        question: "Can we see what a member has paid across a season?",
        answer:
          "Yes - up to twelve months at a time, per member, with what is still outstanding against the expected subscription.",
      },
      {
        question: "Does the club pay a fee?",
        answer:
          "No. Each member who uses the app pays for themselves, and that covers every group they belong to. Groups have no bill and no member limit.",
      },
      { question: "Does Jamvi collect the subs for us?", answer: NOT_A_BANK },
    ],
  },
  {
    slug: "/household",
    label: "Households",
    title: "Household Budget App for Couples, Families & Roommates",
    description:
      "Share rent, bills and shopping without keeping score in your head. One record everyone in the house can see, and your own private budget alongside it.",
    heading: "Shared money, without the arguments",
    subheading:
      "Rent, bills, shopping and school fees - one record everyone in the house can see.",
    problem:
      "Splitting money with people you live with is less about arithmetic than about memory. Somebody paid the water bill in March, somebody else has covered shopping three weeks running, and neither of you wants to be the person keeping a tally. The resentment does not come from the money. It comes from not being able to check.",
    points: [
      {
        title: "One history, not two versions",
        body: "Everybody sees the same entries in the same order. Nobody has to remember who paid what, because it is written down where all of you can look.",
      },
      {
        title: "Your own budget stays yours",
        body: "A shared budget for the house and a private one for you, in the same app and the same subscription. What you spend on your own is not in the shared record.",
      },
      {
        title: "Saving towards something together",
        body: "A deposit, a trip, a plot. Set the target once and watch it fill as any of you adds to it, with everyone seeing how far there is to go.",
      },
      {
        title: "A couple, a family or roommates",
        body: "Two people or six, related or not. A house is a house - the record does not care how you are connected.",
      },
      {
        title: "Let someone look without joining",
        body: "A read-only link lets a parent, a co-signer or a housemate who is rarely around open the shared budget and see where things stand, without an account of their own and without being able to change anything.",
      },
    ],
    sections: [
      "Expenses",
      "Budget",
      "Savings goals",
      "Contributions",
      "Joint account",
      "Reports",
      "Activity",
    ],
    sectionsNote:
      "Households usually want the lot, so everything is on. Anything you do not use can be switched off.",
    faqs: [
      {
        question: "Do we both need to pay?",
        answer:
          "Each person who uses the app pays for their own subscription, and it covers their personal budget and every shared budget they are in. There is no separate charge for the household.",
      },
      {
        question: "Can my partner see my personal spending?",
        answer:
          "No. A personal budget is private to you. Only what you record in the shared budget is shared.",
      },
      {
        question: "Can we split an expense unevenly?",
        answer:
          "Yes. Record who paid and how it divides. It does not have to be down the middle.",
      },
      { question: "Does Jamvi move money between us?", answer: NOT_A_BANK },
    ],
  },
];

export function segmentFor(slug: string): Segment | undefined {
  return SEGMENTS.find((segment) => segment.slug === slug);
}
