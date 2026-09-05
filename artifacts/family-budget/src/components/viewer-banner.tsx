import { Eye } from "lucide-react";
import { Link } from "wouter";

/**
 * Tells a viewer what they are looking at, and offers the way out.
 *
 * Without this, view-only access reads as a broken app: the buttons are gone
 * and nothing says why. It also carries the only upgrade path, because a
 * viewer cannot promote themselves - that would make the role meaningless -
 * so the ask has to go to whoever runs the budget.
 */
export function ViewerBanner({ groupName }: { groupName?: string | null }) {
  return (
    <div
      className="mb-4 rounded-xl border border-secondary/30 bg-secondary/10 p-4"
      data-testid="viewer-banner"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary/20 text-secondary">
            <Eye className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">
              You are viewing{groupName ? ` ${groupName}` : " this budget"}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              You can see everything and record nothing. Viewing is free — you will never be asked to pay for it.
              To record money here, ask an admin of this budget to make you a member.
            </p>
          </div>
        </div>
        <Link
          href="/"
          className="shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-center text-sm font-semibold text-foreground hover:bg-muted"
          data-testid="viewer-own-budget"
        >
          Go to my own budget
        </Link>
      </div>
    </div>
  );
}
