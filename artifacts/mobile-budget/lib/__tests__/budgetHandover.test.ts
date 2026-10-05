import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  handoverCandidates,
  handoverSteps,
  hasHandedOver,
  mayUseHandover,
  type HandoverInput,
} from '../budgetHandover';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const owner = { userId: 'me', userName: 'Me', role: 'owner' };
const states = (input: HandoverInput) => Object.fromEntries(handoverSteps(input).map((s) => [s.id, s.state]));

describe('the handover guide reads where things stand from the budget itself', () => {
  it('starts at "Turn it into a Shared group" in a Personal budget', () => {
    expect(states({ isPrivate: true, userId: 'me', members: [owner], invitations: [] })).toEqual({
      'make-shared': 'current', invite: 'todo', accept: 'todo', 'make-owner': 'todo', leave: 'todo',
    });
  });

  it('asks for an invitation once it is a group with nobody else in it', () => {
    expect(states({ isPrivate: false, userId: 'me', members: [owner], invitations: [] })).toMatchObject({
      'make-shared': 'done', invite: 'current',
    });
  });

  it('waits on a pending invitation and names who it is waiting for', () => {
    const input = {
      isPrivate: false,
      userId: 'me',
      members: [owner],
      invitations: [{ id: 1, email: 'new@example.com', status: 'pending' }],
    };
    expect(states(input)).toMatchObject({ invite: 'done', accept: 'current' });
    expect(handoverSteps(input).find((s) => s.id === 'accept')?.detail).toContain('new@example.com');
  });

  it('ignores cancelled and expired invitations', () => {
    const input = {
      isPrivate: false,
      userId: 'me',
      members: [owner],
      invitations: [
        { id: 1, email: 'a@example.com', status: 'cancelled' },
        { id: 2, email: 'b@example.com', status: 'expired' },
      ],
    };
    expect(states(input)).toMatchObject({ invite: 'current' });
  });

  it('offers "Make owner" once a member or admin has joined', () => {
    const input = {
      isPrivate: false,
      userId: 'me',
      members: [owner, { userId: 'w', userName: 'Wanjiku', role: 'member' }],
      invitations: [],
    };
    expect(states(input)).toMatchObject({ accept: 'done', 'make-owner': 'current' });
    expect(handoverCandidates(input).map((m) => m.userId)).toEqual(['w']);
  });

  it('never offers a viewer as the new owner', () => {
    const input = {
      isPrivate: false,
      userId: 'me',
      members: [owner, { userId: 'v', role: 'viewer' }],
      invitations: [],
    };
    expect(handoverCandidates(input)).toEqual([]);
    expect(states(input)).toMatchObject({ invite: 'current' });
  });

  it('moves to the optional leave step once someone else owns it', () => {
    const input = {
      isPrivate: false,
      userId: 'me',
      members: [{ userId: 'me', role: 'admin' }, { userId: 'w', role: 'owner' }],
      invitations: [],
    };
    expect(hasHandedOver(input)).toBe(true);
    expect(states(input)).toEqual({
      'make-shared': 'done', invite: 'done', accept: 'done', 'make-owner': 'done', leave: 'current',
    });
  });

  it('is for the owner, or the one who just handed over - not for members', () => {
    expect(mayUseHandover({ isPrivate: true, userId: 'me', members: [owner], invitations: [] })).toBe(true);
    expect(mayUseHandover({ isPrivate: false, userId: 'me', members: [owner], invitations: [] })).toBe(true);
    expect(mayUseHandover({
      isPrivate: false,
      userId: 'me',
      members: [{ userId: 'me', role: 'member' }, { userId: 'o', role: 'owner' }],
      invitations: [],
    })).toBe(false);
  });
});

describe('the handover guide is wired up on the phone and kept at par with the web', () => {
  it('uses the same rules and wording as the web app', () => {
    const body = (p: string) => read(p).replace(/^ \* The same rules and wording as .*$/m, '');
    expect(body('lib/budgetHandover.ts')).toBe(body('../family-budget/src/lib/budget-handover.ts'));
  });

  it('opens from a Personal budget and from a Shared group owner in Settings', () => {
    const settings = read('app/(tabs)/settings.tsx');
    expect(settings).toContain('testID="open-budget-handover"');
    expect(settings).toContain('testID="open-group-handover"');
    expect(settings.match(/router\.push\('\/budget-handover' as never\)/g)).toHaveLength(2);
    expect(read('app/_layout.tsx')).toContain('<Stack.Screen name="budget-handover"');
  });

  it('is what the server points to when a Personal budget refuses transfer', () => {
    expect(read('../api-server/src/routes/members.ts')).toContain('Give this budget to someone else');
    expect(read('app/(tabs)/settings.tsx')).toContain('Give this budget to someone else');
  });
});
