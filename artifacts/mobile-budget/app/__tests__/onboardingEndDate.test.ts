import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The onboarding wizard's custom end date.
 *
 * It was a free-text box asking for YYYY-MM-DD, guarded only against being
 * empty, so "next month", "12/25" and dates already in the past were all
 * accepted and saved as the budget's finish line. Every other date in the app
 * is entered through a picker; this one had no reason to be different.
 */
const source = readFileSync('app/budget-chooser.tsx', 'utf8');

describe('the custom budget end date', () => {
  it('is chosen from a picker, not typed', () => {
    expect(source).toContain('<DateTimePicker');
    expect(source).toContain("testID=\"onboarding-custom-end-date\"");
    // The old free-text field asked for a format. Nothing should any more.
    expect(source).not.toContain('placeholder="YYYY-MM-DD"');
  });

  it('cannot be set to today or earlier', () => {
    // The picker refuses them outright, and the step guard catches a restored
    // draft that already carries one.
    expect(source).toContain('minimumDate={tomorrow()}');
    expect(source).toContain('draft.customEndDate <= isoDate(new Date())');
    expect(source).toContain("setError('Choose an end date in the future.')");
  });

  it('still requires a date at all before moving on', () => {
    expect(source).toContain("setError('Choose an end date for this budget.')");
  });

  it('keeps the picker on screen on iOS until a date is chosen', () => {
    // Android dismisses its dialog itself; iOS renders inline and would
    // otherwise vanish on the first change event.
    expect(source).toContain("if (Platform.OS !== 'ios') setShowEndDatePicker(false);");
  });
});

describe('the wizard keeps its place', () => {
  it('restores a saved draft and says so rather than silently resuming', () => {
    expect(source).toContain('setRestoredDraft(true)');
    expect(source).toContain('Welcome back — your setup is saved.');
  });

  it('clamps a restored step to the six that exist', () => {
    expect(source).toContain('Math.max(0, Math.min(5, saved.lastStep ?? 0))');
  });
});
