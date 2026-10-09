import { describe, expect, it, vi } from "vitest";
import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  budgetChooserCompleteStorageKey,
  completeMobileBudgetChooser,
  hasValidMobileWorkspaceSelection,
  isMobileBudgetChooserComplete,
  leaveMobileSharedWorkspace,
  mobileBudgetEntryRedirect,
  noAnswerFromServer,
  switchMobileWorkspace,
} from "../workspace";

describe("mobile workspace transitions", () => {
  it("scopes chooser completion to the signed-in user and fails closed on storage errors", async () => {
    const storage = {
      getItem: vi.fn(async () => "true"),
      setItem: vi.fn(async () => undefined),
    };

    expect(budgetChooserCompleteStorageKey("person-a")).not.toBe(budgetChooserCompleteStorageKey("person-b"));
    await expect(isMobileBudgetChooserComplete({ userId: "person-a", storage })).resolves.toBe(true);
    await completeMobileBudgetChooser({ userId: "person-a", storage });
    expect(storage.setItem).toHaveBeenCalledWith(budgetChooserCompleteStorageKey("person-a"), "true");

    storage.getItem.mockRejectedValueOnce(new Error("disk unavailable"));
    await expect(isMobileBudgetChooserComplete({ userId: "person-a", storage })).resolves.toBe(false);
  });

  it("forces incomplete users through the chooser but preserves completed deep links", () => {
    expect(mobileBudgetEntryRedirect({ chooserComplete: false, currentRoute: "add-expense" })).toBe("/budget-chooser");
    expect(mobileBudgetEntryRedirect({ chooserComplete: true, currentRoute: "add-expense" })).toBeNull();
    expect(mobileBudgetEntryRedirect({ chooserComplete: true, currentRoute: "(tabs)" })).toBeNull();
    expect(mobileBudgetEntryRedirect({ chooserComplete: true, currentRoute: "login" })).toBe("/(tabs)");
    expect(mobileBudgetEntryRedirect({ chooserComplete: true, currentRoute: "budget-chooser" })).toBe("/(tabs)");
  });

  it("does not persist or render a workspace until the server accepts the selection", async () => {
    const steps: string[] = [];
    const select = vi.fn(async (groupId: number) => {
      steps.push(`select:${groupId}`);
    });
    const storage = {
      setItem: vi.fn(async (key: string, value: string) => {
        steps.push(`store:${key}=${value}`);
      }),
      removeItem: vi.fn(),
    };
    const resetQueries = vi.fn(async () => {
      steps.push("reset");
    });

    await switchMobileWorkspace({ groupId: 42, select, storage, resetQueries });

    expect(steps).toEqual([
      "select:42",
      `store:${ACTIVE_WORKSPACE_STORAGE_KEY}=42`,
      "reset",
    ]);
  });

  it("keeps the current workspace and data when the server rejects a selection", async () => {
    const select = vi.fn(async () => {
      throw new Error("That budget workspace is not available to you.");
    });
    const storage = { setItem: vi.fn(), removeItem: vi.fn() };
    const resetQueries = vi.fn();

    await expect(
      switchMobileWorkspace({ groupId: 999, select, storage, resetQueries }),
    ).rejects.toThrow(/not available/i);

    expect(storage.setItem).not.toHaveBeenCalled();
    expect(resetQueries).not.toHaveBeenCalled();
  });

  it("accepts only a stored workspace that the current membership list verifies", async () => {
    const storage = { getItem: vi.fn(async (): Promise<string | null> => "42") };

    await expect(hasValidMobileWorkspaceSelection({
      storage,
      workspaces: [{ id: 42 }],
    })).resolves.toBe(true);
    await expect(hasValidMobileWorkspaceSelection({
      storage,
      workspaces: [{ id: 7 }],
    })).resolves.toBe(false);

    storage.getItem.mockResolvedValueOnce(null);
    await expect(hasValidMobileWorkspaceSelection({ storage, workspaces: [{ id: 42 }] })).resolves.toBe(false);
  });

  // An update restarts the app; if the workspace list fails to load at that
  // moment (offline, server mid-deploy) the person must not be sent back to the
  // chooser as if they had no workspace.
  it("keeps the stored workspace when the list could not be fetched, but still needs one stored", async () => {
    const storage = { getItem: vi.fn(async (): Promise<string | null> => "42") };
    await expect(hasValidMobileWorkspaceSelection({ storage, workspaces: null })).resolves.toBe(true);
    storage.getItem.mockResolvedValueOnce(null);
    await expect(hasValidMobileWorkspaceSelection({ storage, workspaces: null })).resolves.toBe(false);
    // An empty list that did load still means no workspace.
    await expect(hasValidMobileWorkspaceSelection({ storage, workspaces: [] })).resolves.toBe(false);
  });

  it("the launch check passes 'unknown' rather than an empty list when the fetch failed", async () => {
    const { readFileSync } = await import("node:fs");
    const layout = readFileSync("app/_layout.tsx", "utf8");
    expect(layout).toContain("workspaces: workspacesUnknown ? null : workspaces");
    // Offline, React Query pauses the request instead of failing it: unknown too.
    expect(layout).toContain("const workspacesUnknown = workspaceList === undefined && (workspacesFailed || workspacesPaused);");
  });

  it("offline, Home and the chooser never send a set-up person to make a new budget", async () => {
    const { readFileSync } = await import("node:fs");
    const home = readFileSync("app/(tabs)/index.tsx", "utf8");
    expect(home).toContain("if ((!group && !noAnswerFromServer(summaryFailure)) || refused) {");
    const chooser = readFileSync("app/budget-chooser.tsx", "utf8");
    expect(chooser).toContain("const workspacesUnreachable = workspaceList === undefined && (workspacesPaused || noAnswerFromServer(workspaceError));");
    expect(chooser).toContain("preferencesUnreachable = noAnswerFromServer(reason);");
    // The can't-connect screen comes before onboarding.
    expect(chooser.indexOf("if (unreachable) {")).toBeGreaterThan(-1);
    expect(chooser.indexOf("if (unreachable) {")).toBeLessThan(chooser.indexOf("if (!onboardingComplete) {"));
  });

  it("clears the workspace selection after leaving so the chooser can resolve what remains", async () => {
    const steps: string[] = [];
    const leave = vi.fn(async () => {
      steps.push("leave");
    });
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(async (key: string) => {
        steps.push(`remove:${key}`);
      }),
    };
    const resetQueries = vi.fn(async () => {
      steps.push("reset");
    });

    await leaveMobileSharedWorkspace({ leave, storage, resetQueries });

    expect(steps).toEqual([
      "leave",
      `remove:${ACTIVE_WORKSPACE_STORAGE_KEY}`,
      "reset",
    ]);
  });

  it("tells no connection apart from the server saying there is no budget", () => {
    // fetch failing offline, and anything else without a status.
    expect(noAnswerFromServer(new TypeError("Network request failed"))).toBe(true);
    expect(noAnswerFromServer("timeout")).toBe(true);
    // The server restarting behind Render's proxy, or a Wi-Fi sign-in page.
    expect(noAnswerFromServer({ name: "ApiError", status: 502 })).toBe(true);
    expect(noAnswerFromServer({ name: "ResponseParseError", status: 200 })).toBe(true);
    // A real answer: no budget, or not this person's.
    expect(noAnswerFromServer({ name: "ApiError", status: 404 })).toBe(false);
    expect(noAnswerFromServer({ name: "ApiError", status: 403 })).toBe(false);
    expect(noAnswerFromServer(null)).toBe(false);
    expect(noAnswerFromServer(undefined)).toBe(false);
  });
});
