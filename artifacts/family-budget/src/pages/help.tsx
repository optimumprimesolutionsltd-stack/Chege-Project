import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRightCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { searchHelp, type HelpTopic } from "@/lib/help-topics";

function TopicRow({ topic, id }: { topic: HelpTopic; id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-b-0">
      <button type="button" onClick={() => setOpen((was) => !was)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 py-3 text-left" data-testid={`help-topic-${id}`}>
        <span className="text-sm font-semibold text-foreground">{topic.question}</span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
      {open ? (
        <div className="space-y-2 pb-4" data-testid={`help-answer-${id}`}>
          <ol className="space-y-1.5">
            {topic.steps.map((step, index) => (
              <li key={step} className="flex gap-2 text-sm text-muted-foreground">
                <span className="font-bold text-primary">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {topic.route ? (
            <Link href={topic.route} className="inline-flex items-center gap-1.5 rounded-full border border-primary px-3 py-1 text-sm font-semibold text-primary" data-testid={`help-go-${id}`}>
              <ArrowRightCircle className="h-4 w-4" /> Take me there
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * How do I… - the phone's Help screen (app/help.tsx), which the web did not
 * have: a task-by-task map of the web app, each answer collapsed so the whole
 * map is visible at once, and searchable.
 */
export default function Help() {
  const [query, setQuery] = useState("");
  const sections = useMemo(() => searchHelp(query), [query]);
  return (
    <div className="space-y-5 pb-12" data-testid="help-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">How do I…</h1>
        <p className="text-sm text-muted-foreground">Find the thing you want to do, and the page that does it.</p>
      </div>
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search, such as statement or chama" className="h-10" data-testid="help-search" />
      {sections.length === 0 ? (
        <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">Nothing matches “{query.trim()}”. Try another word.</p>
      ) : (
        sections.map((section) => (
          <section key={section.title} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</h2>
            <Card>
              <CardContent className="px-4 py-0">
                {section.topics.map((topic) => <TopicRow key={topic.question} topic={topic} id={`${section.title}-${topic.question}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")} />)}
              </CardContent>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
