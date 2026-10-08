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
    slug: "/blog/shipping-subcategory-planning",
    title: "From a Screenshot to Every Phone in an Afternoon",
    description:
      "How Jamvi went from one suggestion on a screenshot to a release on every phone and the web on 5 October 2026: planning on subcategories, categories that total themselves, and the checks that keep it safe.",
    label: "Shipping subcategory planning",
    readingMinutes: 4,
    published: "2026-10-08",
    heading: "From a screenshot to every phone in an afternoon",
    intro:
      "On 5 October 2026 Jamvi went from one suggestion on a screenshot to a release on every phone and the web, in a single afternoon. Setup now plans amounts against subcategories only, a category shows just their total, and Everyday budgeting is preselected. Here is why we made the change, and how we made sure it could not go wrong.",
    sections: [
      {
        heading: "Why we changed it",
        body: [
          "The last step of setup used to ask for one figure per category: Food, Housing, Utilities, each with a single box. A figure for all of Food is a guess, and a budget built from guesses goes over in the first week. New budgets also started without subcategories, so there was nowhere finer to record spending.",
          "The suggestion was short: open the subcategories and put the amount boxes against them, not the parents. A follow-up made it a rule for the whole app. Amounts live only on subcategories, and a category only shows the total of what is inside it. The Budget screen already worked that way, so setup was the part out of step.",
        ],
      },
      {
        heading: "One afternoon, step by step",
        body: [
          "Each step was tested before it went out: more than 3,900 automated tests across the phone app, the web app and the server.",
        ],
        milestones: [
          {
            date: "5 Oct",
            title: "Phone setup and the server",
            text: "Categories open into subcategories with their own amounts, the server creates them under their category, and Everyday budgeting is preselected on phone and web.",
          },
          {
            date: "5 Oct",
            title: "Update sent to every phone",
            text: "Delivered to the installed app, so nobody had to download anything new.",
          },
          {
            date: "5 Oct",
            title: "Web setup follows",
            text: "jamvi.co.ke plans on subcategories the same way, from the same list.",
          },
          {
            date: "5 Oct",
            title: "The rule holds everywhere",
            text: "The server now refuses an amount on a category that has subcategories, from any app version.",
          },
        ],
      },
      {
        heading: "How it holds together",
        body: [
          "Getting the screen right was the easy part. The work was making sure the new rule could not quietly break.",
        ],
        points: [
          {
            title: "Every category has a list.",
            text: "44 categories, from Food to a wedding's Catering, each open into one to four subcategories. A check fails if any category setup offers is missing one, so a category never needs a box of its own.",
          },
          {
            title: "No name can clash.",
            text: "A budget allows each category name once, so no subcategory repeats another, or a category, a debt such as Bank loan, or the built-in M-Pesa charges. That is why Loans gets \"Loan repayments\", not \"Bank loan\".",
          },
          {
            title: "Categories stay honest.",
            text: "The server creates subcategories under their category and keeps the category at zero. If a subcategory already exists, it only fills in an amount that was blank, and it never moves a category that lives somewhere else.",
          },
          {
            title: "Phone and web cannot drift apart.",
            text: "The web keeps its own copy of the list, and a check requires the two to be identical.",
          },
          {
            title: "Your existing budgets were not touched.",
            text: "Nothing was rewritten. Only new setups get subcategories.",
          },
        ],
      },
      {
        heading: "Tell us what is missing",
        body: [
          "We picked the subcategory names to match how Kenyan households spend: Matatu & bus, Boda boda, SHA contributions, Harambees. If a name does not sound like you, or something you spend on every month is missing, tell us on WhatsApp or at info@jamvi.co.ke. Lists like these are quick to change.",
        ],
      },
    ],
    cta: {
      heading: "Start with a budget that adds itself up.",
      text: `Set up Jamvi in a few minutes, with Groceries, Rent and Fuel ready to plan. Free for your first ${TRIAL_DAYS} days, then KES ${price} a month.`,
    },
  },
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
            text: "Your records stay and you can still see all of them. You just cannot add new entries until you subscribe again, and then everything carries on where you left off.",
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
  {
    slug: "/blog/a-year-of-mpesa-sorted",
    title: "From a Year of M-Pesa to a Budget You Trust",
    description:
      "How Jamvi turns months of M-Pesa statements into a sorted budget at your own pace: confirm what you know, save the rest as Not sure, and check every shilling against your statement.",
    label: "A year of M-Pesa, sorted",
    readingMinutes: 4,
    published: "2026-10-08",
    heading: "From a year of M-Pesa to a budget you trust",
    intro:
      "We imported nine months of our own M-Pesa, January to September, about 1,500 entries, and sorted them over a few evenings. Everything that made that hard is now easier in Jamvi.",
    sections: [
      {
        heading: "Work through it at your own pace",
        body: [
          "A year of entries takes more than one sitting. Jamvi lets you confirm a little at a time, and only what you have confirmed is saved.",
        ],
        points: [
          {
            title: "Nothing saves by accident.",
            text: "Every line starts as Jamvi's suggestion. You confirm it, change it or leave it for later, and Save takes only what you confirmed.",
          },
          {
            title: "Pick up where you left off.",
            text: "Close the app halfway and your choices are still there. Read the same statement again and everything you confirmed is kept.",
          },
          {
            title: "A month at a time.",
            text: "Filter a long statement by month, or search by name, word or amount, then confirm or file everything found in one go.",
          },
          {
            title: "Undo.",
            text: "Tapped the wrong category? Undo takes back your last changes, one step at a time.",
          },
        ],
      },
      {
        heading: "Not sure? Save it anyway",
        body: [
          "Some old payments nobody can place. They should not hold up the rest, and they should not be forgotten either.",
        ],
        points: [
          {
            title: "Not sure yet.",
            text: "Money out goes to a Not sure yet category, so it still counts as spending. Money in is kept without a source.",
          },
          {
            title: "Everything else in one tap.",
            text: "Put every entry Jamvi could not place under Not sure, and save the whole statement at once.",
          },
          {
            title: "Reminded until it is done.",
            text: "Home shows how many entries are left to sort, with a badge on the Home tab. Settle each one whenever you remember, a month at a time.",
          },
        ],
      },
      {
        heading: "Jamvi learns as you go",
        body: [
          "Tell Jamvi once where a payee belongs and it suggests that every time after. It learns from till and paybill numbers too, so a shop under a different spelling is still the same shop.",
          "Payments that belong to your chama or another budget you run can be sent there straight from your own import, and Jamvi remembers that payee belongs there.",
        ],
      },
      {
        heading: "Check every shilling against your statement",
        body: [
          "Home shows your M-Pesa balance as Jamvi has it, so you can compare it with the M-Pesa app at a glance.",
        ],
        points: [
          {
            title: "Both balances, side by side.",
            text: "Read a statement and Jamvi shows its balance and M-Pesa's for the day before the statement starts and its last day.",
          },
          {
            title: "Every difference, listed.",
            text: "What Jamvi has that M-Pesa does not, and what M-Pesa has that Jamvi does not, such as a charge that was never saved.",
          },
          {
            title: "Fixed where it is shown.",
            text: "Remove a duplicate with Undo, add a missing charge, or use the statement's amount, without leaving the import.",
          },
        ],
      },
      {
        heading: "Your M-Pesa messages, read for you",
        body: [
          "On Android, the version of Jamvi that reads SMS can read your M-Pesa messages for any period you choose, and tell you the moment a new one arrives, even with the app closed. It only reads M-Pesa's own messages, only after Android asks you, and you can turn it off at any time.",
        ],
      },
    ],
    cta: {
      heading: "Start with one month.",
      text: `Bring last month's M-Pesa statement and see it sorted. Free for your first ${TRIAL_DAYS} days, then KES ${price} a month.`,
    },
  },
  {
    slug: "/blog/one-jamvi-phone-and-web",
    title: "One Jamvi on Your Phone and the Web, for You and Your Group",
    description:
      "Everything Jamvi does on your phone now works on the web too. Budgets that remember their history, groups that work like your own budget, Undo, and one link to get the Android app.",
    label: "One Jamvi, phone and web",
    readingMinutes: 3,
    published: "2026-10-08",
    heading: "One Jamvi on your phone and the web, for you and your group",
    intro:
      "We put the phone app and the web app side by side, screen by screen, and closed every gap. Whatever you can do in one, you can now do in the other.",
    sections: [
      {
        heading: "The same app in both places",
        body: [
          "The web gained every expense and every bit of income in one list, spending by item, the income trend, business profit, a debt-free date for your loans, a budget plan, a budget against actual report and a How do I help page.",
          "The phone gained period totals, a six-month spending trend, each member's contributions month by month, and a warning when a savings goal and its contributions disagree.",
        ],
      },
      {
        heading: "Your budget and your groups, alike",
        body: [
          "A Personal budget has everything a group has, and a group has Reports and Search on the phone too. Every group works the same way, whoever set it up.",
        ],
        points: [
          {
            title: "For a chama or church.",
            text: "See what each member was expected to give against what they gave, for any months or exact dates.",
          },
          {
            title: "Budgets that remember.",
            text: "Change a budget from this month on, or for this month only. Income streams work the same way, so last year's reports still show last year's plan.",
          },
          {
            title: "Add a category anywhere.",
            text: "Every way of adding a category takes a monthly budget and can create a new heading on the spot.",
          },
        ],
      },
      {
        heading: "Mistakes are easy to undo",
        body: [
          "Delete a bank entry, an expense or a budget category, and a bar offers Undo for a few seconds. Tap it and the entry is back exactly as it was, still linked to its charge, debt or split.",
          "Saving carries on in the background while you use other apps, waits out a brief break in the connection, and shows its progress when you come back.",
        ],
      },
      {
        heading: "Getting the app",
        body: [
          "The Android app is one link: jamvi.co.ke/download. It always gives the newest version, with install steps and what Android's warnings mean. Once installed, updates arrive inside the app. On an iPhone, Jamvi works in your browser.",
        ],
      },
    ],
    cta: {
      heading: "Use it where you are.",
      text: `On your phone or at jamvi.co.ke, one subscription covers your own budget and every group you belong to. Free for your first ${TRIAL_DAYS} days.`,
    },
  },
];
