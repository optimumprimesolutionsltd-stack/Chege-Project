import { describe, expect, it } from "vitest";
import {
  getAuthDonePath,
  getLogoutReturnPath,
  getLogoutUrl,
  PUBLIC_HOME_PATH,
} from "@workspace/replit-auth-web";

describe("web authentication return paths", () => {
  it("keeps the OAuth close page inside the app base path", () => {
    expect(getAuthDonePath("/app")).toBe("/app/auth-done");
    expect(getAuthDonePath("/app/")).toBe("/app/auth-done");
  });

  it("uses the root close page when the app is mounted at root", () => {
    expect(getAuthDonePath("/")).toBe("/auth-done");
    expect(getAuthDonePath("")).toBe("/auth-done");
  });

  it("always signs out to the public homepage", () => {
    expect(PUBLIC_HOME_PATH).toBe("/");
    expect(getLogoutReturnPath()).toBe("/");
    expect(getLogoutUrl()).toBe("/api/logout?returnTo=%2F");
  });
});