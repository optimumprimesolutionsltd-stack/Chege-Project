export const ACTIVE_WORKSPACE_STORAGE_KEY = "active_workspace_id";
export const BUDGET_CHOOSER_COMPLETE_STORAGE_PREFIX = "budget_chooser_complete:";

type WorkspaceStorage = {
  getItem?(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

type ResetWorkspaceQueries = () => Promise<unknown> | unknown;

export function budgetChooserCompleteStorageKey(userId: string): string {
  return `${BUDGET_CHOOSER_COMPLETE_STORAGE_PREFIX}${userId}`;
}

export function mobileBudgetEntryRedirect({
  chooserComplete,
  currentRoute,
}: {
  chooserComplete: boolean;
  currentRoute?: string;
}): "/(tabs)" | "/budget-chooser" | null {
  if (!chooserComplete) return "/budget-chooser";
  if (!currentRoute || currentRoute === "login" || currentRoute === "profile-setup" || currentRoute === "budget-chooser") {
    return "/(tabs)";
  }
  return null;
}

/** Storage trouble must never let a person bypass their first workspace choice. */
export async function isMobileBudgetChooserComplete({
  userId,
  storage,
}: {
  userId: string;
  storage: Pick<WorkspaceStorage, "getItem">;
}): Promise<boolean> {
  try {
    return (await storage.getItem?.(budgetChooserCompleteStorageKey(userId))) === "true";
  } catch {
    return false;
  }
}

export async function completeMobileBudgetChooser({
  userId,
  storage,
}: {
  userId: string;
  storage: Pick<WorkspaceStorage, "setItem">;
}): Promise<void> {
  await storage.setItem(budgetChooserCompleteStorageKey(userId), "true");
}

export async function activateMobileWorkspace({
  groupId,
  storage,
  resetQueries,
}: {
  groupId: number;
  storage: WorkspaceStorage;
  resetQueries: ResetWorkspaceQueries;
}): Promise<void> {
  await storage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, String(groupId));
  await resetQueries();
}

/**
 * Persist a workspace only after the server has verified membership. Resetting
 * queries (rather than merely invalidating them) removes old financial data
 * before the newly selected workspace can render.
 */
export async function switchMobileWorkspace({
  groupId,
  select,
  storage,
  resetQueries,
}: {
  groupId: number;
  select(groupId: number): Promise<unknown>;
  storage: WorkspaceStorage;
  resetQueries: ResetWorkspaceQueries;
}): Promise<void> {
  await select(groupId);
  await activateMobileWorkspace({ groupId, storage, resetQueries });
}

/**
 * A person who leaves a shared group still has My Budget. Removing the stale
 * preference lets the next verified request resolve that private workspace.
 */
export async function leaveMobileSharedWorkspace({
  leave,
  storage,
  resetQueries,
}: {
  leave(): Promise<unknown>;
  storage: WorkspaceStorage;
  resetQueries: ResetWorkspaceQueries;
}): Promise<void> {
  await leave();
  await storage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  await resetQueries();
}