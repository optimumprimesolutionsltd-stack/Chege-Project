import type { ReactNode } from "react";

/**
 * A page's opening: a short mono label naming where you are and for when,
 * the title in the display face, and one line saying what the page is for.
 * Whatever sits beside it (the month picker, the page's main action) goes in
 * `aside`.
 */
export function PageTitle({
  kicker,
  title,
  description,
  aside,
}: {
  kicker: string;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="kicker text-[hsl(var(--clay))] dark:text-[hsl(var(--sisal))]">{kicker}</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold leading-none text-foreground sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 text-muted-foreground">{description}</p> : null}
      </div>
      {aside ? <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">{aside}</div> : null}
    </div>
  );
}

/** The month picker's frame: square, with a firm edge, as on every page. */
export const MONTH_PICKER_CLASS =
  "flex w-full items-center justify-between gap-1 rounded-md border-2 border-foreground/80 bg-card p-1 text-foreground sm:w-auto sm:justify-start";
