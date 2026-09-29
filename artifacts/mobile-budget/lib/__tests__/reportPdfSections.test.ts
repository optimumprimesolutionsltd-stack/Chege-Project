import { describe, expect, it } from 'vitest';
import { DEFAULT_PDF_SECTIONS, parsePdfSections, pdfSectionParams } from '../reportPdfSections';

// "The PDF download in Reports should allow me to select what I want to download."
describe('what goes in the report PDF', () => {
  it('starts with what the PDF always had, and the long lists off', () => {
    expect(pdfSectionParams(DEFAULT_PDF_SECTIONS, true)).toEqual({
      includeSummary: true, includeBudget: true, includeIncome: true,
      includeBusiness: false, includeExpenses: false, includeIncomeEntries: false, includeDebts: false,
    });
  });

  it('remembers a choice, and fills in anything missing or unreadable', () => {
    expect(parsePdfSections(JSON.stringify({ budget: false, expenses: true, junk: 1 }))).toMatchObject({ budget: false, expenses: true, summary: true });
    expect(parsePdfSections('not json')).toEqual(DEFAULT_PDF_SECTIONS);
    expect(parsePdfSections(null)).toEqual(DEFAULT_PDF_SECTIONS);
  });

  it('never asks for Business without one', () => {
    expect(pdfSectionParams({ ...DEFAULT_PDF_SECTIONS, business: true }, false).includeBusiness).toBe(false);
    expect(pdfSectionParams({ ...DEFAULT_PDF_SECTIONS, business: true }, true).includeBusiness).toBe(true);
  });
});
