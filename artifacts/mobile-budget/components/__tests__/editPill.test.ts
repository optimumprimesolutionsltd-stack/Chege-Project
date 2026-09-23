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

  it('still hides for people who cannot manage the list', () => {
    for (const source of [listEditor, contributorEditor]) {
      expect(source).toContain('if (!canManage) return null;');
    }
  });
});

// Edit used to just vanish once pressed, leaving Cancel reachable only from
// the footer below every row — a real scroll on a long list, with no way
// back into ordinary browsing until you found it. People were quitting the
// app and reopening it instead of finding Cancel.
describe('getting back out of edit mode without scrolling to find it', () => {
  // Scoped to the button function itself, not the whole file — both files
  // also have an unrelated onPress={editor.cancel} in their footer's own
  // Cancel button, which would make a plain toContain pass even if the
  // button's own wiring were broken.
  function editButtonBody(source: string): string {
    const start = source.indexOf('function EditListButton') !== -1
      ? source.indexOf('function EditListButton')
      : source.indexOf('function ListEditButton');
    const end = source.indexOf('\n}', start);
    return source.slice(start, end);
  }

  it('turns into Cancel in the same spot, in both copies of the pattern', () => {
    for (const source of [listEditor, contributorEditor]) {
      const body = editButtonBody(source);
      expect(body).toContain('if (editor.editing) {');
      expect(body).toContain('onPress={editor.cancel}');
      expect(body).toContain('>Cancel</Text>');
    }
  });

  it('is still disabled while a save is in flight, so it cannot interrupt one', () => {
    for (const source of [listEditor, contributorEditor]) {
      const body = editButtonBody(source);
      expect(body).toContain('disabled={editor.saving}');
    }
  });
});
