export type ActivityEditTarget = "expense" | "deposit";

export type ActivityEditItem = {
  id: string;
  date: string;
  editTarget?: ActivityEditTarget;
};

export type ActivityEditLink = {
  href: string;
  label: "Edit expense" | "Edit deposit";
};

export function getActivityEditLink(item: ActivityEditItem): ActivityEditLink | null {
  if (item.editTarget === "expense" && /^expense-\d+$/.test(item.id)) {
    const expenseId = Number(item.id.slice("expense-".length));
    const expenseDate = new Date(item.date);
    const params = new URLSearchParams({
      edit: String(expenseId),
      month: String(expenseDate.getMonth() + 1),
      year: String(expenseDate.getFullYear()),
    });
    return { href: `/expenses?${params.toString()}`, label: "Edit expense" };
  }

  if (item.editTarget === "deposit" && /^contribution-\d+$/.test(item.id)) {
    const depositId = Number(item.id.slice("contribution-".length));
    return { href: `/bank?edit=${depositId}`, label: "Edit deposit" };
  }

  return null;
}