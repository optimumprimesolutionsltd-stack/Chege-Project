import { describe, expect, it } from "vitest";
import { androidApkUrl, DEFAULT_ANDROID_APK_URL } from "./webAppServing";

describe("the Android app's permanent address", () => {
  it("points at the jamvi-android release unless JAMVI_APK_URL says otherwise", () => {
    expect(androidApkUrl({})).toBe(DEFAULT_ANDROID_APK_URL);
    expect(androidApkUrl({ JAMVI_APK_URL: "https://play.google.com/store/apps/details?id=ke.co.optimumprimesolutions.jamvi" }))
      .toContain("play.google.com");
    // Only an https address is followed, so a mistyped setting cannot send people somewhere odd.
    expect(androidApkUrl({ JAMVI_APK_URL: "javascript:alert(1)" })).toBe(DEFAULT_ANDROID_APK_URL);
  });
});
