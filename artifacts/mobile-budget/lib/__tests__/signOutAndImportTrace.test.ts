import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  return {
    data,
    default: {
      getItem: vi.fn(async (key: string) => data.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => { data.set(key, value); }),
      removeItem: vi.fn(async (key: string) => { data.delete(key); }),
    },
  };
});
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage.default }));

import { describeSignOut, readLastSignOut, recordSignOut } from '@/lib/signOutReason';
import { noteImportStep, readUnfinishedImport } from '@/lib/importBreadcrumb';

const read = (path: string) => readFileSync(join(__dirname, '..', '..', path), 'utf8');

describe('why the app signed somebody out', () => {
  it('is recorded and put in plain words', async () => {
    await recordSignOut('server-said-401');
    const record = await readLastSignOut();
    expect(record?.reason).toBe('server-said-401');
    expect(describeSignOut(record!)).toContain('Jamvi did not recognise this sign-in when the app opened');
  });

  it('is recorded at every place the app signs out, and shown on the sign-in screen', () => {
    const auth = read('lib/auth.tsx');
    for (const reason of ['no-token-on-phone', 'server-said-401', 'server-has-no-user', 'you-signed-out']) expect(auth).toContain(`recordSignOut('${reason}')`);
    expect(read('app/_layout.tsx')).toContain("recordSignOut('request-401-confirmed')");
    expect(read('app/login.tsx')).toContain('testID="login-last-sign-out"');
  });

  it('never signs out when the phone would not hand the sign-in over', () => {
    const auth = read('lib/auth.tsx');
    expect(auth).toContain('if (failed) {');
    expect(auth).toContain('setTimeout(() => void fetchUserRef.current(), 3_000);');
  });
});

describe('an import the app was closed in the middle of', () => {
  it('is not reported by the run that is still doing it', async () => {
    noteImportStep('reading page 87 of 133', 'reading');
    await Promise.resolve();
    expect(await readUnfinishedImport()).toBeNull();
  });

  it('is reported once a later run opens the import screen', async () => {
    storage.data.set('jamvi:import-step', JSON.stringify({ step: 'saving 1,240 of 4,585 entries', at: Date.now(), run: 'an-earlier-run' }));
    expect((await readUnfinishedImport())?.step).toBe('saving 1,240 of 4,585 entries');
  });

  it('is shown on the import screen, and the screen does not wipe it before reading it', () => {
    const screen = read('app/mpesa-import.tsx');
    expect(screen).toContain('testID="mpesa-unfinished"');
    expect(screen).toContain('} else if (readThisRun.current && getImportProgress()?.stage !== \'saving\') {');
    expect(read('lib/importProgress.ts')).toContain("if (next?.stage === 'saving') noteImportStep(");
  });
});
