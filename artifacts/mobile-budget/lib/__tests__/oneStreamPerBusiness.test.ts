import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { streamToAsk, withSourceMoved } from '@/lib/combineIncome';
import { asksWhichBusiness, incomeStreamsToCreate, unansweredEarnedBy } from '@/lib/onboarding';

// "dahanak ventures and rental income are one and the same thing. why cant we combine
// them" - "dont fix dahanak or generator..fix the app architecture" - "this problem came
// from onboarding" (11 Oct 2026). One source of money, one income stream.

const draft = (over: Record<string, unknown> = {}) => ({
  usageMode: 'personal',
  runsBusiness: true,
  businessName: 'Dahanak Ventures',
  moreBusinessNames: ['Generator business'],
  businessPay: ['profit', 'profit'],
  selectedIncomeStreams: ['Salary or wages', 'Rental income'],
  incomeEarnedBy: undefined as Record<string, string> | undefined,
  ...over,
}) as unknown as Parameters<typeof incomeStreamsToCreate>[0];

describe('onboarding', () => {
  it('asks which business earns a picked stream - never about a salary - only beside a business', () => {
    expect(asksWhichBusiness('Rental income', draft())).toBe(true);
    expect(asksWhichBusiness('Salary or wages', draft())).toBe(false);
    expect(asksWhichBusiness('Rental income', draft({ runsBusiness: false, businessName: '' }))).toBe(false);
    expect(unansweredEarnedBy(draft())).toBe('Rental income');
    expect(unansweredEarnedBy(draft({ incomeEarnedBy: { 'Rental income': '' } }))).toBeNull();
  });

  it('makes no stream for money a business earns: the business is that money', () => {
    expect(incomeStreamsToCreate(draft({ incomeEarnedBy: { 'Rental income': 'Dahanak Ventures' } }))).toEqual(['Salary or wages']);
    expect(incomeStreamsToCreate(draft({ incomeEarnedBy: { 'Rental income': '' } }))).toEqual(['Salary or wages', 'Rental income']);
  });

  it('the onboarding screen asks it and will not go on without an answer', () => {
    const screen = readFileSync(join(__dirname, '..', '..', 'app', 'budget-chooser.tsx'), 'utf8');
    expect(screen).toContain("const notAnswered = step === 4 ? unansweredEarnedBy(draft) : null;");
    expect(screen).toContain('testID={`onboarding-earned-by-${income}`}');
    expect(readFileSync(join(__dirname, '..', 'onboarding-api.ts'), 'utf8')).toContain('for (const name of incomeStreamsToCreate(draft)) {');
  });
});

describe('a budget set up before it asked', () => {
  const businesses = [{ id: 1, name: 'Dahanak Ventures' }, { id: 2, name: 'Ujenzi Distributors Ltd' }];

  it('asks about each stream once - not a business, not a salary, not plainly the person own', () => {
    const sources = [
      { id: 1, name: 'Dahanak Ventures' },
      { id: 5, name: 'Salary or wages' },
      { id: 6, name: 'Ujenzi Distributors salary' },
      { id: 7, name: 'Rental income' },
      { id: 8, name: 'Generator income' },
    ];
    expect(streamToAsk(sources, businesses, [])).toEqual({ id: 7, name: 'Rental income' });
    expect(streamToAsk(sources, businesses, [7])).toEqual({ id: 8, name: 'Generator income' });
    expect(streamToAsk(sources, businesses, [7, 8])).toBeNull();
    expect(streamToAsk(sources, [], [])).toBeNull();
  });

  it('payers remembered for a combined stream go to the business', () => {
    expect(withSourceMoved({ 'src:tenant': '7', 'src:other': '5', 'grace': 'Donations' }, 7, 1))
      .toEqual({ 'src:tenant': '1', 'src:other': '5', 'grace': 'Donations' });
  });

  it('is asked on Home, for whoever runs the budget', () => {
    const home = readFileSync(join(__dirname, '..', '..', 'app', '(tabs)', 'index.tsx'), 'utf8');
    expect(home).toContain('{canManageBudget ? <View style={{ marginHorizontal: 16 }}><CombineIncomeQuestion /></View> : null}');
  });
});
