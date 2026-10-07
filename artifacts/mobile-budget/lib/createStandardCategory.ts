import { customFetch } from '@workspace/api-client-react';

/**
 * Makes a subcategory where lib/standardCategory placed it: under an existing
 * heading, or under a new heading made first in its tier. Both start with no
 * budget amount - the person sets one when they want to - and the subcategory
 * takes its heading's tier. Gives back the name the server saved it under.
 */
export type NewCategoryPlace =
  | { kind: 'existing'; parentId: number; priority: number }
  | { kind: 'new-heading'; parentName: string; priority: number };

type Created = { id: number; name: string };

const create = (body: Record<string, unknown>) =>
  customFetch<Created>('/api/budget-categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ budgetAmount: 0, isRecurring: true, activeMonth: null, activeYear: null, ...body }),
  });

export async function createInPlace(name: string, place: NewCategoryPlace): Promise<string> {
  const parentId = place.kind === 'existing'
    ? place.parentId
    : (await create({ name: place.parentName.trim(), priority: place.priority, parentId: null })).id;
  const child = await create({ name: name.trim(), priority: place.priority, parentId });
  return child.name;
}
