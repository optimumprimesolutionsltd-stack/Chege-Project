import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const middleware = readFileSync("src/middlewares/authMiddleware.ts", "utf8").split("\r\n").join("\n");
const auth = readFileSync("src/lib/auth.ts", "utf8");

// "On importing, the app logs itself out" - an hour after a Google sign-in, a
// token that could not be renewed deleted the whole Jamvi session.
describe("a Jamvi session and the sign-in provider's token", () => {
  it("never ends the session because the provider's token could not be renewed", () => {
    const refresh = middleware.slice(middleware.indexOf("async function refreshIfExpired"), middleware.indexOf("export async function authMiddleware"));
    expect(refresh).toContain("if (!session.refresh_token) return session;");
    expect(refresh).toContain("} catch {\n    return session;\n  }");
    expect(refresh).not.toContain("return null");
    expect(middleware).not.toContain("if (!refreshed) {");
  });

  it("keeps a session in use alive, seven days from its last use, written at most hourly", () => {
    expect(middleware).toContain("void touchSession(sid);");
    expect(auth).toContain("const TOUCH_EVERY = 60 * 60 * 1000;");
    expect(auth).toContain(".set({ expire: new Date(nowMs + SESSION_TTL) })");
  });
});
