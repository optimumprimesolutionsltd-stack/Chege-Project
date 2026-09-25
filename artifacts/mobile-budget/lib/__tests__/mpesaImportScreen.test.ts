import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// "Paste first": copy the M-Pesa messages, paste them, review, save.
describe('the Paste M-Pesa messages screen', () => {
  const screen = read('app/mpesa-import.tsx');

  it('reads the paste through the API and records nothing until Save', () => {
    expect(screen).toContain("'/api/mpesa/import/preview'");
    // Recording happens only inside saveAll, which only runs from the Save button.
    expect(screen.split('createDisbursement(').length - 1).toBeGreaterThanOrEqual(1);
    expect(screen).toContain('onPress={saveAll}');
    expect(screen.slice(0, screen.indexOf('const saveAll'))).not.toContain('await createDeposit(');
  });

  it('will not save a payment without a category the person has seen', () => {
    expect(screen).toContain('problemWith(item, choices[item.index])');
    expect(screen).toContain("Alert.alert('Not quite ready', firstProblem)");
  });

  it('counts a message already recorded as left out, not as a failure', () => {
    expect(screen).toContain('/already recorded/i.test(message)');
    expect(screen).toContain('already recorded, so left out.');
  });

  it('files the M-Pesa charge as its own linked posting, and needs a category for it', () => {
    expect(screen).toContain('chargeForTransactionId: created.id');
    expect(screen).toContain("'Choose a category for the M-Pesa charges.'");
  });

  it('says plainly that the messages are not kept', () => {
    expect(screen).toContain('They are not saved.');
  });

  it('starts on an account called M-Pesa when there is one', () => {
    expect(screen).toContain('/m-?pesa/i.test(account.name)');
  });
});

describe('the screen can be reached', () => {
  it('from the bank actions in the footer', () => {
    const fab = read('components/GlobalFAB.tsx');
    expect(fab).toContain("route: '/mpesa-import'");
    expect(fab).toContain("label: 'Paste M-Pesa'");
  });
  it('from More', () => {
    expect(read('app/(tabs)/more.tsx')).toContain("href: '/mpesa-import'");
  });
});

// The web page follows the same rules with the same logic.
describe('the web page matches the phone', () => {
  const web = read('../family-budget/src/pages/mpesa-import.tsx');
  it('shares the exact import logic', () => {
    expect(read('../family-budget/src/lib/mpesa-import.ts')).toBe(read('lib/mpesaImport.ts').replace(/'/g, '"'));
  });
  it('reads through the API, saves only on Save, and keeps the same safeguards', () => {
    expect(web).toContain('"/api/mpesa/import/preview"');
    expect(web).toContain('onClick={saveAll}');
    expect(web).toContain('problemWith(item, choices[item.index])');
    expect(web).toContain('/already recorded/i.test(message)');
    expect(web).toContain('chargeForTransactionId: created.id');
    expect(web).toContain('They are not saved.');
  });
  it('can be reached from the route table, the menu and the Bank page', () => {
    expect(read('../family-budget/src/App.tsx')).toContain('path="/mpesa-import"');
    expect(read('../family-budget/src/components/layout.tsx')).toContain("href: '/mpesa-import'");
    expect(read('../family-budget/src/pages/bank.tsx')).toContain('data-testid="button-mpesa-import"');
  });
});
