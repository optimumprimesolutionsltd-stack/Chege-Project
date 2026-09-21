/**
 * Where to go to do what.
 *
 * Written because the app had no answer to that question anywhere in it. The
 * guides on the website are marketing pieces — how to budget, what a chama
 * pays — and none of them names a button.
 *
 * Every entry names the real control in the words printed on the screen: a
 * guide that paraphrases is one you still have to translate. Where the answer
 * is "you cannot do that here", it says so, rather than leaving somebody
 * hunting for a thing that is not there.
 *
 * Kept as data so it can be searched and checked, and so a screen that gains a
 * button does not quietly leave this behind.
 */

export type HelpTopic = {
  /** The task, phrased the way somebody would ask for it. */
  question: string;
  /** What to do, in order. Short enough to hold in your head while you tap. */
  steps: string[];
  /** Where it happens, for the jump button. Omitted when it is not one place. */
  route?: string;
  /** Extra words to match when searching, beyond the question and the steps. */
  keywords?: string[];
};

export type HelpSection = {
  title: string;
  topics: HelpTopic[];
};

export const HELP_SECTIONS: HelpSection[] = [
  {
    title: 'Money in and out',
    topics: [
      {
        question: 'Record money coming into a bank account',
        steps: [
          'Banking tab, then Deposit.',
          'Choose the account it landed in and who put it there.',
          'If it is a contribution for an earlier month, set the second date to the month it was for.',
        ],
        route: '/(tabs)/bank',
        keywords: ['deposit', 'paid in', 'received', 'income'],
      },
      {
        question: 'Record money leaving a bank account',
        steps: [
          'Banking tab, then Withdraw.',
          'Say where it went, and give it a category.',
          'Details is optional unless you chose Other.',
        ],
        route: '/(tabs)/bank',
        keywords: ['withdraw', 'spent', 'paid out', 'payment'],
      },
      {
        question: 'Record a whole day of banking in one go',
        steps: [
          'Banking tab, then Withdraw.',
          'Enter the first line, then tap Save and add another instead of Withdraw.',
          'The date, the account and the people stay put. Only the amount and category clear.',
          'The balance falls as you type, so you can work down to the figure on your statement.',
        ],
        route: '/(tabs)/bank',
        keywords: ['several', 'many', 'batch', 'statement', 'day'],
      },
      {
        question: 'Put money into savings',
        steps: [
          'Banking tab, then Transfer. Or Withdraw, with Savings as the destination.',
          'Both credit the goal, and count as moved rather than spent.',
        ],
        route: '/(tabs)/bank',
        keywords: ['save', 'savings', 'goal', 'set aside'],
      },
      {
        question: 'Move money between your own accounts',
        steps: [
          'Banking tab, then Bank to Bank.',
          'It changes both balances and is neither income nor spending.',
        ],
        route: '/(tabs)/bank',
        keywords: ['transfer', 'between accounts', 'internal'],
      },
      {
        question: 'Log spending that did not go through a tracked account',
        steps: [
          'Log Expense, from the Home tab.',
          'Quick is one category. Detailed splits one payment across categories or people, backdates it, or makes it recurring.',
        ],
        route: '/add-expense',
        keywords: ['cash', 'expense', 'mpesa', 'spending'],
      },
      {
        question: 'Add up receipts without leaving the app',
        steps: [
          'Type the sum straight into any amount field: 1200+800+450.',
          'The operators sit under the field, and the total shows as you type.',
        ],
        keywords: ['calculator', 'add', 'sum', 'total', 'arithmetic'],
      },
    ],
  },
  {
    title: 'Checking an account',
    topics: [
      {
        question: 'Set what was already in the account',
        steps: [
          'Banking tab, then Edit starting balance.',
          'Date it from when that amount applied.',
        ],
        route: '/(tabs)/bank',
        keywords: ['opening balance', 'starting', 'initial'],
      },
      {
        question: 'Check the app against your bank statement',
        steps: [
          'Banking tab, then Check against statement.',
          'Type the closing balance your bank shows.',
          'Jamvi names what it cannot account for, and offers to record it against a category.',
        ],
        route: '/(tabs)/bank',
        keywords: ['reconcile', 'statement', 'difference', 'balance', 'match'],
      },
      {
        question: 'See what was spent rather than merely moved',
        steps: [
          'Banking tab, on the balance card.',
          'Spent and Moved are separate figures. Savings transfers and moves between your own accounts are still your money.',
        ],
        route: '/(tabs)/bank',
        keywords: ['spent', 'moved', 'difference'],
      },
    ],
  },
  {
    title: 'Accounts and goals',
    topics: [
      {
        question: 'Add a bank account',
        steps: [
          'Banking tab, the plus beside Bank accounts.',
          'Or from inside Deposit or Withdraw, without losing what you were entering.',
        ],
        route: '/(tabs)/bank',
        keywords: ['new account', 'bank', 'mpesa', 'create'],
      },
      {
        question: 'Rename or remove a bank account',
        steps: [
          'Banking tab. Tap the account to select it.',
          'A small pencil appears inside that chip. Tap it.',
          'Remove is in the same place. An account with transactions cannot be removed.',
        ],
        route: '/(tabs)/bank',
        keywords: ['edit account', 'rename', 'delete account'],
      },
      {
        question: 'Create a savings goal',
        steps: [
          'Goals tab.',
          'Or from inside Withdraw or Transfer, where the goal list is.',
          'A target is optional. Leave it blank if you are setting money aside without a figure in mind.',
        ],
        route: '/(tabs)/goals',
        keywords: ['goal', 'savings', 'target'],
      },
    ],
  },
  {
    title: 'Budget and categories',
    topics: [
      {
        question: 'Add a category',
        steps: [
          'Budget tab, then the plus on a tier.',
          'Or from inside Log Expense and Withdraw, when the one you want is not listed.',
        ],
        route: '/(tabs)/budget',
        keywords: ['category', 'new', 'create'],
      },
      {
        question: 'Make a group that totals other categories',
        steps: [
          'Budget tab, add a category, then choose A group of categories under What is this?',
          'A group holds no money of its own. Its budget is its subcategories added up.',
        ],
        route: '/(tabs)/budget',
        keywords: ['group', 'parent', 'heading', 'subcategory', 'total'],
      },
      {
        question: 'Put a category inside a group, or take it out',
        steps: [
          'Budget tab, edit the category.',
          'Under Inside another category, pick the group. Or Its own category to bring it back out.',
          'A category that already has subcategories cannot itself go inside one.',
        ],
        route: '/(tabs)/budget',
        keywords: ['move', 'nest', 'parent', 'child', 'subcategory'],
      },
      {
        question: 'Why a category will not take an expense',
        steps: [
          'Because it has subcategories, which makes it a heading.',
          'Spending goes on one of the subcategories, and the heading totals them.',
        ],
        keywords: ['heading', 'cannot', 'refused', 'parent', 'error'],
      },
    ],
  },
  {
    title: 'Groups and people',
    topics: [
      {
        question: 'Record what someone contributed',
        steps: [
          'Contributions tab.',
          'Or record it as a bank deposit and name who it came from.',
        ],
        route: '/(tabs)/contributions',
        keywords: ['contribution', 'member', 'chama', 'paid'],
      },
      {
        question: 'Record a payment made for an earlier month',
        steps: [
          'Record it as a deposit on the Banking tab.',
          'Set the first date to when it arrived, and the second to the month it was for.',
          'The contributions report counts it under the month it covers, not the month it landed.',
        ],
        route: '/(tabs)/bank',
        keywords: ['arrears', 'late', 'backdate', 'month'],
      },
    ],
  },
  {
    title: 'Seeing where it went',
    topics: [
      {
        question: 'See the month at a glance',
        steps: ['Reports tab.'],
        route: '/(tabs)/reports',
        keywords: ['report', 'summary', 'month'],
      },
      {
        question: 'See every expense in one list',
        steps: ['Reports tab, then the expense ledger.'],
        route: '/expense-ledger',
        keywords: ['ledger', 'list', 'all', 'expenses'],
      },
      {
        question: 'See what each item cost across the month',
        steps: ['Reports tab, then spending by item.'],
        route: '/spending-by-item',
        keywords: ['item', 'per item', 'totals'],
      },
    ],
  },
  {
    title: 'Debt',
    topics: [
      {
        question: 'Start tracking a debt',
        steps: [
          'Debt tab, then Track a debt.',
          'Name it, say what is owed, and give the yearly rate if you know it.',
          'Using the name of a category you already have marks that category as the debt, rather than making a second one.',
          'Or make it while paying: in Withdraw, add the category and tick This is money I owe.',
        ],
        route: '/(tabs)/debt',
        keywords: ['debt', 'loan', 'creditor', 'owed', 'borrow', 'fuliza', 'sacco'],
      },
      {
        question: 'Change what you owe',
        steps: [
          'Debt tab, then the pencil on that debt.',
          'The balance and the rate are both editable.',
        ],
        route: '/(tabs)/debt',
        keywords: ['balance', 'edit debt', 'interest', 'rate'],
      },
      {
        question: 'Pay a debt from a bank account',
        steps: [
          'Banking tab, then Withdraw, with the debt as the category.',
          'After it saves, Jamvi asks whether to take that much off what you owe.',
          'It asks rather than doing it, so a payment you later edit or delete cannot leave the balance quietly wrong.',
        ],
        route: '/(tabs)/bank',
        keywords: ['pay', 'repay', 'loan', 'creditor', 'reduce'],
      },
      {
        question: 'Pay someone you owe, or an institution',
        steps: [
          'Banking tab, then Withdraw.',
          'Under where the money is going, choose Someone I owe, and pick them.',
          'Give it a category as usual — the money did leave.',
          'Once it saves, Jamvi offers to take the payment off what you owe them.',
        ],
        route: '/(tabs)/bank',
        keywords: ['mwangi', 'kcb', 'creditor', 'repay', 'loan', 'party', 'institution'],
      },
      {
        question: 'Stop tracking a debt',
        steps: [
          'Debt tab, then Stop tracking on that debt.',
          'The category stays, along with everything recorded against it. Only the balance owed is forgotten.',
        ],
        route: '/(tabs)/debt',
        keywords: ['remove debt', 'cleared', 'finished', 'stop'],
      },
    ],
  },
];

/** Every topic, flattened, for searching and counting. */
export function allHelpTopics(): HelpTopic[] {
  return HELP_SECTIONS.flatMap((section) => section.topics);
}

/**
 * Topics matching what somebody typed. Matches the question, the steps and the
 * keywords together, because people search for the words on the screen they
 * are stuck on as often as for the name of the task.
 */
export function searchHelp(query: string): HelpSection[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return HELP_SECTIONS;
  return HELP_SECTIONS
    .map((section) => ({
      title: section.title,
      topics: section.topics.filter((topic) => {
        const hay = [topic.question, ...topic.steps, ...(topic.keywords ?? [])]
          .join(' ')
          .toLocaleLowerCase();
        return hay.includes(needle);
      }),
    }))
    .filter((section) => section.topics.length > 0);
}
