/**
 * "Who is this for?" on an M-Pesa import line: you, or one of your businesses.
 * The phone's components/WhoIsThisFor, as the web's import asks it
 * (lib/import-business does the choosing for both).
 *
 * Money out for a business picks one of its costs (a category linked to it) or
 * adds one; money in for a business is its sales.
 */
import { useState } from "react";
import { Briefcase, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type Business = { id: number; name: string; countsProfit?: boolean };

export function WhoIsThisFor({
  index,
  direction,
  businesses,
  businessId,
  onBusiness,
  costs,
  category,
  onCategory,
  onAddCost,
  onAddBusiness,
  remembers,
}: {
  index: number;
  direction: "in" | "out";
  businesses: readonly Business[];
  /** Null for Personal. */
  businessId: number | null;
  onBusiness: (id: number | null) => void;
  /** The chosen business's own costs (money out only). */
  costs: readonly string[];
  category: string;
  onCategory: (name: string) => void;
  onAddCost: (name: string) => Promise<void>;
  onAddBusiness: (name: string) => Promise<void>;
  /** Whether Jamvi keeps this payee for the business after Save. */
  remembers: boolean;
}) {
  const chosen = businesses.find((one) => one.id === businessId) ?? null;
  const [newCost, setNewCost] = useState("");
  const [newBusiness, setNewBusiness] = useState("");
  const [namingBusiness, setNamingBusiness] = useState(false);
  const [adding, setAdding] = useState(false);
  const add = async (what: () => Promise<void>) => {
    setAdding(true);
    try { await what(); } finally { setAdding(false); }
  };
  const chip = (on: boolean) =>
    `inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-foreground"}`;

  return (
    <div className="space-y-2" data-testid={`who-is-this-for-${index}`}>
      <p className="text-sm font-semibold text-foreground">Who is this for?</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Who is this for?">
        <button type="button" role="radio" aria-checked={businessId === null} onClick={() => onBusiness(null)} className={chip(businessId === null)} data-testid={`who-for-personal-${index}`}>
          Personal
        </button>
        {businesses.map((one) => (
          <button key={one.id} type="button" role="radio" aria-checked={businessId === one.id} onClick={() => onBusiness(one.id)} className={chip(businessId === one.id)} data-testid={`who-for-business-${one.id}-${index}`}>
            <Briefcase className="h-3 w-3" aria-hidden="true" />
            {one.name}
          </button>
        ))}
        {!namingBusiness ? (
          <button type="button" onClick={() => setNamingBusiness(true)} className={`${chip(false)} text-primary`} data-testid={`who-for-new-business-open-${index}`}>
            + A business
          </button>
        ) : null}
      </div>
      {namingBusiness ? (
        <div className="flex gap-2">
          <Input value={newBusiness} onChange={(event) => setNewBusiness(event.target.value)} placeholder="The business, e.g. Ujenzi Hardware" className="h-10 bg-card" data-testid={`who-for-new-business-${index}`} />
          <Button
            onClick={() => void add(async () => { await onAddBusiness(newBusiness.trim()); setNewBusiness(""); setNamingBusiness(false); })}
            disabled={adding || !newBusiness.trim()}
            data-testid={`who-for-add-business-${index}`}
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
          </Button>
        </div>
      ) : null}
      {chosen && direction === "out" ? (
        <>
          <p className="text-xs text-muted-foreground">
            {chosen.countsProfit === false
              ? `${chosen.name}'s money, not your spending. Its profit is not counted here, so no Business report.`
              : `One of ${chosen.name}'s costs - it counts in ${chosen.name}'s profit in the Business report.`}
          </p>
          {costs.length > 0 ? (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`${chosen.name}'s costs`}>
              {costs.map((name) => (
                <button key={name} type="button" role="radio" aria-checked={category === name} onClick={() => onCategory(name)} className={chip(category === name)} data-testid={`who-for-cost-${name}-${index}`}>
                  {name}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Input value={newCost} onChange={(event) => setNewCost(event.target.value)} placeholder={`New cost, e.g. ${chosen.name} - materials`} className="h-10 bg-card" data-testid={`who-for-new-cost-${index}`} />
            <Button
              onClick={() => void add(async () => { await onAddCost(newCost.trim()); setNewCost(""); })}
              disabled={adding || !newCost.trim()}
              data-testid={`who-for-add-cost-${index}`}
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
            </Button>
          </div>
        </>
      ) : null}
      {chosen && direction === "in" ? (
        <p className="text-xs text-muted-foreground">
          {chosen.countsProfit === false
            ? `${chosen.name}'s money, not your income.`
            : `${chosen.name}'s sales - in the Business report.`}
        </p>
      ) : null}
      {chosen ? (
        <p className="text-xs text-muted-foreground">
          {remembers
            ? `The payee's other lines here follow. After Save, Jamvi remembers this payee for ${chosen.name}.`
            : `Saved as ${chosen.name}'s. Jamvi will not remember this payee for it.`}
        </p>
      ) : null}
    </div>
  );
}
