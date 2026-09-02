import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const home = readFileSync('app/(tabs)/index.tsx', 'utf8');

describe('mobile Ask Jamvi entry point', () => {
  it('explains Ask Jamvi as a read-only whole-budget assistant and exposes a CTA', () => {
    expect(home).toContain('testID="ask-jamvi-cta"');
    expect(home).toContain('Ask about anything in this budget: spending, bank accounts, income, goals, activity, categories, or reports.');
    expect(home).toContain('testID="open-ask-jamvi"');
  });

  it('sends the active month and year to the read-only Ask Jamvi endpoint', () => {
    expect(home).toContain("customFetch<AskResponse>('/api/ai/ask'");
    expect(home).toContain('JSON.stringify({ question, month, year })');
    expect(home).toContain('Read-only · {askAnswer.workspaceScoped ?');
  });
});