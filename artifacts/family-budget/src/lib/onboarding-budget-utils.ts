export type IncomeAmount = { name: string; monthlyAmount: number };

export function getKnownIncomeTotal(streams: IncomeAmount[]): number {
  return streams.reduce((total, stream) => total + Math.max(0, Math.round(stream.monthlyAmount || 0)), 0);
}

export function getBudgetIncomeCheck(plannedTotal: number, knownIncomeTotal: number): {
  status: "within-income" | "above-income" | "no-income-provided";
  message: string;
} {
  const planned = Math.max(0, Math.round(plannedTotal));
  const income = Math.max(0, Math.round(knownIncomeTotal));
  if (income === 0) {
    return { status: "no-income-provided", message: `Your planned total is KES ${planned.toLocaleString("en-KE")}. You can approve it without sharing income details.` };
  }
  if (planned > income) {
    return { status: "above-income", message: `Your plan is KES ${(planned - income).toLocaleString("en-KE")} above the known monthly income of KES ${income.toLocaleString("en-KE")}. Reduce the plan or approve it knowingly.` };
  }
  return { status: "within-income", message: `Your plan uses KES ${planned.toLocaleString("en-KE")} of KES ${income.toLocaleString("en-KE")} known monthly income.` };
}
