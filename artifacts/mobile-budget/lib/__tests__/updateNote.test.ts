import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { updateNotesFrom } from '../updateNote';

// "When Jamvi says update ready, can I get a brief description of what the
// update is about, so I can check it out?"
describe('what an update says is new', () => {
  const manifest = (updateNote?: string, message?: string) => ({
    metadata: message ? { message } : {},
    extra: { expoClient: { extra: updateNote ? { updateNote } : {} } },
  });

  it('is the note published with it, one item per "|"', () => {
    expect(updateNotesFrom(manifest('Business: Show all details | Home leaves side-hustle costs out '))).toEqual([
      'Business: Show all details',
      'Home leaves side-hustle costs out',
    ]);
  });

  it('falls back to the publish message, then to nothing', () => {
    expect(updateNotesFrom(manifest(undefined, 'Fixes'))).toEqual(['Fixes']);
    expect(updateNotesFrom(manifest())).toEqual([]);
    expect(updateNotesFrom(undefined)).toEqual([]);
  });

  it('is put in the manifest from JAMVI_UPDATE_NOTE, and only extra changes', () => {
    const config = readFileSync('app.config.js', 'utf8');
    expect(config).toContain("process.env.JAMVI_UPDATE_NOTE");
    expect(config).toContain('extra: { ...config.extra, ...(note ? { updateNote: note } : {}) },');
  });
});
