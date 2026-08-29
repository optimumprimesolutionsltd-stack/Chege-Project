import { describe, expect, it } from "vitest";
import { isMemberLimitError, MEMBER_LIMIT_PROMPT } from "./member-limit";

describe("member limit prompt", () => {
  it("recognizes the server response used when a seventh member is attempted", () => {
    expect(isMemberLimitError(new Error(
      "This workspace is full. Free workspaces hold up to 6 people.",
    ))).toBe(true);
    expect(MEMBER_LIMIT_PROMPT.title).toBe("Your group is growing");
    expect(MEMBER_LIMIT_PROMPT.description).toMatch(/building paid plans/i);
  });

  it("does not replace unrelated invitation errors", () => {
    expect(isMemberLimitError(new Error("There is already a pending invitation."))).toBe(false);
  });
});