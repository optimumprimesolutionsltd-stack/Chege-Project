import { describe, expect, it, vi } from "vitest";
import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  leaveMobileSharedWorkspace,
  switchMobileWorkspace,
} from "../workspace";

describe("mobile workspace transitions", () => {
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

  it("returns to My Budget after leaving instead of ending the session", async () => {
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
});