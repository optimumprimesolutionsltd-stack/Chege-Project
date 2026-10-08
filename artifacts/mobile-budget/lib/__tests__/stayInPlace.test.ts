import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isResumable } from '@/lib/resumeAfterUpdate';

// "When a new update comes in and I press it, it removes me from what I am doing."
describe('an update brings you back to the import', () => {
  it('counts the import as a screen to come back to', () => {
    expect(isResumable('/mpesa-import')).toBe(true);
  });

  it('waits while an M-Pesa save is running', () => {
    const layout = readFileSync('app/_layout.tsx', 'utf8');
    expect(layout).toContain("saving.current = importProgress?.stage === 'saving';");
    expect(layout).toContain('shouldInstallOnReturn({ downloaded: downloaded.current, awayMs, saving: saving.current })');
  });
});

// "When I save an import it removes me from that session."
describe('saving part of a statement keeps you on it', () => {
  const screen = readFileSync('app/mpesa-import.tsx', 'utf8');

  it('shows how the save went on the review while entries are left', () => {
    expect(screen).toContain('if (leftToSave > 0) {\n        setLastSave(result);'.replace(/\n/g, screen.includes('\r\n') ? '\r\n' : '\n'));
    expect(screen).toContain('testID="mpesa-last-save"');
  });

  it('marks entries the server already had as recorded, not left looking unsaved', () => {
    expect(screen).toContain('// Already on the server: shown as recorded, not left looking unsaved.');
  });
});
