import { useCallback, useState } from "react";
import { filterCategoryTree, type CategoryGroup } from "@workspace/category-tree";
import { Search } from "lucide-react";

/**
 * Quick search for a long category list. Native selects cannot host a search
 * field, so the box sits above the select and narrows what the select offers.
 *
 * `visible(selected)` keeps the chosen category in the list even when it does
 * not match what was typed, so the select never silently drops its own value.
 */
export function useCategorySearch(tree: readonly CategoryGroup[]) {
  const [query, setQuery] = useState("");
  const visible = useCallback(
    (selected = ""): CategoryGroup[] => {
      const filtered = filterCategoryTree(tree, query);
      const wanted = selected.trim();
      if (!query.trim() || !wanted) return filtered;
      const present = filtered.some((group) => group.name === wanted || group.children.includes(wanted));
      if (present) return filtered;
      const parent = tree.find((group) => group.name === wanted || group.children.includes(wanted));
      if (!parent) return filtered;
      return [...filtered, parent.name === wanted ? parent : { name: parent.name, children: [wanted] }];
    },
    [tree, query],
  );
  return { query, setQuery, visible };
}

export function CategorySearchInput({
  query,
  onChange,
  testId,
}: {
  query: string;
  onChange: (next: string) => void;
  testId?: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search categories"
        aria-label="Search categories"
        data-testid={testId}
        className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm"
      />
    </div>
  );
}
