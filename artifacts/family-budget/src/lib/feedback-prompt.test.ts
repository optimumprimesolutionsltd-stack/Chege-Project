import { describe, expect, it } from "vitest";
import {
  markFeedbackPromptShown,
  markFeedbackSubmitted,
  recordAppLaunch,
  shouldShowFeedbackPrompt,
  type FeedbackPromptStorage,
} from "./feedback-prompt";

function memoryStorage(): FeedbackPromptStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("feedback prompt timing", () => {
  it("counts launches persistently", () => {
    const storage = memoryStorage();
    expect(recordAppLaunch(storage)).toBe(1);
    expect(recordAppLaunch(storage)).toBe(2);
    expect(recordAppLaunch(storage)).toBe(3);
  });

  it("never prompts before the app has been opened enough times", () => {
    const storage = memoryStorage();
    expect(shouldShowFeedbackPrompt(1, storage)).toBe(false);
    expect(shouldShowFeedbackPrompt(5, storage)).toBe(false);
    expect(shouldShowFeedbackPrompt(6, storage)).toBe(true);
  });

  it("does not prompt again soon after it was already shown", () => {
    const storage = memoryStorage();
    markFeedbackPromptShown(storage);
    const soonAfter = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const longAfter = new Date(Date.now() + 46 * 24 * 60 * 60 * 1000);
    expect(shouldShowFeedbackPrompt(10, storage, soonAfter)).toBe(false);
    expect(shouldShowFeedbackPrompt(10, storage, longAfter)).toBe(true);
  });

  it("does not prompt again soon after feedback was already submitted", () => {
    const storage = memoryStorage();
    markFeedbackSubmitted(storage);
    const soonAfter = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const longAfter = new Date(Date.now() + 46 * 24 * 60 * 60 * 1000);
    expect(shouldShowFeedbackPrompt(10, storage, soonAfter)).toBe(false);
    expect(shouldShowFeedbackPrompt(10, storage, longAfter)).toBe(true);
  });
});
