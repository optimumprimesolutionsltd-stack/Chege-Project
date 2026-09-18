import { describe, expect, it } from 'vitest';
import {
  markFeedbackPromptShown,
  markFeedbackSubmitted,
  recordAppLaunch,
  shouldShowFeedbackPrompt,
} from '../feedbackPrompt';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
  };
}

describe('feedback prompt timing', () => {
  it('counts launches persistently', async () => {
    const storage = memoryStorage();
    expect(await recordAppLaunch(storage)).toBe(1);
    expect(await recordAppLaunch(storage)).toBe(2);
    expect(await recordAppLaunch(storage)).toBe(3);
  });

  it('never prompts before the app has been opened enough times', async () => {
    const storage = memoryStorage();
    expect(await shouldShowFeedbackPrompt(1, storage)).toBe(false);
    expect(await shouldShowFeedbackPrompt(5, storage)).toBe(false);
    expect(await shouldShowFeedbackPrompt(6, storage)).toBe(true);
  });

  it('does not prompt again soon after it was already shown', async () => {
    const storage = memoryStorage();
    // markFeedbackPromptShown uses the real clock, so "now" for the assertions
    // below is derived the same way rather than assuming a fixed date.
    await markFeedbackPromptShown(storage);
    const soonAfter = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const longAfter = new Date(Date.now() + 46 * 24 * 60 * 60 * 1000);
    expect(await shouldShowFeedbackPrompt(10, storage, soonAfter)).toBe(false);
    expect(await shouldShowFeedbackPrompt(10, storage, longAfter)).toBe(true);
  });

  it('does not prompt again soon after feedback was already submitted', async () => {
    const storage = memoryStorage();
    await markFeedbackSubmitted(storage);
    const soonAfter = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const longAfter = new Date(Date.now() + 46 * 24 * 60 * 60 * 1000);
    expect(await shouldShowFeedbackPrompt(10, storage, soonAfter)).toBe(false);
    expect(await shouldShowFeedbackPrompt(10, storage, longAfter)).toBe(true);
  });
});
