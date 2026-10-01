import { Input } from "@/components/ui/input";

/**
 * "Put it under" for a category being added in passing: not inside a group,
 * a new group (named here, made first), or an existing group. The same choice
 * the Budget page and Enter a whole day offer, for the forms that had none.
 */
export type GroupChoice = "none" | "new" | `${number}`;

type CategoryLike = { id: number; name: string; parentId?: number | null };

export function CategoryGroupPicker({
  categories,
  value,
  onChange,
  groupName,
  onGroupName,
  disabled = false,
  testId,
}: {
  categories: readonly CategoryLike[];
  value: GroupChoice;
  onChange: (next: GroupChoice) => void;
  groupName: string;
  onGroupName: (next: string) => void;
  disabled?: boolean;
  testId: string;
}) {
  // Only a top-level category can hold others: the app keeps two levels.
  const groups = categories.filter((row) => !row.parentId);
  return (
    <div className="space-y-2">
      <select
        className="flex h-10 w-full rounded-md border border-input bg-card px-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value as GroupChoice)}
        disabled={disabled}
        aria-label="Put it under"
        data-testid={`${testId}-parent`}
      >
        <option value="none">Not inside a group</option>
        <option value="new">+ New group…</option>
        {groups.map((group) => (
          <option key={group.id} value={String(group.id)}>Inside {group.name}</option>
        ))}
      </select>
      {value === "new" ? (
        <Input
          value={groupName}
          onChange={(event) => onGroupName(event.target.value)}
          placeholder="Name the new group, such as Children"
          className="h-10 bg-card"
          disabled={disabled}
          data-testid={`${testId}-group-name`}
        />
      ) : null}
    </div>
  );
}

/**
 * The parent id for the choice, making a new group first when asked. Returns a
 * message instead when it cannot: no name for a new group, or a name that is
 * already a subcategory. An existing top-level category of that name is used.
 */
export async function resolveGroupChoice(
  choice: GroupChoice,
  groupName: string,
  categories: readonly CategoryLike[],
  createGroup: (name: string) => Promise<{ id: number }>,
): Promise<{ parentId: number | null } | { error: string }> {
  if (choice === "none") return { parentId: null };
  if (choice !== "new") return { parentId: Number(choice) };
  const name = groupName.trim();
  if (!name) return { error: "Give the new group a name, such as Children or Household." };
  const same = categories.find((row) => row.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
  if (same?.parentId) return { error: `"${same.name}" is inside another group, so it cannot hold categories. Pick another name.` };
  if (same) return { parentId: same.id };
  return { parentId: (await createGroup(name)).id };
}
