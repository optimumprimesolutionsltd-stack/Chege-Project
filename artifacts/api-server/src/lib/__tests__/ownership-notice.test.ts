import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, groupsTable: {}, usersTable: {} }));
vi.mock("../email", () => ({ sendEmail: vi.fn() }));
vi.mock("../logger", () => ({ logger: { error: vi.fn() } }));

import { composeOwnershipEmail } from "../ownership-notice";

describe("the email telling someone they now own a group", () => {
  it("names the group and who handed it over, and links to the app", () => {
    const { subject, html } = composeOwnershipEmail({
      newOwnerFirstName: "Wanjiku",
      previousOwnerName: "Chege",
      groupName: "Umoja Chama",
      appUrl: "https://jamvi.co.ke",
    });
    expect(subject).toBe('You now own "Umoja Chama" on Jamvi');
    expect(html).toContain("Hi Wanjiku,");
    expect(html).toContain("Chege has made you the owner of <strong>Umoja Chama</strong>");
    expect(html).toContain("Personal budget");
    expect(html).toContain('href="https://jamvi.co.ke/app/"');
  });

  it("escapes names people typed", () => {
    const { html } = composeOwnershipEmail({
      newOwnerFirstName: null,
      previousOwnerName: "<b>x</b>",
      groupName: "A & B",
      appUrl: null,
    });
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("A &amp; B");
    expect(html).not.toContain("href=");
  });
});
