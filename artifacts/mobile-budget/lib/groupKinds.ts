import { type GroupKind } from '@workspace/api-client-react';

export type SharedGroupKind = Exclude<GroupKind, 'personal'>;

export const SHARED_GROUP_KINDS: ReadonlyArray<{
  value: SharedGroupKind;
  label: string;
  description: string;
}> = [
  { value: 'family', label: 'Family or household', description: 'For family members or housemates managing money together.' },
  { value: 'chama', label: 'Chama', description: 'For a savings group, merry-go-round, or investment circle.' },
  { value: 'club', label: 'Club or association', description: 'For a club, society, association, or community group.' },
  { value: 'church', label: 'Church or fellowship', description: 'For a church, fellowship, or ministry collecting offerings and running projects.' },
  { value: 'team', label: 'Team, department, or project', description: 'For a work, sports, department, or project team.' },
  { value: 'student_group', label: 'Student group', description: 'For a study group, class fund, campus association, or student welfare group.' },
  { value: 'other', label: 'Other group', description: 'For any other shared group.' },
];

export function sharedGroupKindDetails(kind?: GroupKind | null) {
  return SHARED_GROUP_KINDS.find((choice) => choice.value === kind)
    ?? SHARED_GROUP_KINDS.find((choice) => choice.value === 'other')!;
}