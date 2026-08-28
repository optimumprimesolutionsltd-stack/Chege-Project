type BankWorkspace = {
  isPrivate: boolean;
  role: "owner" | "admin" | "member";
};

type BankAccount = {
  id: number;
};

export function canManageBankAccount(group: BankWorkspace | null | undefined): boolean {
  if (!group) return false;
  return group.isPrivate || group.role === "owner" || group.role === "admin";
}

export function resolveBankAccountSelection(
  accounts: BankAccount[],
  currentId: number | null,
  savedId: number | null,
): number | null {
  if (accounts.some((account) => account.id === currentId)) return currentId;
  if (accounts.some((account) => account.id === savedId)) return savedId;
  return accounts[0]?.id ?? null;
}