import { describe, expect, it } from 'vitest';
import { initialChoices, suggestForSaved, type PreviewLine } from '@/lib/mpesaImport';
import { distinctiveWords, looksLikePerson, wordCategory } from '@/lib/payeeLearning';

// "Did we solve the logic of common words categorization?" (8 Oct 2026).
const paid = (description: string, expenseCategory: string) => ({ type: 'disbursement', description, expenseCategory });
const history = [
  paid('Mary Njeri', 'Food'),
  paid('Mary Atieno', 'Food'),
  paid('Kamau General Agencies', 'Transport'),
  paid('Wanjiru General Shop', 'Transport'),
  paid('Sample Hotel Nakuru', 'Travel'),
  paid('Other Hotel Kisumu', 'Travel'),
];
const categories = ['Food', 'Transport', 'Travel'];
const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: 0, status: 'ready', reason: null, receipt: 'TESTOUT001', direction: 'out', type: 'person_payment', amount: 500,
  description: 'Mary Wachira', named: true, date: '2026-08-29', fee: null, mpesaBalance: 0, alreadyRecorded: null, ...over,
});

describe('common words say nothing about who was paid', () => {
  it('a person is not filed by a first name other people share', () => {
    expect(initialChoices([line({})], history as never, categories)[0].category).toBe('Not sure yet');
    expect(suggestForSaved({ description: 'Mary Wachira', direction: 'out' }, history as never, categories)).toBe('');
  });

  // "If the app has learnt from history about people categorization then its ok."
  it('a person paid before is filed as before', () => {
    expect(initialChoices([line({ description: 'Mary Njeri' })], history as never, categories)[0].category).toBe('Food');
  });

  it('a business with no trigger word goes to Not sure', () => {
    expect(initialChoices([line({ type: 'merchant_payment', description: 'Zawadi Kibanda' })], history as never, categories)[0].category).toBe('Not sure yet');
  });

  it('generic business words are not distinctive', () => {
    expect(distinctiveWords('Kamau General Agencies')).toEqual(['kamau']);
    expect(wordCategory('Otieno General Traders', history as never, categories)).toBe('');
  });

  it('a telling word still works for businesses', () => {
    expect(initialChoices([line({ type: 'paybill_payment', description: 'Lake Hotel Kisumu' })], history as never, categories)[0].category).toBe('Travel');
  });

  it('tells a person from a business by the name', () => {
    expect(looksLikePerson('Mary Wachira')).toBe(true);
    expect(looksLikePerson('Paul Kariuki Mwangi')).toBe(true);
    expect(looksLikePerson('Mary Wachira Hardware')).toBe(false);
    expect(looksLikePerson('Kcb Paybill Ac (7737473)')).toBe(false);
    expect(looksLikePerson('Naivas')).toBe(false);
  });
});
