import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTIVITY_TYPE } from '../activityTypes';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('transfers and debt events are neither spending nor money in', () => {
  it('has their own types', () => {
    expect(ACTIVITY_TYPE.TRANSFER).toBe('transfer');
    expect(ACTIVITY_TYPE.DEBT).toBe('debt');
  });
  it('signs them by direction and keeps them out of the day\'s deposits total', () => {
    const card = read('components/ActivityCard.tsx');
    expect(card).toContain("const goesOut = isNeutral ? item.direction === 'out' : isExpense;");
    const history = read('app/(tabs)/history.tsx');
    expect(history).toContain('i.type !== ACTIVITY_TYPE.EXPENSE && i.type !== ACTIVITY_TYPE.TRANSFER && i.type !== ACTIVITY_TYPE.DEBT');
  });
});
