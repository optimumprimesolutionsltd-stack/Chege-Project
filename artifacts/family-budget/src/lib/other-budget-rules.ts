import { payeeKey, payeeName } from "./payee-learning";
import { destinationOf, isRecordable, type Choice, type PreviewLine } from "./mpesa-import";

/**
 * Payees the person asked Jamvi to remember as belonging to another budget -
 * the chama"s paybill, the treasurer who pays out the merry-go-round - so the
 * next statement suggests that budget for them, as a remembered category is
 * suggested for everyday payees.
 *
 * Kept on this device for the budget being imported into, like the category
 * rules (payeeLearning), and only ever a suggestion: the line waits for the
 * person to confirm it (Choice.otherBudgetAuto).
 *
 * Shared with the web (sync-web-twins.py).
 */
export type OtherBudgetRule = NonNullable<Choice["otherBudget"]>;
export type OtherBudgetRules = Record<string, OtherBudgetRule>;

export const otherBudgetRulesKey = (groupId: number | string | undefined): string => `jamvi:other-budget-rules:${groupId ?? "none"}`;

/** A till or paybill number when the line has one - the same chama under another spelling is still the same number - else the payee"s name. */
const keysFor = (line: PreviewLine): string[] => {
  const keys: string[] = [];
  if (line.payeeNumber) keys.push(`#${line.payeeNumber}`);
  const name = line.description ? payeeKey(line.description) : "";
  if (name) keys.push(name);
  return keys;
};

/** How a remembered payee is shown: its number, or its name. */
export const otherBudgetRuleLabel = (key: string): string => (key.startsWith("#") ? `Till or paybill ${key.slice(1)}` : key);

/** What was stored, or nothing when it is missing or damaged. */
export function parseOtherBudgetRules(raw: string | null | undefined): OtherBudgetRules {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const kept: OtherBudgetRules = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const rule = value as Partial<OtherBudgetRule> | null;
      if (key && rule && typeof rule.groupId === "number" && typeof rule.accountId === "number" && typeof rule.groupName === "string" && typeof rule.accountName === "string") {
        kept[key] = {
          groupId: rule.groupId,
          groupName: rule.groupName,
          accountId: rule.accountId,
          accountName: rule.accountName,
          ...(typeof rule.category === "string" ? { category: rule.category } : {}),
          ...(typeof rule.incomeSourceId === "number" ? { incomeSourceId: rule.incomeSourceId } : {}),
        };
      }
    }
    return kept;
  } catch {
    return {};
  }
}

/** The budget remembered for this line"s payee, if any. */
export function otherBudgetRuleFor(line: PreviewLine, rules: OtherBudgetRules): { key: string; rule: OtherBudgetRule } | null {
  for (const key of keysFor(line)) {
    if (rules[key]) return { key, rule: rules[key] };
  }
  return null;
}

/** Remembers that this line"s payee belongs to `target`. */
export function withOtherBudgetRule(rules: OtherBudgetRules, line: PreviewLine, target: OtherBudgetRule): OtherBudgetRules {
  const keys = keysFor(line);
  if (keys.length === 0) return rules;
  const next = { ...rules };
  for (const key of keys) next[key] = { ...target };
  return next;
}

/** Forgets one remembered payee, or every key this line"s payee is remembered under. */
export function withoutOtherBudgetRule(rules: OtherBudgetRules, keyOrLine: string | PreviewLine): OtherBudgetRules {
  const keys = typeof keyOrLine === "string" ? [keyOrLine] : keysFor(keyOrLine);
  if (!keys.some((key) => key in rules)) return rules;
  const next = { ...rules };
  for (const key of keys) delete next[key];
  return next;
}

/**
 * Suggests the remembered budget for each line whose payee has one. Only lines
 * still on Jamvi"s suggestion are touched: nothing the person chose, confirmed
 * or answered "No" to; and only a budget they still run (`managedGroupIds`).
 */
export function applyOtherBudgetRules(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
  rules: OtherBudgetRules,
  managedGroupIds: readonly number[],
): Record<number, Choice> {
  if (Object.keys(rules).length === 0) return choices;
  let next = choices;
  for (const line of lines) {
    const choice = next[line.index];
    if (!choice?.include || !isRecordable(line) || choice.confirmed || choice.otherBudgetAuto === false) continue;
    if (destinationOf(choice) !== "category" || choice.debt) continue;
    // A category or income source the person set by hand is their answer.
    if (choice.category.trim() && choice.auto === false) continue;
    if (choice.incomeSourceId != null && choice.sourceAuto === false) continue;
    if (line.type?.startsWith("fuliza_") || line.type === "transaction_charge") continue;
    const found = otherBudgetRuleFor(line, rules);
    if (!found || !managedGroupIds.includes(found.rule.groupId)) continue;
    const { category, incomeSourceId, ...where } = found.rule;
    const otherBudget = line.direction === "out" ? { ...where, category: category ?? "" } : { ...where, incomeSourceId: incomeSourceId ?? null };
    next = { ...next, [line.index]: { ...choice, otherBudget, otherBudgetAuto: true, remember: choice.remember ?? true } };
  }
  return next;
}

/** "Remember Chama Paybill goes to Wanjiku Chama" - the words for the tick box. */
export const rememberOtherBudgetLabel = (line: PreviewLine, groupName: string): string =>
  `Remember ${payeeName(line.description ?? "") || "this payee"} goes to ${groupName}`;
