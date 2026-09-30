/**
 * The parts of the Reports PDF a person can choose, and what each asks the
 * server for. Budget, income streams and the summary were always in it and
 * stay on by default; the lists are long, so they start off.
 */
export type PdfSectionKey = 'summary' | 'budget' | 'income' | 'business' | 'expenses' | 'incomeEntries' | 'debts';

export const PDF_SECTIONS: ReadonlyArray<{ key: PdfSectionKey; label: string; hint: string }> = [
  { key: 'summary', label: 'Summary', hint: 'Budget, spent, what is left, number of expenses' },
  { key: 'budget', label: 'Budget performance', hint: 'Each category: budget, spent, left or over' },
  { key: 'income', label: 'Income streams', hint: 'What each income stream brought in' },
  { key: 'business', label: 'Business', hint: 'Profit and loss for each business' },
  { key: 'expenses', label: 'Every expense', hint: 'The full list, as on All expenses' },
  { key: 'incomeEntries', label: 'Every piece of income', hint: 'The full list, as on All income' },
  { key: 'debts', label: 'Who owes who', hint: 'As it stands today' },
];

export const DEFAULT_PDF_SECTIONS: Record<PdfSectionKey, boolean> = {
  summary: true,
  budget: true,
  income: true,
  business: false,
  expenses: false,
  incomeEntries: false,
  debts: false,
};

/** The saved choice, or the defaults for anything missing or unreadable. */
export function parsePdfSections(raw: string | null): Record<PdfSectionKey, boolean> {
  if (!raw) return DEFAULT_PDF_SECTIONS;
  try {
    const saved = JSON.parse(raw) as Partial<Record<PdfSectionKey, unknown>>;
    const next = { ...DEFAULT_PDF_SECTIONS };
    for (const { key } of PDF_SECTIONS) if (typeof saved[key] === 'boolean') next[key] = saved[key] as boolean;
    return next;
  } catch {
    return DEFAULT_PDF_SECTIONS;
  }
}

/** The report's query for a choice. Business is only offered, and asked for, when there is one. */
export function pdfSectionParams(sections: Record<PdfSectionKey, boolean>, hasBusiness: boolean) {
  return {
    includeSummary: sections.summary,
    includeBudget: sections.budget,
    includeIncome: sections.income,
    includeBusiness: hasBusiness && sections.business,
    includeExpenses: sections.expenses,
    includeIncomeEntries: sections.incomeEntries,
    includeDebts: sections.debts,
  };
}
