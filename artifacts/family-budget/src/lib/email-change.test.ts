import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { confirmReady } from "./email-change";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("changing the sign-in email on the web", () => {
  it("needs a password only from an account that has none", () => {
    expect(confirmReady("123456", "", false)).toBe(true);
    expect(confirmReady("123456", "", true)).toBe(false);
  });

  it("is offered in Your Account instead of saying it cannot be done", () => {
    const settings = read("../pages/settings.tsx");
    expect(settings).toContain("<ChangeEmail />");
    expect(settings).not.toContain("can’t be changed in Jamvi");
    const component = read("../components/change-email.tsx");
    expect(component).toContain('"/api/auth/change-email/request-code"');
    expect(component).toContain("adoptSession(result.user)");
  });

  it("asks before making someone owner in Jamvi's own dialog, not the browser's", () => {
    const settings = read("../pages/settings.tsx");
    expect(settings).toContain('data-testid="confirm-make-owner"');
    expect(settings).not.toMatch(/if \(!confirm\(\s*`Make \$\{memberName\} the owner/);
  });
});
