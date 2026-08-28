import type { GroupKind } from "@workspace/api-client-react";

export type SharedGroupKind = Exclude<GroupKind, "personal">;

export const SHARED_GROUP_KINDS: ReadonlyArray<{
  value: SharedGroupKind;
  label: string;
  description: string;
}> = [
  { value: "family", label: "Family or household", description: "For family members or housemates managing money together." },
  { value: "chama", label: "Chama", description: "For a savings group, merry-go-round, or investment circle." },
  { value: "club", label: "Club or church", description: "For a club, church, association, or community group." },
  { value: "team", label: "Team, department, or project", description: "For a work, sports, department, or project team." },
  { value: "other", label: "Other group", description: "For any other shared goal or group." },
];

export function groupKindPresentation(kind: GroupKind | null | undefined) {
  return SHARED_GROUP_KINDS.find((option) => option.value === kind)
    ?? { value: "other" as const, label: "Other group", description: "For any other shared goal or group." };
}