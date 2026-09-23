import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const settings = readFileSync('app/(tabs)/settings.tsx', 'utf8');
const workspacesRoute = readFileSync('../api-server/src/routes/workspaces.ts', 'utf8');
const spec = readFileSync('../../lib/api-spec/openapi.yaml', 'utf8');

function extract(source: string, pattern: RegExp): string[] {
  const match = pattern.exec(source);
  if (!match) throw new Error(`Pattern not found: ${pattern}`);
  return match[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
    .filter((entry) => entry.length > 0);
}

/** The icon picker's own values, scoped to its array literal — settings.tsx
 *  has an unrelated { value: '...', label: ... } shape for the theme picker
 *  that would otherwise be swept up by a plain global match. */
function pickerIconValues(): string[] {
  const block = /const SHARED_BUDGET_ICONS = \[([\s\S]*?)\] as const;/.exec(settings);
  if (!block) throw new Error('SHARED_BUDGET_ICONS not found');
  return [...block[1].matchAll(/{ value: '([\w-]+)', label:/g)].map((m) => m[1]);
}

// A picker offering a value the server rejects reads as broken the moment
// somebody taps Save — "choose a provided icon and accent color" for a
// choice the picker itself just offered. The three copies (the picker, the
// server's own fallback set, and the OpenAPI enum the client is generated
// from) have to agree, and nothing enforces that but this test.
describe('the workspace icon and accent color options agree everywhere', () => {
  it('offers more than the original six icons and twelve colors', () => {
    // A regression guard as much as a feature check: this is what "more
    // variety" was asked for.
    const accents = extract(settings, /const SHARED_BUDGET_ACCENTS = \[([\s\S]*?)\] as const;/);
    expect(pickerIconValues().length).toBeGreaterThan(6);
    expect(accents.length).toBeGreaterThan(12);
  });

  it('matches the server\'s fallback validation set exactly', () => {
    const serverIcons = extract(workspacesRoute, /const VALID_ICONS = new Set\(\[([\s\S]*?)\]\);/);
    expect(new Set(pickerIconValues())).toEqual(new Set(serverIcons));

    const pickerAccents = extract(settings, /const SHARED_BUDGET_ACCENTS = \[([\s\S]*?)\] as const;/);
    const serverAccents = extract(workspacesRoute, /const VALID_ACCENTS = new Set\(\[([\s\S]*?)\]\);/);
    expect(new Set(pickerAccents)).toEqual(new Set(serverAccents));
  });

  it('matches the OpenAPI enum the generated client is built from', () => {
    const specIconMatch = /icon:\s*\n\s*type: string\s*\n\s*enum: \[([^\]]+)\]/.exec(spec);
    expect(specIconMatch).not.toBeNull();
    const specIcons = specIconMatch![1].split(',').map((entry) => entry.trim());
    expect(new Set(pickerIconValues())).toEqual(new Set(specIcons));
  });
});
