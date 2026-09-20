import { describe, expect, it } from 'vitest';
import { evaluateAmountExpression, isAmountExpression } from '../amountExpression';

// A day's spending arrives as several receipts that make one posting. Working
// that out meant leaving the app for a calculator and coming back with a
// number, losing the sitting on the way.
describe('an amount field that does arithmetic', () => {
  it('adds up a handful of receipts', () => {
    expect(evaluateAmountExpression('1200+800+450')).toBe(2450);
  });

  it('respects the thousands separators people type', () => {
    expect(evaluateAmountExpression('1,200+800')).toBe(2000);
    expect(evaluateAmountExpression('12,500')).toBe(12500);
  });

  it('multiplies, for four of the same thing', () => {
    expect(evaluateAmountExpression('4*450')).toBe(1800);
    expect(evaluateAmountExpression('4x450')).toBe(1800);
    expect(evaluateAmountExpression('4×450')).toBe(1800);
  });

  it('divides, and refuses to divide by zero', () => {
    expect(evaluateAmountExpression('3000/4')).toBe(750);
    expect(evaluateAmountExpression('3000÷4')).toBe(750);
    // Infinity would pass a later "greater than zero" check and be sent as an
    // amount.
    expect(evaluateAmountExpression('3000/0')).toBeNull();
  });

  it('subtracts between two numbers but knows no negative amount', () => {
    expect(evaluateAmountExpression('5000-1100')).toBe(3900);
    // Refusing it here is clearer than accepting it and rejecting it a step
    // later, and an amount is never negative.
    expect(evaluateAmountExpression('-500')).toBeNull();
  });

  it('gives multiplication precedence, and brackets precedence over that', () => {
    expect(evaluateAmountExpression('1000+2*300')).toBe(1600);
    expect(evaluateAmountExpression('(1000+200)*2')).toBe(2400);
  });

  it('rounds to the two places money has', () => {
    // Binary floating point makes 0.1 + 0.2 otherwise.
    expect(evaluateAmountExpression('0.1+0.2')).toBe(0.3);
    expect(evaluateAmountExpression('1000/3')).toBe(333.33);
  });

  it('says nothing while the expression is still half-typed', () => {
    // Which is most of the time somebody is typing one.
    for (const partial of ['', '1200+', '(1200', '1200*', '+', '()']) {
      expect(evaluateAmountExpression(partial)).toBeNull();
    }
  });

  it('refuses text that merely begins with a number', () => {
    // "12ab" parses a 12 and stops; treating that as 12 would silently drop
    // what the person typed.
    expect(evaluateAmountExpression('12ab')).toBeNull();
    expect(evaluateAmountExpression('1200 shopping')).toBeNull();
  });

  it('still reads a plain number as itself', () => {
    expect(evaluateAmountExpression('5000')).toBe(5000);
    expect(evaluateAmountExpression('5000.50')).toBe(5000.5);
  });
});

describe('knowing when to show the working', () => {
  it('calls arithmetic arithmetic', () => {
    expect(isAmountExpression('1200+800')).toBe(true);
    expect(isAmountExpression('(1000+200)*2')).toBe(true);
  });

  it('leaves a plain number alone', () => {
    // No point showing "= 5,000" under a field that says 5000.
    expect(isAmountExpression('5000')).toBe(false);
    expect(isAmountExpression('1,200')).toBe(false);
  });

  it('stays quiet on something that does not resolve', () => {
    expect(isAmountExpression('1200+')).toBe(false);
  });
});
