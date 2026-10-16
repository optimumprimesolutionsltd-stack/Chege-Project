import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { smsAllowedIn, wrongLineWarning, type GroupMpesaSource } from '../groupMpesa';
import { statementHolder } from '../statementTable';

// "My worry is the app importing users mpesa when it may not be what the group is using" (16 Oct 2026).
const source = (value: Partial<GroupMpesaSource>): GroupMpesaSource => ({ source: null, lineNumber: null, treasurerUserId: null, ...value });

describe("whose phone messages may be read into a budget", () => {
  it('a Personal budget: always the person\'s own', () => {
    expect(smsAllowedIn({ isPrivate: true }, null, 'u1')).toBe(true);
  });

  it('a group: never, unless it runs on this person\'s own line', () => {
    expect(smsAllowedIn({ isPrivate: false }, null, 'u1')).toBe(false);
    expect(smsAllowedIn({ isPrivate: false }, source({ source: null }), 'u1')).toBe(false);
    expect(smsAllowedIn({ isPrivate: false }, source({ source: 'paybill', lineNumber: '123456' }), 'u1')).toBe(false);
    expect(smsAllowedIn({ isPrivate: false }, source({ source: 'treasurer_line', treasurerUserId: 'u2' }), 'u1')).toBe(false);
    expect(smsAllowedIn({ isPrivate: false }, source({ source: 'treasurer_line', treasurerUserId: 'u1' }), 'u1')).toBe(true);
  });
});

describe('a statement that is not the group\'s line', () => {
  it('is said when the group uses a Paybill or Till', () => {
    expect(wrongLineWarning('Umoja', source({ source: 'paybill', lineNumber: '123456' }), '254712345678'))
      .toBe("This is a personal M-Pesa statement (0712 *** 678), but Umoja uses its Paybill 123456. Only save what is the group's.");
  });

  it("is said when it is not the treasurer's line, and not when it is", () => {
    expect(wrongLineWarning('Umoja', source({ source: 'treasurer_line', lineNumber: '0722000111' }), '254712345678')).toContain('goes to 0722 *** 111');
    expect(wrongLineWarning('Umoja', source({ source: 'treasurer_line', lineNumber: '0712 345 678' }), '+254712345678')).toBeNull();
  });

  it('says nothing for an unanswered group or a statement with no number', () => {
    expect(wrongLineWarning('Umoja', source({}), '254712345678')).toBeNull();
    expect(wrongLineWarning('Umoja', source({ source: 'paybill' }), null)).toBeNull();
  });
});

describe("a statement's holder", () => {
  it('reads Customer Name and Mobile Number from the first page', () => {
    const page = ['M-PESA STATEMENT', 'Customer Name:', 'JOHN CHEGE KAMAU', 'Mobile Number:', '254712345678', 'Email Address:'].map((str, i) => ({ str, x: 0, y: i * 10, w: 10 }));
    expect(statementHolder([page])).toEqual({ name: 'JOHN CHEGE KAMAU', phone: '254712345678' });
    expect(statementHolder([])).toEqual({ name: null, phone: null });
  });
});

describe('where the guard sits', () => {
  it('Waiting for you counts new messages only where they belong', () => {
    const hook = readFileSync('hooks/useWaitingForYou.ts', 'utf8');
    expect(hook).toContain('const smsHere = smsAllowedIn(group, source, user?.id);');
    expect(hook).toContain('enabled: canReadSms() && smsHere,');
  });

  it("the import offers the phone's messages only where they belong, warns on another line, and asks once", () => {
    const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(screen).toContain('const smsReadable = canReadSms() && smsHere;');
    expect(screen).toContain("|| lines || !smsHere) return;");
    expect(screen).toContain("statementHolder(result.pages).phone");
    expect(screen).toContain('testID="mpesa-wrong-line"');
    expect(screen).toContain('{isShared ? <GroupMpesaQuestion canManage={canManageBudget} /> : null}');
    expect(readFileSync('app/(tabs)/index.tsx', 'utf8')).toContain('{isSharedWorkspace ? <GroupMpesaQuestion canManage={canManageBudget} /> : null}');
  });
});
