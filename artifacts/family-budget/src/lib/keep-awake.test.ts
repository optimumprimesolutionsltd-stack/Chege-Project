import { afterEach, describe, expect, it, vi } from "vitest";
import { keepScreenAwakeWhileSaving, letScreenSleepAgain } from "./keep-awake";

describe("keeping the screen on while saving", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing, without throwing, in a browser that has no Wake Lock API", async () => {
    await expect(keepScreenAwakeWhileSaving()).resolves.toBeUndefined();
    expect(() => letScreenSleepAgain()).not.toThrow();
  });

  it("requests a screen lock when the API exists, and releases it afterwards", async () => {
    const release = vi.fn();
    const request = vi.fn().mockResolvedValue({ release });
    vi.stubGlobal("navigator", { wakeLock: { request } });
    await keepScreenAwakeWhileSaving();
    expect(request).toHaveBeenCalledWith("screen");
    letScreenSleepAgain();
    expect(release).toHaveBeenCalled();
  });

  it("is a no-op the second time nothing was requested", () => {
    expect(() => letScreenSleepAgain()).not.toThrow();
  });
});
