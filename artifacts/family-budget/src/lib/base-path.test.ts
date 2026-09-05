import { describe, expect, it } from "vitest";
import { appPath, basePath, routePath } from "./base-path";

describe("base-path routing", () => {
  it("prefixes browser navigation paths under a nested deployment", () => {
    expect(basePath("/app/")).toBe("/app");
    expect(appPath("/", "/app/")).toBe("/app/");
    expect(appPath("/join/token-1", "/app/")).toBe("/app/join/token-1");
  });

  it("maps only paths inside the deployment back to route-relative paths", () => {
    expect(routePath("/app/", "/app/")).toBe("/");
    expect(routePath("/app/auth-done", "/app/")).toBe("/auth-done");
    expect(routePath("/app/invite/token-1", "/app/")).toBe("/invite/token-1");
    expect(routePath("/invite/token-1", "/app/")).toBeNull();
  });

  it("recognises the reset-password link that goes out by email", () => {
    // The link in the email is absolute and built by the server. If it is ever
    // written without the /app prefix it lands on the marketing site's
    // catch-all instead, which answers 200 with a not-found page — a broken
    // reset that looks like a working one.
    expect(routePath("/app/reset-password", "/app/")).toBe("/reset-password");
    expect(routePath("/reset-password", "/app/")).toBeNull();
  });

  it("recognises the invitation link that goes out by email", () => {
    // Same trap as the reset link: the server builds this one absolutely, and
    // without the /app prefix it never reaches this router at all. The
    // marketing catch-all answers it 200 instead, so nothing looks broken
    // except to the person holding the invitation.
    expect(appPath("/invite/token-1", "/app/")).toBe("/app/invite/token-1");
    expect(routePath("/app/invite/token-1", "/app/")).toBe("/invite/token-1");
    expect(routePath("/invite/token-1", "/app/")).toBeNull();
  });

  it("continues to support root deployments", () => {
    expect(appPath("/privacy", "/")).toBe("/privacy");
    expect(routePath("/privacy", "/")).toBe("/privacy");
  });
});