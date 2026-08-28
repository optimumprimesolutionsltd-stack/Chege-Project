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

  it("continues to support root deployments", () => {
    expect(appPath("/privacy", "/")).toBe("/privacy");
    expect(routePath("/privacy", "/")).toBe("/privacy");
  });
});