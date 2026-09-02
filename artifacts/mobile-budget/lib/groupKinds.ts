import { type GroupKind } from '@workspace/api-client-react';

export type SharedGroupKind = Exclude<GroupKind, 'personal'>;

export const SHARED_GROUP_KINDS: ReadonlyArray<{
  value: SharedGroupKind;
  label: string;
  description: string;
}> = [
  { value: 'family', label: 'Family or household', description: 'For family members or housemates managing money together.' },
  { value: 'chama', label: 'Chama', description: 'For a savings or investment group.' },
  { value: 'club', label: 'Club', description: 'For a club or community group.' },
  { value: 'team', label: 'Team', description: 'For a team sharing costs.' },
  { value: 'student_group', label: 'Student group', description: 'For a study group, class fund, campus association, or student welfare group.' },
  { value: 'other', label: 'Other group', description: 'For any other shared budget.' },
];

export function sharedGroupKindDetails(kind?: GroupKind | null) {
  return SHARED_GROUP_KINDS.find((choice) => choice.value === kind)
    ?? SHARED_GROUP_KINDS.find((choice) => choice.value === 'other')!;
}