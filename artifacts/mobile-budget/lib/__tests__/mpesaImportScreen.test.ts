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
    expect(screen).toContain('savePosting(built, postingApi, accountId)');
    expect(read('lib/savePosting.ts')).toContain('chargeForTransactionId: id');
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
    expect(read('../family-budget/src/lib/mpesa-import.ts')).toBe(read('lib/mpesaImport.ts').replace(/'/g, '"').replace('./mpesaDebts', './mpesa-debts').replace('./payeeLearning', './payee-learning'));
  });
  it('reads through the API, saves only on Save, and keeps the same safeguards', () => {
    expect(web).toContain('"/api/mpesa/import/preview"');
    expect(web).toContain('onClick={saveAll}');
    expect(web).toContain('problemWith(item, choices[item.index])');
    expect(web).toContain('/already recorded/i.test(message)');
    expect(web).toContain('savePosting(built, postingApi, accountId)');
    expect(web).toContain('They are not saved.');
  });
  it('can be reached from the route table, the menu and the Bank page', () => {
    expect(read('../family-budget/src/App.tsx')).toContain('path="/mpesa-import"');
    expect(read('../family-budget/src/components/layout.tsx')).toContain("href: '/mpesa-import'");
    expect(read('../family-budget/src/pages/bank.tsx')).toContain('data-testid="button-mpesa-import"');
  });
});

describe('clearer messages when something needs fixing', () => {
  const phone = read('app/mpesa-import.tsx');
  const web = read('../family-budget/src/pages/mpesa-import.tsx');
  it.each([['phone', phone], ['web', web]])('%s names the line, and the message that was pasted twice reads plainly', (_name, source) => {
    expect(source).toContain('${lineLabel(item)}: ${problem}');
    expect(source).toContain('item.alreadyRecorded.description');
    expect(source).toContain('snippetFor(text, item.receipt)');
    expect(source).not.toContain('Already recorded${item.alreadyRecorded.date ?');
  });
});

describe('the send-this-message button', () => {
  const phone = read('app/mpesa-import.tsx');
  const web = read('../family-budget/src/pages/mpesa-import.tsx');
  const server = read('../api-server/src/routes/mpesa-import.ts');

  it.each([['phone', phone], ['web', web]])('%s shows the text first, opt-in, one message at a time', (_name, source) => {
    expect(source).toContain('redactForReport(message)');
    expect(source).toContain('/api/mpesa/report-format');
    expect(source).toContain('Send this message so Jamvi can learn it');
    expect(source).toContain('Black out any names or other details');
    expect(source).toContain('It is not linked to you');
    expect(source).toContain('testID="mpesa-report-send"'.replace('testID=', source === web ? 'data-testid=' : 'testID='));
  });

  it('is offered on lines that read but named nobody, and on messages that were not saved', () => {
    for (const source of [phone, web]) {
      expect(source.split('{reportLink(item)}').length - 1).toBe(2);
    }
  });

  it('the server relays it with nothing about who sent it', () => {
    expect(server).toContain('"/mpesa/report-format"');
    expect(server).toContain('submittedBy: "mpesa-format-report"');
  });

  it('keeps its message split in step with the server', () => {
    // Line N on the review list must be message N of the paste, so the two
    // apps must cut the paste at exactly the same places.
    const splitOf = (source: string) => source.match(/\.split\((\/.+?\/)\)/)?.[1];
    const serverPattern = splitOf(read('../api-server/src/lib/mpesa-parser/import.ts'));
    expect(serverPattern).toBeTruthy();
    expect(splitOf(read('lib/mpesaImport.ts'))).toBe(serverPattern);
  });
});
