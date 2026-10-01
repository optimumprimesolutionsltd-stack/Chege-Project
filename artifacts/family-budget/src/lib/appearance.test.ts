import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isAppearance, resolveAppearance } from "./appearance";

// "The app is using Jamvi night as default for a new user instead of system default."
describe("the web follows the device unless told otherwise", () => {
  it("draws what the device asks for when nothing was chosen", () => {
    expect(resolveAppearance("system", true)).toBe("midnight");
    expect(resolveAppearance("system", false)).toBe("white");
  });

  it("keeps a choice of white or Jamvi night", () => {
    expect(resolveAppearance("white", true)).toBe("white");
    expect(resolveAppearance("midnight", false)).toBe("midnight");
  });

  it("knows system as a choice", () => {
    expect(isAppearance("system")).toBe(true);
    expect(isAppearance("purple")).toBe(false);
  });

  it("paints the first frame from the device too, and no longer starts dark", () => {
    const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('const isMidnight = appearance === "midnight" || (appearance !== "white" && deviceDark);');
  });

  it("offers Match this device in Settings", () => {
    const settings = readFileSync(new URL("../pages/settings.tsx", import.meta.url), "utf8");
    expect(settings).toContain('onClick={() => chooseAppearance("system")}');
  });
});
