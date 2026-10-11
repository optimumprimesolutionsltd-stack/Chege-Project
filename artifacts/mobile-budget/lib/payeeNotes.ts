import type { Choice, PreviewLine } from './mpesaImport';
import { payeeKey, type PayeeRules } from './payeeLearning';

/**
 * A note remembered for a payee, kept with the payee rules (lib/rulesStore, on
 * the server) under "note:<payee>": "when jamvi asks if it can remember a
 * category, can it also ask if it can remember additional notes and in such
 * cases to prioritize them when showing the brief description of payments"
 * (11 Oct 2026). The next payment to that payee starts with the note filled
 * in, and lists show the note before M-Pesa's own words.
 */
export const NOTE_PREFIX = 'note:';

export const noteKey = (description: string | null | undefined): string => {
  const key = description ? payeeKey(description) : '';
  return key ? `${NOTE_PREFIX}${key}` : '';
};

/** The note remembered for this payee, or ''. */
export function rememberedNote(rules: PayeeRules, description: string | null | undefined): string {
  const key = noteKey(description);
  return key ? (rules[key] ?? '').trim() : '';
}

/** The rules with this payee's note kept (or let go, when it is blank). */
export function withNoteRule(rules: PayeeRules, description: string, note: string): PayeeRules {
  const key = noteKey(description);
  if (!key) return rules;
  const text = note.trim().slice(0, 200);
  if (!text) {
    if (!(key in rules)) return rules;
    const { [key]: _gone, ...rest } = rules;
    return rest;
  }
  return rules[key] === text ? rules : { ...rules, [key]: text };
}

/** Lines with no note yet take their payee's remembered one, marked as Jamvi's. */
export function withRememberedNotes(lines: readonly PreviewLine[], choices: Record<number, Choice>, rules: PayeeRules): Record<number, Choice> {
  if (!Object.keys(rules).some((key) => key.startsWith(NOTE_PREFIX))) return choices;
  let next = choices;
  for (const line of lines) {
    const choice = next[line.index];
    if (!choice || choice.notes?.trim()) continue;
    const note = rememberedNote(rules, line.description);
    if (!note) continue;
    if (next === choices) next = { ...choices };
    next[line.index] = { ...choice, notes: note, noteAuto: true };
  }
  return next;
}
