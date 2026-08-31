import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKes } from "@/lib/utils";
import { answerAskJamviQuery, ASK_JAMVI_PROMPTS, type AskJamviSummary } from "@/lib/ask-jamvi";

type Props = { month: number; year: number; workspaceName?: string };

export function AskJamviPanel({ month, year, workspaceName }: Props) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const summaryQuery = useQuery<AskJamviSummary>({
    queryKey: ["ai-budget-summary", month, year],
    queryFn: async () => {
      const response = await fetch(`/api/ai/budget-summary?month=${month}&year=${year}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load your budget summary.");
      return response.json() as Promise<AskJamviSummary>;
    },
    enabled: Boolean(submittedQuery),
    staleTime: 60_000,
  });
  const answer = submittedQuery && summaryQuery.data ? answerAskJamviQuery(submittedQuery, summaryQuery.data) : null;
  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setSubmittedQuery(trimmed);
  };

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-card shadow-sm" data-testid="ask-jamvi-panel">
      <CardHeader className="border-b border-primary/10 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Sparkles className="h-5 w-5" /></div>
          <div className="min-w-0">
            <CardTitle className="text-lg">Ask Jamvi</CardTitle>
            <CardDescription className="mt-1">A read-only view of {workspaceName ?? "this budget"}. Your Personal and Shared data stay separate.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); submit(query); }}>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask about your budget…" aria-label="Ask Jamvi a question" />
          <Button type="submit" size="icon" aria-label="Ask Jamvi" disabled={!query.trim() || summaryQuery.isFetching}><Send className="h-4 w-4" /></Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {ASK_JAMVI_PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => submit(prompt)} className="rounded-full border border-primary/20 bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-primary/10">{prompt}</button>)}
        </div>
        {summaryQuery.isFetching && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Reviewing your budget…</p>}
        {summaryQuery.isError && <p className="text-sm text-destructive">{summaryQuery.error instanceof Error ? summaryQuery.error.message : "Could not load your budget summary."}</p>}
        {answer && !summaryQuery.isFetching && <div className="rounded-xl border border-primary/15 bg-background/80 p-4 text-sm leading-relaxed" role="status"><p className="font-semibold text-primary">Jamvi says</p><p className="mt-1 text-foreground">{answer.text}</p>{answer.intent === "overview" && summaryQuery.data ? <p className="mt-2 text-xs text-muted-foreground">Budgeted {formatKes(summaryQuery.data.totals.budgeted)} · Spent {formatKes(summaryQuery.data.totals.spent)}</p> : null}</div>}
      </CardContent>
    </Card>
  );
}
