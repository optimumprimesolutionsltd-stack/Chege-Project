/**
 * Guides — the informational layer.
 *
 * The audience pages answer "is this app for me". These answer the question
 * people type before they are looking for an app at all: how do I keep chama
 * records, who has paid this month, how do we split the bills without keeping
 * score. Each one is useful on its own and ends by pointing at the part of
 * Jamvi that does the tedious part.
 *
 * Same single-source-of-truth rule as segments: routing, the SEO table and the
 * sitemap are all generated from this array, so a guide cannot exist without a
 * description or drift from the one search engines were given.
 */

export interface GuideSection {
  heading: string;
  body: string[];
}

export interface Guide {
  slug: string;
  /** SEO title, minus the " | Jamvi" the build appends. */
  title: string;
  /** SEO description and the sentence under the guide's heading. */
  description: string;
  /** Short label for lists and breadcrumbs. */
  label: string;
  /** Reading time shown on the page. */
  readingMinutes: number;
  /** ISO date the guide was last reviewed, for the Article schema. */
  updated: string;
  heading: string;
  intro: string;
  sections: GuideSection[];
  /** The takeaway box at the end. */
  takeaway: string;
  /** The audience page this guide funnels to. */
  related: { slug: string; label: string; blurb: string };
}

export const GUIDES: readonly Guide[] = [
  {
    slug: "/guides/chama-record-keeping",
    title: "How to Keep Clear Chama Records",
    description:
      "A simple record-keeping system for a chama: what to write down each meeting, where to keep it, and how to make the record something every member can check rather than just the treasurer.",
    label: "Chama record-keeping",
    readingMinutes: 5,
    updated: "2026-09-10",
    heading: "How to keep clear chama records",
    intro:
      "Most chama disputes are not about the money. They are about the record — a figure nobody can confirm, a month nobody wrote down, a book only one person has seen. A record everyone can check ends most of those arguments before they start.",
    sections: [
      {
        heading: "Write down four things every meeting",
        body: [
          "The date. The amount each member contributed, by name — including the members who did not pay, recorded as zero, because a blank line and a zero are not the same thing to the person being asked about it later.",
          "Anything the group spent, with who authorised it. And the running balance after all of that, so the next meeting starts from an agreed number rather than a recount.",
          "If you write nothing else, write those four. A month with a date, the per-member figures, the spending and the closing balance can always be reconstructed. A month without them cannot.",
        ],
      },
      {
        heading: "Keep it where more than one person can see it",
        body: [
          "A notebook the treasurer carries is one rained-on bag away from gone, and a spreadsheet on one laptop is no better. The record needs to survive the treasurer travelling, changing phones, or falling out with the group.",
          "The practical test: if the treasurer were unreachable for a month, could the group still say what everyone had paid this year? If the honest answer is no, the record is in one place and it should be in two.",
        ],
      },
      {
        heading: "Make corrections visible, not silent",
        body: [
          "Records get things wrong — a figure typed twice, a payment logged against the wrong name. The problem is never the mistake. It is a correction that looks like a cover-up because nobody can see what changed or why.",
          "Fix errors by adding a dated note that says what was changed and the reason, leaving the original visible. A correction that explains itself reads as diligence. One that quietly overwrites the past reads as something to worry about.",
        ],
      },
      {
        heading: "Show the whole record, not a summary",
        body: [
          "At the AGM, a single 'total collected' line invites the question it is trying to avoid. Members trust a record they can trace: this person paid this much in March, that expense was for this, the balance moved by exactly that.",
          "The month-by-month sheet — names down the side, months across the top — is the format chamas already use on paper for a reason. It answers 'what did I pay in April' without anyone having to go and check.",
        ],
      },
    ],
    takeaway:
      "Four things a meeting, kept somewhere two people can reach, with corrections that explain themselves and a sheet anyone can read. That is the whole system.",
    related: {
      slug: "/chama",
      label: "Jamvi for chamas",
      blurb:
        "Jamvi keeps that sheet for you: record the whole meeting in one entry, see who is behind, and download the month's sheet as a PDF for the group chat. The chama pays nothing — only members who record money need a subscription.",
    },
  },
  {
    slug: "/guides/track-who-has-paid",
    title: "How to Track Who Has Paid in a Group",
    description:
      "Ways to see who has contributed and who is behind — for a chama, a class fund or a church — without chasing a WhatsApp thread or rebuilding the list from memory every month.",
    label: "Tracking contributions",
    readingMinutes: 4,
    updated: "2026-09-10",
    heading: "How to track who has paid, and who is behind",
    intro:
      "The treasurer's real job is not collecting money. It is being able to say, at any moment, who is up to date and who is not — without a recount, and without it turning into an accusation.",
    sections: [
      {
        heading: "Start from the member list, not the payments",
        body: [
          "A list built from who has paid always looks complete, because the people who have not paid are simply absent from it. Build the list from every member instead, and mark each as paid or not. The gaps are the point.",
          "This is why a grid works: every member has a row whether or not they have contributed, so an empty cell is visible rather than invisible.",
        ],
      },
      {
        heading: "Record the expected amount, so 'behind' means something",
        body: [
          "'Behind' only has a meaning if there is a figure to be behind against. Write down what each member is expected to give per month — the same for everyone, or different where the group has agreed it — and the shortfall calculates itself.",
          "Someone who pays in two instalments is not two separate entries to reconcile. Both land in the same month and add up; what matters is whether the total reached the expected amount.",
        ],
      },
      {
        heading: "Handle prepayments without losing track",
        body: [
          "A member who pays three months up front should read as up to date for three months, not as having overpaid once and then fallen behind twice. Carry the surplus forward against the months it covers.",
          "The same applies in reverse: a shortfall does not carry backward. If March was short, March stays short even after April is paid in full.",
        ],
      },
      {
        heading: "Keep the chase list separate from the record",
        body: [
          "The month-by-month record is for everyone. The list of who to remind this week is for the treasurer. Being able to switch to 'show only those who still owe', with the amount beside each name, turns a review meeting into a two-minute task.",
        ],
      },
    ],
    takeaway:
      "Build the list from all members, record what each is expected to give, carry prepayments forward, and keep a one-tap view of who still owes. Then chasing is quick and it is not personal.",
    related: {
      slug: "/chama",
      label: "Jamvi for chamas",
      blurb:
        "Jamvi does this arithmetic for you: a member grid with a row for everyone, prepayments carried forward, and a 'show only those behind' switch with the shortfall beside each name.",
    },
  },
  {
    slug: "/guides/splitting-bills-fairly",
    title: "Splitting Bills With a Partner or Roommates",
    description:
      "How couples, families and roommates share rent, bills and shopping without one person keeping a tally in their head — and without the resentment that comes from not being able to check.",
    label: "Splitting household bills",
    readingMinutes: 4,
    updated: "2026-09-10",
    heading: "Splitting bills without keeping score in your head",
    intro:
      "Sharing money with people you live with is less about arithmetic than about memory. Somebody paid the water bill in March, somebody else has covered shopping three weeks running, and neither of you wants to be the one keeping count. The resentment does not come from the money. It comes from not being able to check.",
    sections: [
      {
        heading: "Agree the split once, in plain terms",
        body: [
          "Down the middle, by income, or a fixed share each — any of them work, and none of them work if they were never actually said out loud. Write the rule down where both of you can see it, so a disagreement later is about the rule and not about what somebody remembers agreeing.",
          "It does not have to be equal. It has to be written.",
        ],
      },
      {
        heading: "Record who paid, as it happens",
        body: [
          "The tally-in-the-head is the problem. Every shared cost — rent, power, water, the big shop — gets logged when it is paid, with who paid it and how it divides. Five seconds at the till beats an argument at the end of the month.",
          "An uneven split is fine here too: record that one person covered the whole electricity bill this month and it counts toward their share, rather than pretending everything was halved.",
        ],
      },
      {
        heading: "Keep one history both people can open",
        body: [
          "Two versions of events is the same as no record. Everybody sees the same entries in the same order, so nobody has to be believed — it is written down where all of you can look.",
          "Your own spending stays yours. What you buy on your own account is not part of the shared history; only what you record as shared is shared.",
        ],
      },
      {
        heading: "Settle up on the record, not on a feeling",
        body: [
          "At the end of the month the record says who is ahead and who is behind by how much. One transfer squares it. The conversation is 'the app says I owe you 1,400' rather than 'I feel like I've been paying for everything'.",
        ],
      },
    ],
    takeaway:
      "Write the split down, log who paid as it happens, keep one shared history, and let the record — not a feeling — say who settles up with whom.",
    related: {
      slug: "/household",
      label: "Jamvi for households",
      blurb:
        "Jamvi keeps that shared history for a couple, a family or roommates: one record everyone can see, uneven splits recorded honestly, and your own private budget alongside it in the same subscription.",
    },
  },
];

export function guideFor(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}
