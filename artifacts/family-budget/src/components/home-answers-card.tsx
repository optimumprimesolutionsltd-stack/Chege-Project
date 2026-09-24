import { Link } from "wouter";
import { ChevronRight, CreditCard, Flag, ShoppingBag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatKes } from "@/lib/utils";
import { homeAnswers, type Tone } from "@/lib/home-answers";

const TONE_CLASS: Record<Tone, string> = {
  good: "text-success",
  careful: "text-amber-600",
  over: "text-destructive",
  neutral: "text-muted-foreground",
};

/**
 * Three questions, three answers, at the top of the overview:
 * How much do I have? What did I spend this month? Am I on track?
 * Everything below is detail behind these.
 */
export function HomeAnswersCard({
  balance,
  spent,
  budget,
}: {
  balance: number | null | undefined;
  spent: number | null | undefined;
  budget: number | null | undefined;
}) {
  const answers = homeAnswers({ balance, spent, budget });
  const rows = [
    {
      key: "have",
      href: "/bank",
      question: "How much do I have?",
      answer: answers.have === null ? "Add a bank account to see it" : formatKes(answers.have),
      icon: CreditCard,
      big: answers.have !== null,
      tone: "text-foreground",
    },
    {
      key: "spent",
      href: "/expenses",
      question: "What did I spend this month?",
      answer: formatKes(answers.spent),
      icon: ShoppingBag,
      big: true,
      tone: "text-foreground",
    },
    {
      key: "track",
      href: "/budget",
      question: "Am I on track?",
      answer: answers.track.text,
      icon: Flag,
      big: false,
      tone: TONE_CLASS[answers.track.tone],
    },
  ];

  return (
    <Card className="overflow-hidden border-none shadow-md" data-testid="home-answers">
      <CardContent className="grid divide-y divide-border/50 p-0 md:grid-cols-3 md:divide-x md:divide-y-0">
        {rows.map(({ key, href, question, answer, icon: Icon, big, tone }) => (
          <Link key={key} href={href} className="block" data-testid={`home-answer-${key}`}>
            <div className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/40">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted-foreground">{question}</span>
                <span className={`mt-0.5 block font-display font-bold ${big ? "text-xl" : "text-base"} ${tone}`}>{answer}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
