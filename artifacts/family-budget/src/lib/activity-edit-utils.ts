export type ActivityEditTarget = "expense" | "deposit";

export type ActivityEditItem = {
  id: string;
  date: string | Date;
  editTarget?: ActivityEditTarget;
};

export type ActivityEditLink = {
  href: string;
  label: "Edit expense" | "Edit deposit";
};

export type ActivityRecordTarget = {
  id: number;
  target: ActivityEditTarget;
  editLabel: ActivityEditLink["label"];
  removeLabel: "Remove expense" | "Remove deposit";
};

function recordIdFromActivity(item: ActivityEditItem): ActivityRecordTarget | null {
  if (item.editTarget === "expense") {
    const match = item.id.match(/^expense-(\d+)$/) ?? item.id.match(/^expense-funding-(\d+)(?:-\d+)?$/);
    if (match) {
      return {
        id: Number(match[1]),
        target: "expense",
        editLabel: "Edit expense",
        removeLabel: "Remove expense",
      };
    }
  }

  if (item.editTarget === "deposit") {
    const match = item.id.match(/^contribution-(\d+)$/) ?? item.id.match(/^deposit-contributor-(\d+)(?:-\d+)?$/);
    if (match) {
      return {
        id: Number(match[1]),
        target: "deposit",
        editLabel: "Edit deposit",
        removeLabel: "Remove deposit",
      };
    }
  }

  return null;
}

export function getActivityRecordTarget(item: ActivityEditItem): ActivityRecordTarget | null {
  return recordIdFromActivity(item);
}

export function getActivityEditLink(item: ActivityEditItem): ActivityEditLink | null {
  const record = recordIdFromActivity(item);
  if (!record) return null;

  if (record.target === "expense") {
    const expenseDate = item.date instanceof Date ? item.date : new Date(item.date);
    const params = new URLSearchParams({
      edit: String(record.id),
      month: String(expenseDate.getMonth() + 1),
      year: String(expenseDate.getFullYear()),
    });
    return { href: `/expenses?${params.toString()}`, label: record.editLabel };
  }

  if (record.target === "deposit") {
    return { href: `/bank?edit=${record.id}`, label: record.editLabel };
  }

  return null;
}