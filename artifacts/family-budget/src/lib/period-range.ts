export type PeriodView = "day" | "week" | "month" | "custom";

export type PeriodRange = {
  startDate: string;
  endDate: string;
};

export function dateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readDateInput(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function addDays(value: string, days: number): string {
  const date = readDateInput(value);
  date.setDate(date.getDate() + days);
  return dateInputValue(date);
}

export function getPeriodRange({
  view,
  anchorDate,
  month,
  year,
  customStartDate,
  customEndDate,
}: {
  view: PeriodView;
  anchorDate: string;
  month: number;
  year: number;
  customStartDate: string;
  customEndDate: string;
}): PeriodRange {
  if (view === "custom") {
    return { startDate: customStartDate, endDate: customEndDate };
  }

  if (view === "month") {
    return {
      startDate: dateInputValue(new Date(year, month - 1, 1)),
      endDate: dateInputValue(new Date(year, month, 0)),
    };
  }

  if (view === "day") {
    return { startDate: anchorDate, endDate: anchorDate };
  }

  const day = readDateInput(anchorDate).getDay();
  const daysSinceMonday = (day + 6) % 7;
  const startDate = addDays(anchorDate, -daysSinceMonday);
  return { startDate, endDate: addDays(startDate, 6) };
}