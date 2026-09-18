/**
 * Feedback dialog for the web app — mirrors mobile's FeedbackModal.
 *
 * Posts to Jamvi's own /api/feedback, which relays it to the Optimum Prime
 * CRM tagged as Jamvi's — see artifacts/api-server/src/routes/feedback.ts.
 * Nothing is stored in Jamvi itself.
 */
import { useState } from "react";
import { Star, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: "settings" | "random-prompt";
  onSubmitted?: () => void;
}

export function FeedbackDialog({ open, onOpenChange, context, onSubmitted }: Props) {
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setTimeout(() => {
        setMessage("");
        setRating(null);
        setSubmitting(false);
        setSent(false);
        setError(null);
      }, 200);
    }
  };

  const submit = async () => {
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          rating: rating ?? undefined,
          context,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not send feedback.");
      }
      setSent(true);
      onSubmitted?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <DialogTitle>Thank you</DialogTitle>
            <p className="text-sm text-muted-foreground">Your feedback helps shape what Jamvi builds next.</p>
            <Button onClick={() => handleOpenChange(false)} className="mt-2 w-full">Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Send feedback</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Tell us what's working, what's not, or what would make Jamvi more useful.
              </p>
            </DialogHeader>
            <div className="flex justify-center gap-2 py-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  data-testid={`feedback-star-${value}`}
                  onClick={() => setRating(rating === value ? null : value)}
                  aria-label={`Rate ${value} out of 5`}
                >
                  <Star
                    className={`h-6 w-6 ${rating != null && value <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
                  />
                </button>
              ))}
            </div>
            <Textarea
              data-testid="feedback-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="What's on your mind?"
              rows={4}
              autoFocus
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>Not now</Button>
              <Button
                data-testid="feedback-submit"
                onClick={() => void submit()}
                disabled={!message.trim() || submitting}
              >
                {submitting ? "Sending…" : "Send"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
