export function isMemberLimitError(error: unknown): boolean {
  return error instanceof Error
    && /workspace is full|free workspaces hold up to/i.test(error.message);
}

export const MEMBER_LIMIT_PROMPT = {
  title: "Your group is growing",
  description:
    "You’ve reached the free member limit. That’s a great sign—your Shared budget is bringing people together. We’re building paid plans for larger groups so you can keep everyone in one place. Your current members and records are safe.",
};