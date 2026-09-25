/**
 * The questions, in one place.
 *
 * The page renders these and the FAQPage structured data is built from the
 * same array. Google checks that a rich result matches the visible page and
 * suppresses the result when it does not, so two copies of this list would be
 * a slow, silent way to lose the listing.
 */

export interface FaqEntry {
  question: string;
  answer: string;
}

export const FAQ_ENTRIES: readonly FaqEntry[] = [
  {
    question: "Can Jamvi read my M-Pesa statement?",
    answer:
      "Yes. Choose your M-Pesa statement PDF and type the password M-Pesa sent with it, and Jamvi turns it into a list of payments with who each went to and a suggested category. The file and its password are read on your own phone or computer and are never uploaded. You check the list, change anything that is wrong, and save.",
  },
  {
    question: "Can I paste my M-Pesa messages instead?",
    answer:
      "Yes. Select as many M-Pesa messages as you like in your Messages app, copy them and paste them into Jamvi, or share them straight to the Jamvi app on Android. Jamvi reads them to fill in the list and does not keep the messages. A message it cannot read can be sent to us so the next update understands it.",
  },
  {
    question: "How does Jamvi handle Fuliza?",
    answer:
      "What a Fuliza loan paid for is recorded as an ordinary payment, and its access fee as a bank charge. The loan itself and its repayments are not counted as spending or income. Jamvi tells you what it left out, and shows how any difference from your statement's balance is made up.",
  },
  {
    question: "Is Jamvi a bank account?",
    answer:
      "No. Jamvi records contributions, expenses, and balances. It does not send, receive, or hold money, and it is not a payment service. You still use M-Pesa or your bank to move money; Jamvi is where you record, track, and share the history so everyone is on the same page.",
  },
  {
    question: "Can I use Jamvi for just myself?",
    answer:
      "Absolutely. While Jamvi is great for groups, it includes powerful personal finance tools. You can create a private workspace to track your own income, expenses, and savings goals.",
  },
  {
    question: "Does Jamvi support multiple currencies?",
    answer:
      "Currently, Jamvi is optimized for Kenyan Shillings (KES) to provide the best local experience. We plan to support other East African currencies in the future.",
  },
  {
    question: "How secure is my data?",
    answer:
      "We take your privacy seriously. Your financial data is encrypted and securely stored. We never sell your personal data or financial history to third parties.",
  },
  {
    question: "Can group members edit transactions?",
    answer:
      "This depends on the permissions set by the group admin. By default, to maintain trust and an accurate audit log, modifying past transactions leaves a visible 'correction reason' so everyone knows why a change was made.",
  },
  {
    question: "What happens if our chama grows beyond 6 people?",
    answer:
      "Everyone pays for their own Jamvi subscription, and it covers both your own budget and every Shared group you belong to. Groups have no bill of their own and no member limit, so a chama of fifty costs the group nothing.",
  },
  {
    question: "Does Jamvi offer a non-profit discount?",
    answer:
      "Non-profit discount details have not been confirmed yet. Contact us if your organisation would like to discuss eligibility.",
  },
];
