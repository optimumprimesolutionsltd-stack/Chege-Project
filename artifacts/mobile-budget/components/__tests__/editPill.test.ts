import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const listEditor = readFileSync('components/ListEditor.tsx', 'utf8');
const contributorEditor = readFileSync('components/ContributorEditor.tsx', 'utf8');

// The Edit control on every panel heading was a bare 14px pencil in muted
// grey, with no label. It read as decoration rather than something to press,
// and on Expected vs actual nobody could find it at all.
describe('the panel Edit control', () => {
  it('is a labelled pill, not a bare icon', () => {
    expect(listEditor).toContain('export function EditPill');
    expect(listEditor).toContain('>Edit</Text>');
    expect(listEditor).toContain('borderWidth: 1');
  });

  it('draws in the accent colour rather than muted grey', () => {
    const pill = listEditor.slice(listEditor.indexOf('export function EditPill'), listEditor.indexOf('const editPillStyles'));
    expect(pill).toContain('color={colors.primary}');
    expect(pill).not.toContain('colors.mutedForeground');
  });

  it('clears a usable touch target', () => {
    expect(listEditor).toContain('minHeight: 32');
    expect(listEditor).toContain('hitSlop={8}');
  });

  it('is the same control on the contributions cards, not a second treatment', () => {
    expect(contributorEditor).toContain("import { EditPill } from '@/components/ListEditor';");
    expect(contributorEditor).toContain('<EditPill');
    // No hand-rolled pencil left behind in either file.
    expect(contributorEditor).not.toContain('<Feather name="edit-2" size={14} color={colors.mutedForeground} />');
    expect(listEditor).not.toContain('<Feather name="edit-2" size={14} color={colors.mutedForeground} />');
  });

  it('still hides for people who cannot manage the list, and while editing', () => {
    for (const source of [listEditor, contributorEditor]) {
      expect(source).toContain('if (!canManage || editor.editing) return null;');
    }
  });
});
