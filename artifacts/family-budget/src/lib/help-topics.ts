/**
 * Where to go on the web to do what - the web's own copy of the phone's "How
 * do I…" guide (mobile-budget/lib/helpTopics.ts).
 *
 * Not a shared twin: the phone's steps name tabs and taps, the web's name the
 * menu on the left and the buttons printed on its pages. Every entry starts
 * from something somebody wants to do and ends at the page that does it.
 */

export type HelpTopic = {
  /** The task, phrased the way somebody would ask for it. */
  question: string;
  /** What to do, in order. */
  steps: string[];
  /** The page it happens on, for the "Take me there" link. */
  route?: string;
  /** Extra words to match when searching. */
  keywords?: string[];
};

export type HelpSection = { title: string; topics: HelpTopic[] };

export const HELP_SECTIONS: HelpSection[] = [
  {
    title: "Money in and out",
    topics: [
      {
        question: "Record money coming into a bank account",
        steps: ["Open Bank accounts in the menu.", "Choose Money in.", "Pick the account it landed in and who or what it came from."],
        route: "/bank",
        keywords: ["deposit", "paid in", "received", "income"],
      },
      {
        question: "Record money leaving a bank account",
        steps: ["Open Bank accounts in the menu.", "Choose Money out.", "Say where it went and give it a category."],
        route: "/bank",
        keywords: ["withdraw", "spent", "paid out", "payment"],
      },
      {
        question: "Record an expense",
        steps: ["Open My Expenses (Group Expenses in a group).", "Choose Record Expense.", "Give the amount, the category and who paid."],
        route: "/expenses",
        keywords: ["spend", "spent", "bought", "purchase", "cost"],
      },
      {
        question: "Enter a whole day of bank entries at once",
        steps: ["Open Enter a whole day in the menu.", "Add a row for each entry, money in or out.", "Save them all together."],
        route: "/bank-day",
        keywords: ["many", "batch", "day", "bulk"],
      },
      {
        question: "Add a bank account, M-Pesa or cash",
        steps: ["Open Bank accounts in the menu.", "Choose Create bank account.", "Give it a name and the balance it holds today."],
        route: "/bank",
        keywords: ["account", "mpesa", "cash", "wallet", "opening balance"],
      },
    ],
  },
  {
    title: "M-Pesa",
    topics: [
      {
        question: "Import my M-Pesa statement",
        steps: [
          "Open Import M-Pesa in the menu.",
          "Choose your M-Pesa statement PDF and give its password if it has one.",
          "Go through the entries and confirm them. Only confirmed entries are saved, so you can do it over several days.",
        ],
        route: "/mpesa-import",
        keywords: ["statement", "pdf", "import", "safaricom", "messages", "sms"],
      },
      {
        question: "Carry on confirming an import I started earlier",
        steps: [
          "Open Import M-Pesa in the menu.",
          "Choose the same statement PDF and use Read my statement again (keeps your choices).",
          "Everything you confirmed or changed is still there.",
        ],
        route: "/mpesa-import",
        keywords: ["resume", "continue", "again", "keep"],
      },
      {
        question: "Give the same category to many M-Pesa entries at once",
        steps: [
          "In Import M-Pesa, search the entries by name, word, amount, or in / out.",
          "Choose a category for everything found, then confirm them together.",
          "Leave Remember ticked and Jamvi suggests the same next time.",
        ],
        route: "/mpesa-import",
        keywords: ["bulk", "search", "amount", "remember", "bundles", "airtime"],
      },
    ],
  },
  {
    title: "Budget",
    topics: [
      {
        question: "Add a budget category",
        steps: ["Open My Budget (Group Budget in a group).", "Choose Add category.", "Give it a monthly budget, and a heading to sit under if you want one."],
        route: "/budget",
        keywords: ["category", "subcategory", "heading", "new group", "plan"],
      },
      {
        question: "Change a budget from a month onwards, or for one month only",
        steps: [
          "Open My Budget and edit the category.",
          "Change the amount, then choose whether it applies from that month on or only that month.",
          "Earlier months keep the budget they had.",
        ],
        route: "/budget",
        keywords: ["history", "only this month", "from this month", "change"],
      },
      {
        question: "See the budget as planned, or print it",
        steps: ["Open Budget plan in the menu.", "Step to the month you want.", "Use PDF to download it."],
        route: "/budget-plan",
        keywords: ["plan", "print", "pdf", "share"],
      },
      {
        question: "See whether a month kept to its budget",
        steps: ["Open Budget report in the menu.", "Step to the month.", "Overspends are listed first, then every category."],
        route: "/budget-report",
        keywords: ["over budget", "overspent", "planned", "actual"],
      },
    ],
  },
  {
    title: "Groups and contributions",
    topics: [
      {
        question: "Start a group, such as a chama",
        steps: ["Open My budget & groups in the menu.", "Choose Create or join a group.", "Name the group, then invite its members."],
        route: "/groups",
        keywords: ["chama", "church", "club", "shared", "create"],
      },
      {
        question: "Invite somebody to a group",
        steps: ["Open the group, then Settings.", "Use Invite people by email."],
        route: "/settings",
        keywords: ["invite", "member", "join", "add person"],
      },
      {
        question: "See who has paid their contribution",
        steps: ["Open the group, then Contributions.", "Expected vs actual shows what each member was meant to give against what they gave, over months or exact dates."],
        route: "/contributions",
        keywords: ["paid", "arrears", "owing", "expected", "variance"],
      },
      {
        question: "Switch between my Personal budget and a group",
        steps: ["Open My budget & groups in the menu.", "Choose the budget or group you want to be in."],
        route: "/groups",
        keywords: ["switch", "personal", "change budget"],
      },
    ],
  },
  {
    title: "Savings and debt",
    topics: [
      {
        question: "Save towards a goal",
        steps: ["Open My Goals (Group Goals in a group).", "Choose New Goal and give it a target.", "Use Add Contribution each time you put money towards it."],
        route: "/savings-goals",
        keywords: ["saving", "target", "goal"],
      },
      {
        question: "See when my debts will be paid off",
        steps: [
          "Open Debt in the menu.",
          "Mark a budget category as a debt and give its balance and interest; its monthly budget is what you pay.",
          "Jamvi works out when each one clears, smallest first or costliest first.",
        ],
        route: "/debt",
        keywords: ["loan", "owe", "payoff", "interest", "fuliza", "snowball", "avalanche"],
      },
      {
        question: "Keep track of who owes me and who I owe",
        steps: ["Open Who owes who in the menu.", "Add a person or institution, or borrow and lend from Bank accounts."],
        route: "/parties",
        keywords: ["borrow", "lend", "creditor", "debtor", "loan"],
      },
    ],
  },
  {
    title: "Reports and finding things",
    topics: [
      {
        question: "See where the money went",
        steps: ["Open My Reports (Group Reports in a group).", "Pick the month, or exact dates."],
        route: "/reports",
        keywords: ["report", "summary", "income", "spending", "trend"],
      },
      {
        question: "See every expense or every bit of income",
        steps: ["Open All expenses or All income in the menu.", "Show it by date, by category or by item, and download a PDF."],
        route: "/expense-ledger",
        keywords: ["ledger", "list", "statement", "pdf"],
      },
      {
        question: "Find out how much I spend on one thing",
        steps: ["Open Spending by item in the menu.", "Search for it, such as Netflix."],
        route: "/spending-by-item",
        keywords: ["item", "netflix", "how much"],
      },
      {
        question: "Find an entry",
        steps: ["Open Search in the menu.", "Search by words, a name or an M-Pesa code."],
        route: "/search",
        keywords: ["find", "look up", "code", "naivas"],
      },
    ],
  },
  {
    title: "Your account",
    topics: [
      {
        question: "Pay for Jamvi",
        steps: ["Open Pay & subscription in the menu.", "Pay with M-Pesa."],
        route: "/subscription",
        keywords: ["pay", "subscription", "trial", "mpesa", "price"],
      },
      {
        question: "Change between light and dark",
        steps: ["Open Settings.", "Choose under Appearance. System follows your device."],
        route: "/settings",
        keywords: ["dark", "light", "theme", "night", "appearance"],
      },
      {
        question: "Delete my account",
        steps: ["Open Settings.", "Use Delete account. You have 14 days to change your mind."],
        route: "/settings",
        keywords: ["delete", "close", "remove"],
      },
    ],
  },
];

export function searchHelp(query: string): HelpSection[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return HELP_SECTIONS;
  return HELP_SECTIONS
    .map((section) => ({
      title: section.title,
      topics: section.topics.filter((topic) =>
        [topic.question, ...topic.steps, ...(topic.keywords ?? [])].join(" ").toLocaleLowerCase().includes(needle)),
    }))
    .filter((section) => section.topics.length > 0);
}
