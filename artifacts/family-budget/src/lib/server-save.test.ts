import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSavePending, markSavePending, pendingSaveJob } from "./import-save-job";
import {
  EarlierSaveRunning,
  followServerSave,
  isFollowingServerSave,
  lookForServerSave,
  saveProgressText,
  serverSaveCounts,
  startServerSave,
} from "./server-save";

const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const noPause = async () => {};

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
});

// Asked 4 Oct 2026: the server-side save the phone got, on the website too -
// so closing the tab no longer stops a save, and every page shows how it is going.
describe("an import saved on the server, from the website", () => {
  it("hands every entry over in one request, with the session cookie", async () => {
    const fetcher = vi.fn(async () => answer(202, { id: 7, status: "running", total: 2, done: 0 }));
    const job = await startServerSave([{ key: 0, built: { kind: "deposit" } }, { key: 3, built: { kind: "disbursement" } }], 11, fetcher as never);
    expect(job?.id).toBe(7);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [path, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/mpesa/import/save-jobs");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({ mpesaAccountId: 11, items: [{ key: 0, built: { kind: "deposit" } }, { key: 3, built: { kind: "disbursement" } }] });
  });

  it("falls back to saving from the page on a server that cannot yet", async () => {
    for (const status of [404, 503]) {
      const fetcher = vi.fn(async () => answer(status, { error: "x" }));
      await expect(startServerSave([{ key: 0, built: {} }], 1, fetcher as never, noPause)).resolves.toBeNull();
    }
  });

  it("never reads an earlier save still going as this one", async () => {
    const fetcher = vi.fn(async () => answer(409, { error: "Your earlier save is still going.", job: { id: 5, status: "running", total: 40, done: 12 } }));
    const failure = await startServerSave([{ key: 0, built: {} }], 1, fetcher as never).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(EarlierSaveRunning);
    expect((failure as Error).message).toContain("12 of 40");
  });

  it("passes on the server's own reason for a refusal", async () => {
    const fetcher = vi.fn(async () => answer(402, { error: "Your trial has ended." }));
    const failure = await startServerSave([{ key: 0, built: {} }], 1, fetcher as never).catch((error: unknown) => error);
    expect((failure as { status: number }).status).toBe(402);
    expect((failure as Error).message).toBe("Your trial has ended.");
  });

  it("asks how far it has got until it is done", async () => {
    const replies = [
      { id: 9, status: "running", total: 3, done: 1 },
      { id: 9, status: "running", total: 3, done: 2 },
      { id: 9, status: "done", total: 3, done: 3, results: [{ key: 0, outcome: "saved", id: 1 }] },
    ];
    const fetcher = vi.fn(async () => answer(200, replies.shift()));
    const seen: number[] = [];
    const following = followServerSave(9, (done) => seen.push(done), { fetcher: fetcher as never, pause: noPause });
    expect(isFollowingServerSave(9)).toBe(true);
    const job = await following;
    expect(seen).toEqual([1, 2, 3]);
    expect(job?.results).toHaveLength(1);
    expect(isFollowingServerSave(9)).toBe(false);
  });

  it("picks up a save still running when Jamvi opens again, without taking it from the import page", async () => {
    const fetcher = vi.fn(async (path: string) =>
      path.endsWith("/current")
        ? answer(200, { job: { id: 4, status: "running", total: 2, done: 1 } })
        : answer(200, { id: 4, status: "done", total: 2, done: 2, results: [{ key: 0, outcome: "saved" }, { key: 1, outcome: "repeat" }] }),
    );
    const shown: unknown[] = [];
    const looking = lookForServerSave((progress) => shown.push(progress), fetcher as never);
    // The bar's following leaves the job for the import page to read back too.
    expect(isFollowingServerSave(4)).toBe(false);
    await looking;
    expect(shown).toEqual([
      { stage: "saving", done: 2, total: 2 },
      { stage: "done", saved: 1, repeats: 1, failed: 0 },
    ]);
  });

  it("stays quiet when nothing is running or nobody is signed in", async () => {
    const shown: unknown[] = [];
    await lookForServerSave((progress) => shown.push(progress), (async () => answer(200, { job: null })) as never);
    await lookForServerSave((progress) => shown.push(progress), (async () => answer(401, { error: "Unauthorized" })) as never);
    expect(shown).toEqual([]);
  });

  it("says how it ended", () => {
    const counts = serverSaveCounts([
      { key: 0, outcome: "saved" },
      { key: 2, outcome: "repeat" },
      { key: 3, outcome: "failed", why: "x" },
      { key: 4, outcome: "lapsed" },
    ]);
    expect(counts).toEqual({ saved: 1, repeats: 1, failed: 2 });
    expect(saveProgressText({ stage: "done", ...counts })).toBe("M-Pesa import done: 1 saved, 1 already recorded, 2 not saved - import again to retry them");
    expect(saveProgressText({ stage: "saving", done: 3, total: 10 })).toBe("Saving M-Pesa entries · 3 of 10");
  });

  it("remembers which server save a closed tab left, so it is followed and not started again", () => {
    markSavePending(3, 21);
    expect(pendingSaveJob(3)).toBe(21);
    expect(pendingSaveJob(4)).toBeNull();
    markSavePending(3);
    expect(pendingSaveJob(3)).toBeNull();
    clearSavePending(3);
    expect(pendingSaveJob(3)).toBeNull();
  });
});

describe("the import page and the bar", () => {
  const page = readFileSync(new URL("../pages/mpesa-import.tsx", import.meta.url), "utf8");
  const bar = readFileSync(new URL("../components/import-saving-bar.tsx", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../components/layout.tsx", import.meta.url), "utf8");

  it("saves on the server, and from the page only when the server cannot", () => {
    expect(page).toContain("await startServerSave(toSave.map(({ item, built }) => ({ key: item.index, built })), accountId)");
    expect(page).toMatch(/\} else if \(!resumeJob\) \{\s*\/\/ A server that cannot save them itself yet/);
  });

  it("follows a save left running when the tab was closed", () => {
    expect(page).toContain("const serverJob = pendingSaveJob(group?.id);");
    expect(page).toContain("void saveAll(true, resumeJob);");
  });

  it("shows the bar on every page, asking whenever the tab comes back", () => {
    expect(layout).toContain("<ImportSavingBar />");
    expect(bar).toContain("void lookForServerSave(setSaveProgressBar);");
    expect(bar).toContain('if (document.visibilityState === "visible") look();');
    expect(bar).toContain('location === "/mpesa-import"');
  });
});
