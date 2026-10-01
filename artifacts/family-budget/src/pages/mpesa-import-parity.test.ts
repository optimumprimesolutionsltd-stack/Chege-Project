import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { clearSavePending, hasPendingSave, markSavePending, PENDING_SAVE_MAX_AGE_MS } from "@/lib/import-save-job";

const page = readFileSync(new URL("./mpesa-import.tsx", import.meta.url), "utf8");

// "Is web and mobile at par?" - the import's save behaves as on the phone.
describe("saving part of a statement on the web keeps you on it", () => {
  it("shows how the save went on the review while entries are left", () => {
    expect(page).toContain("if (leftToSave > 0) {");
    expect(page).toContain('data-testid="mpesa-last-save"');
  });

  it("marks entries the server already had as recorded", () => {
    expect(page).toContain("// Already on the server: shown as recorded, not left looking unsaved.");
  });

  it("never treats the Save click as a resumed save, so it always asks", () => {
    expect(page).toContain("onClick={() => void saveAll()}");
    expect(page).not.toContain("onClick={saveAll}");
  });
});

describe("a save cut short in the browser is finished next time", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } } },
      configurable: true,
    });
  });

  it("is pending from the start until it finishes, for its workspace", () => {
    markSavePending(3);
    expect(hasPendingSave(3)).toBe(true);
    expect(hasPendingSave(4)).toBe(false);
    clearSavePending(3);
    expect(hasPendingSave(3)).toBe(false);
  });

  it("is not resumed once old", () => {
    markSavePending(3);
    expect(hasPendingSave(3, Date.now() + PENDING_SAVE_MAX_AGE_MS + 1)).toBe(false);
  });

  it("is carried on when the import opens, without asking again", () => {
    expect(page).toContain("if (hasPendingSave(group?.id)) {");
    expect(page).toContain("void saveAll(true);");
  });
});

describe("the import is named for statements on the web", () => {
  it("on the Bank page and the import itself", () => {
    expect(readFileSync(new URL("./bank.tsx", import.meta.url), "utf8")).not.toContain("Paste M-Pesa messages");
    expect(page).toContain('<h1 className="text-2xl font-bold text-foreground">Import M-Pesa</h1>');
  });
});
