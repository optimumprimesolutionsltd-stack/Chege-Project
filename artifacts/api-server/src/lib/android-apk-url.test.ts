import { describe, expect, it } from "vitest";
import { androidApkUrl, androidSmsApkUrl, DEFAULT_ANDROID_APK_URL, DEFAULT_ANDROID_SMS_APK_URL } from "./webAppServing";

describe("the Android app's permanent address", () => {
  it("points at the jamvi-android release unless JAMVI_APK_URL says otherwise", () => {
    expect(androidApkUrl({})).toBe(DEFAULT_ANDROID_APK_URL);
    expect(androidApkUrl({ JAMVI_APK_URL: "https://play.google.com/store/apps/details?id=ke.co.optimumprimesolutions.jamvi" }))
      .toContain("play.google.com");
    // Only an https address is followed, so a mistyped setting cannot send people somewhere odd.
    expect(androidApkUrl({ JAMVI_APK_URL: "javascript:alert(1)" })).toBe(DEFAULT_ANDROID_APK_URL);
  });

  it("keeps the version that reads M-Pesa messages at its own address", () => {
    expect(androidSmsApkUrl({})).toBe(DEFAULT_ANDROID_SMS_APK_URL);
    expect(DEFAULT_ANDROID_SMS_APK_URL).toMatch(/jamvi-android\/jamvi-sms\.apk$/);
    expect(androidSmsApkUrl({ JAMVI_SMS_APK_URL: "https://example.com/jamvi.apk" })).toBe("https://example.com/jamvi.apk");
    expect(androidSmsApkUrl({ JAMVI_SMS_APK_URL: "http://example.com/jamvi.apk" })).toBe(DEFAULT_ANDROID_SMS_APK_URL);
    // The two settings do not leak into each other.
    expect(androidSmsApkUrl({ JAMVI_APK_URL: "https://example.com/other.apk" })).toBe(DEFAULT_ANDROID_SMS_APK_URL);
  });
});
