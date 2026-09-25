import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The phone and the web read a statement with the same logic, kept as two copies.
// Only the quotes and the import paths differ, so anything else drifting fails here.
const read = (p: string) =>
  readFileSync(p, 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/['"]/g, '"')
    .replace(/\.\/(mpesa-import|mpesaImport)/g, './mpesa')
    .replace(/\.\/(statement-table|statementTable)/g, './statement-table');

describe('statement reading is the same on the phone and the web', () => {
  it('reads the table the same way', () => {
    expect(read('lib/statementTable.ts')).toBe(read('../family-budget/src/lib/statement-table.ts'));
  });
  it('turns rows into review lines the same way', () => {
    expect(read('lib/statementImport.ts')).toBe(read('../family-budget/src/lib/statement-import.ts'));
  });
});
