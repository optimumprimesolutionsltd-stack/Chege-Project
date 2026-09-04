import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = { month: number; year: number; workspaceName?: string };
type AskResponse = { answer: string; readOnly: boolean; workspaceScoped: boolean; month: number; year: number };

export function AskJamviPanel({ month, year, workspaceName }: Props) {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const askMutation = useMutation({
    mutationFn: async (question: string) => {
      const response = await fetch("/api/ai/ask", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, month, year }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Ask Jamvi could not answer right now.");
      return payload as AskResponse;
    },
    onSuccess: setAnswer,
  });
  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || askMutation.isPending) return;
    setQuery(trimmed);
    setAnswer(null);
    askMutation.mutate(trimmed);
  };

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-card shadow-sm" data-testid="ask-jamvi-panel">
      <CardHeader className="border-b border-primary/10 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Sparkles className="h-5 w-5" /></div>
          <div className="min-w-0">
            <CardTitle className="text-lg">Ask Jamvi</CardTitle>
            <CardDescription className="mt-1">Ask across {workspaceName ?? "this budget"}—current or historical spending, bank accounts, income, goals, contributions, members, activity, categories, priorities, or reports. Jamvi can explain and compare your money, but cannot change records or move funds.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); submit(query); }}>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask about this month, history, reports, or any ledger…" aria-label="Ask Jamvi a question" />
          <Button type="submit" size="icon" aria-label="Ask Jamvi" disabled={!query.trim() || askMutation.isPending}><Send className="h-4 w-4" /></Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {["How did this month compare with my history?", "How much have I spent on rent?", "What is in each bank account?", "Which goals need attention?", "Who has contributed?", "What are my highest spending categories?"].map((prompt) => <button key={prompt} type="button" onClick={() => submit(prompt)} className="rounded-full border border-primary/20 bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-primary/10">{prompt}</button>)}
        </div>
        {askMutation.isPending && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Reviewing your budget…</p>}
        {askMutation.isError && <p className="text-sm text-destructive">{askMutation.error instanceof Error ? askMutation.error.message : "Ask Jamvi could not answer right now."}</p>}
        {answer && !askMutation.isPending && <div className="rounded-xl border border-primary/15 bg-background/80 p-4 text-sm leading-relaxed" role="status"><p className="font-semibold text-primary">Jamvi says</p><p className="mt-1 text-foreground">{answer.answer}</p><p className="mt-2 text-xs text-muted-foreground">Read-only · {answer.workspaceScoped ? "Current budget only" : "Unscoped"}</p></div>}
      </CardContent>
    </Card>
  );
}
