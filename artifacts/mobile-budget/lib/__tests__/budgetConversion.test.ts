import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  canMakeGroupPersonal,
  canRemovePersonalBudget,
  makePersonalConfirmation,
  makeSharedConfirmation,
  settleAfterConversion,
} from '../budgetConversion';
import { ACTIVE_WORKSPACE_STORAGE_KEY } from '../workspace';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('"Make this my Personal budget" is offered', () => {
  const owner = { userId: 'me', role: 'owner' };
  const shared = { isPrivate: false };

  it('to the owner of a Shared group they are alone in', () => {
    expect(canMakeGroupPersonal({ group: shared, members: [owner], userId: 'me' })).toBe(true);
  });
  it('not while anybody else is in it, a viewer included', () => {
    expect(canMakeGroupPersonal({ group: shared, members: [owner, { userId: 'l', role: 'member' }], userId: 'me' })).toBe(false);
    expect(canMakeGroupPersonal({ group: shared, members: [owner, { userId: 'v', role: 'viewer' }], userId: 'me' })).toBe(false);
  });
  it('not to somebody who is not the owner', () => {
    expect(canMakeGroupPersonal({ group: shared, members: [{ userId: 'me', role: 'admin' }], userId: 'me' })).toBe(false);
  });
  it('not in a Personal budget, or before the group has loaded', () => {
    expect(canMakeGroupPersonal({ group: { isPrivate: true }, members: [owner], userId: 'me' })).toBe(false);
    expect(canMakeGroupPersonal({ group: undefined, members: [owner], userId: 'me' })).toBe(false);
  });
});

describe('"Remove my unused Personal budget" is offered', () => {
  it('only when there is one and nothing is recorded in it', () => {
    expect(canRemovePersonalBudget({ exists: true, empty: true })).toBe(true);
    expect(canRemovePersonalBudget({ exists: true, empty: false })).toBe(false);
    expect(canRemovePersonalBudget({ exists: false, empty: false })).toBe(false);
    expect(canRemovePersonalBudget(undefined)).toBe(false);
  });
});

describe('the confirmations', () => {
  it('turning into a group warns that invitees see everything, past entries included', () => {
    const { message } = makeSharedConfirmation('lydiah and chege');
    expect(message).toContain('Everyone you invite will see everything in this budget, including past entries.');
    expect(message).toContain('create a new one any time');
  });

  it('the swap says what happens to the Personal budget they already have', () => {
    expect(makePersonalConfirmation('lydiah and chege', { exists: false, empty: false }).message)
      .toContain("You don't have a Personal budget now");
    expect(makePersonalConfirmation('lydiah and chege', { exists: true, empty: true }).message)
      .toContain('has nothing recorded in it, so it will be removed');
    expect(makePersonalConfirmation('lydiah and chege', { exists: true, empty: false }).message)
      .toContain('kept as a Shared group called "Old personal budget"');
  });
});

describe('after a conversion or removal', () => {
  function fakes() {
    const calls: string[] = [];
    return {
      calls,
      storage: {
        setItem: vi.fn(async (key: string, value: string) => { calls.push(`set ${key}=${value}`); }),
        removeItem: vi.fn(async (key: string) => { calls.push(`remove ${key}`); }),
      },
      clearPersistedCache: vi.fn(async () => { calls.push('clear persisted'); }),
      resetQueries: vi.fn(async () => { calls.push('reset'); }),
    };
  }

  it('opens the converted budget and drops every cached answer', async () => {
    const f = fakes();
    await settleAfterConversion({ groupId: 12, ...f });
    expect(f.calls).toEqual([`set ${ACTIVE_WORKSPACE_STORAGE_KEY}=12`, 'clear persisted', 'reset']);
  });

  it('forgets a removed budget so the chooser decides', async () => {
    const f = fakes();
    await settleAfterConversion({ groupId: null, ...f });
    expect(f.calls).toEqual([`remove ${ACTIVE_WORKSPACE_STORAGE_KEY}`, 'clear persisted', 'reset']);
  });
});

describe('mobile Settings wiring', () => {
  const settings = read('app/(tabs)/settings.tsx');

  it('reuses the Create a Shared group form in a convert mode', () => {
    expect(settings).toContain("setGroupFormMode('convert');");
    expect(settings).toContain("groupFormMode === 'convert' ? 'Turn into a shared group' : 'Create a Shared group'");
    expect(settings).toContain("'/api/workspaces/personal/make-shared'");
  });

  it('turning into a group needs the subscription, like starting one', () => {
    const open = settings.slice(settings.indexOf('function openConvertToShared'), settings.indexOf('const settleConversion'));
    expect(open).toContain('mayStartGroup(entitlements)');
  });

  it('settles the active budget and caches after every action, then lands on Home or the chooser', () => {
    for (const handler of ['const convertToShared', 'const handleMakePersonal', 'const handleRemovePersonal']) {
      const body = settings.slice(settings.indexOf(handler), settings.indexOf(handler) + 2600);
      expect(body).toContain('settleConversion(');
    }
    expect(settings.slice(settings.indexOf('const convertToShared'))).toContain("router.replace('/(tabs)/')");
    expect(settings.slice(settings.indexOf('const handleMakePersonal'))).toContain("router.replace('/(tabs)/')");
    expect(settings.slice(settings.indexOf('const handleRemovePersonal'))).toContain("router.replace('/budget-chooser')");
  });

  it('shows each option only in its situation', () => {
    expect(settings).toContain('{canMakeGroupPersonal({ group, members, userId: user?.id }) ? (');
    expect(settings).toContain('{canRemovePersonalBudget(personalStatus) ? (');
    const privateBlock = settings.slice(settings.indexOf('{group?.isPrivate ? (\n            <View style={[styles.workspaceInfo'));
    expect(privateBlock.indexOf('testID="convert-personal-to-shared"')).toBeGreaterThan(0);
    expect(privateBlock.indexOf('testID="convert-personal-to-shared"')).toBeLessThan(privateBlock.indexOf(') : null}'));
  });
});

describe('copy', () => {
  it('never calls the Personal budget free: the subscription covers it', () => {
    const chooser = read('app/budget-chooser.tsx');
    expect(chooser).not.toMatch(/free, private/i);
    expect(chooser).not.toContain('PERSONAL BUDGET · FREE');
  });
});
