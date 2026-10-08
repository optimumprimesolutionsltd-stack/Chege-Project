/**
 * Blog — news from the mat.
 *
 * Guides answer a question someone has before they are looking for an app.
 * Posts are the other kind of writing: what Jamvi shipped, what changed and
 * why it matters to the people using it. They are dated, and they stay true
 * to the date they were written rather than being kept current like a guide.
 *
 * Same single-source-of-truth rule as guides and segments: routing, the SEO
 * table, the JSON-LD and the sitemap are all generated from this array.
 */

import { JAMVI_PACKAGE, TRIAL_DAYS } from "@workspace/jamvi-pricing";

export interface BlogMilestone {
  /** As printed, e.g. "30 Aug". The year is the post's. */
  date: string;
  title: string;
  text: string;
}

export interface BlogSection {
  heading: string;
  body: string[];
  /** A dated list, drawn as a timeline under the body. */
  milestones?: BlogMilestone[];
  /** Bold-led paragraphs: a benefit and the sentence that explains it. */
  points?: { title: string; text: string }[];
}

export interface BlogPost {
  slug: string;
  /** SEO title, minus the " | Jamvi" the build appends. */
  title: string;
  /** SEO description and the line under the post on the blog page. */
  description: string;
  /** Short label for lists and breadcrumbs. */
  label: string;
  readingMinutes: number;
  /** ISO date the post was published. */
  published: string;
  heading: string;
  intro: string;
  sections: BlogSection[];
  /** The closing call to action. */
  cta: { heading: string; text: string };
}

const price = JAMVI_PACKAGE.monthlyPriceKes;
const annual = JAMVI_PACKAGE.annualPriceKes.toLocaleString("en-KE");

export const BLOG_POSTS: readonly BlogPost[] = [
  {
    slug: "/blog/plan-groceries-not-food",
    title: "Plan Groceries, Not Food: A Simpler Start in Jamvi",
    description:
      "Setting up Jamvi now asks you to plan Groceries, Rent and Fuel rather than one big figure for Food, Housing and Transport. Each category totals its subcategories, you can add your own, and Everyday budgeting comes picked.",
    label: "Plan Groceries, not Food",
    readingMinutes: 3,
    published: "2026-10-08",
    heading: "Plan Groceries, not Food: a simpler start in Jamvi",
    intro:
      "Ask most people how much they spend on Food in a month and they will guess. Ask how much goes on groceries, the market and eating out, and they usually know. Jamvi's setup now asks the second question: each category you pick opens into the smaller things it is made of, you put an amount against each one, and the category adds them up for you.",
    sections: [
      {
        heading: "What you will see",
        body: [
          "On the last step of setup, \"how much will you plan for each category?\", every category you chose is now a small card. Its subcategories sit inside it, each with its own KES box, and the card's total updates as you type.",
        ],
        points: [
          { title: "Food.", text: "Groceries, Market shopping, Eating out." },
          { title: "Housing.", text: "Rent, Mortgage, Service charge." },
          { title: "Utilities.", text: "Electricity, Water, Cooking gas, Garbage collection." },
          { title: "Transport.", text: "Matatu & bus, Fuel, Boda boda, Parking." },
          { title: "Health.", text: "Hospital & clinic, Medicine, SHA contributions." },
          { title: "Education.", text: "School fees, Uniform, School trips, Tuition." },
        ],
      },
      {
        heading: "The category adds itself up",
        body: [
          "Every category Jamvi offers has its own list, including the ones for a chama, a church, a wedding and a student group. Leave any box blank if you are not sure yet; Planned total at the bottom adds up everything you did fill in.",
          "The category itself has no box. Food is whatever Groceries, Market shopping and Eating out add up to, so the two can never disagree.",
        ],
      },
      {
        heading: "Add your own",
        body: [
          "Every card ends with an \"Add a subcategory\" field. Type a name, tap the plus (Add on the web), and it joins the list with its own amount box. Use it for whatever your household spends on that Jamvi did not guess: HELB repayments under Loans, a house help's salary under Household, chicken feed under a Farm category you added yourself.",
          "A category you created during setup starts with no subcategories, so its card reads \"Add a subcategory to plan an amount\". Add one or two and plan against those. Jamvi will not let a name appear twice in the same plan, because each category and subcategory in a budget has its own name.",
        ],
      },
      {
        heading: "Everyday budgeting comes picked",
        body: [
          "Setup also asks how long your budget runs. Most people are budgeting the money they live on, month after month, so \"Everyday budgeting\" is now selected for you, on the phone and on the web.",
          "Planning for something with an end, such as a trip, a school term or a wedding? Tap \"Up to 1 week\", \"Up to 3 months\" or \"Set an end date\" instead. You can change it later from Settings.",
        ],
      },
      {
        heading: "After setup",
        body: [
          "The Budget screen works the same way. A category with subcategories is a heading: you set amounts on Groceries or Rent, and Food or Housing shows their total. Spending is recorded on the subcategory too, so you see where the money actually went, not just that Food ran over.",
          "Budgets you already have are not changed. The new setup applies to every budget or group you set up from now on. On the phone, open Jamvi and tap \"Update now\" when the update prompt appears; on the web it is already live.",
        ],
      },
    ],
    cta: {
      heading: "Plan the things you can actually estimate.",
      text: `Set up Jamvi in a few minutes, with Groceries, Rent and Fuel ready to plan. Free for your first ${TRIAL_DAYS} days, then KES ${price} a month.`,
    },
  },
  {
    slug: "/blog/how-far-jamvi-has-come",
    title: "How Far Jamvi Has Come, and What It Does for You",
    description:
      "Six weeks after launch, Jamvi turns a month of M-Pesa into a sorted budget in minutes. What we shipped since August, and what it means for you, your family and your chama.",
    label: "How far Jamvi has come",
    readingMinutes: 5,
    published: "2026-10-08",
    heading: "How far Jamvi has come, and what it does for you",
    intro:
      "Jamvi went live on 30 August 2026. Six weeks later, it turns a month of M-Pesa into a sorted budget in minutes, for one person or a whole chama. Here is what we built, and what it means for your money.",
    sections: [
      {
        heading: "Why Jamvi exists",
        body: [
          "Most Kenyan money moves through M-Pesa, yet few of us can say where last month's went. Chamas, churches and families face the same question with more people watching, and the answer usually lives in a WhatsApp thread or one treasurer's notebook.",
          "A jamvi is the mat people sit on together around one shared plate. That is the idea: money, in the open. Pesa wazi. Whether you budget on your own or with your family, chama or club, everyone can see the same record.",
        ],
      },
      {
        heading: "Six weeks, week by week",
        body: [
          "We have shipped something new almost every week since launch. From late September on, nearly all of it has been about M-Pesa, because that is where your money actually is.",
        ],
        milestones: [
          {
            date: "30 Aug",
            title: "Jamvi goes live",
            text: "Personal budgets and Shared groups on jamvi.co.ke, with Google sign-in.",
          },
          {
            date: "10 Sept",
            title: "Groups and merry-go-round",
            text: "Treasurers set up a group, invite members and run rotating payouts.",
          },
          {
            date: "11 Sept",
            title: "Pay with M-Pesa",
            text: `A free ${TRIAL_DAYS}-day start, then pay by an M-Pesa prompt on your own phone.`,
          },
          {
            date: "26 Sept",
            title: "M-Pesa import",
            text: "Paste your M-Pesa messages or open your statement PDF. Review, then save.",
          },
          {
            date: "1 Oct",
            title: "Budgets that remember",
            text: "Change a budget from this month on. Past months keep what they had.",
          },
          {
            date: "2 Oct",
            title: "Reads your M-Pesa messages",
            text: "On Android, Jamvi tells you how many new M-Pesa messages are waiting to be sorted.",
          },
          {
            date: "5 Oct",
            title: "M-Pesa products filed for you",
            text: "Airtime, bundles, Fuliza, M-Shwari, KCB M-PESA and Hustler Fund sorted without asking.",
          },
          {
            date: "5 Oct",
            title: "No double counting",
            text: "A warning before you type in a payment Jamvi already imported.",
          },
        ],
      },
      {
        heading: "What Jamvi does for you today",
        body: [
          "The biggest benefit is time. A month of M-Pesa that once took an evening of copying into a notebook now takes minutes to sort.",
        ],
        points: [
          {
            title: "Your M-Pesa month, sorted.",
            text: "Paste your messages or open your statement, and every payment is listed ready to file. You check each line before anything is saved.",
          },
          {
            title: "M-Pesa products filed for you.",
            text: "Airtime, data bundles, Home Fibre and M-Pesa charges land under their own M-Pesa heading. Fuliza, M-Shwari, KCB M-PESA and Hustler Fund loans show by name in Who owes who, so you always know what is still owed.",
          },
          {
            title: "Savings you can see.",
            text: "M-Shwari and KCB M-PESA savings appear as savings accounts with a running balance.",
          },
          {
            title: "Budgets that keep their history.",
            text: "Set a budget for each category and change it from any month on. Earlier months keep their own figures, so last March still reads the way it did.",
          },
          {
            title: "One app, alone or together.",
            text: "Your Personal budget and every group you belong to sit in the same app: family, chama, club or church. Treasurers record contributions, run a merry-go-round and share the month's sheet as a PDF.",
          },
          {
            title: "Debts in plain view.",
            text: "Record money you lent or borrowed, and Jamvi keeps track of who has paid back.",
          },
          {
            title: "Answers, not spreadsheets.",
            text: "Search any payee or member across months, and see what changed in Reports.",
          },
        ],
      },
      {
        heading: "Built to be trusted",
        body: [
          "Your money records are personal, so Jamvi is built to keep them private, accurate and in your hands.",
        ],
        points: [
          {
            title: "Your statement stays on your phone.",
            text: "The statement PDF and its password are read on your device and never uploaded. Pasted messages are read to sort them, not kept.",
          },
          {
            title: "Nothing saves without you.",
            text: "Every imported line waits for you to review it first.",
          },
          {
            title: "No double counting.",
            text: "Each M-Pesa receipt can be saved only once, and a Possible duplicates screen helps you tidy up older entries.",
          },
          {
            title: "Nothing is deleted if you stop paying.",
            text: "Your records stay, and your Personal budget keeps working.",
          },
          {
            title: "You can leave.",
            text: "Delete your account from Settings at any time, with 14 days to change your mind.",
          },
        ],
      },
      {
        heading: "Simple pricing",
        body: [
          `KES ${price} a month or KES ${annual} a year, paid by M-Pesa, with your first ${TRIAL_DAYS} days free. One subscription covers your own budget and every group you belong to. Groups cost nothing, and there is no member limit.`,
        ],
      },
      {
        heading: "What comes next",
        body: [
          "Jamvi is on its way to the Google Play Store, and every update keeps your M-Pesa front and centre. Tell us what you want next on WhatsApp or at info@jamvi.co.ke.",
        ],
      },
    ],
    cta: {
      heading: "See where last month's money went.",
      text: `Bring last month's M-Pesa statement and have it sorted in minutes. Free for your first ${TRIAL_DAYS} days, then KES ${price} a month.`,
    },
  },
];
