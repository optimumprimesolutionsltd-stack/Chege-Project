import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// "No parent to create": adding a category in the picker had no way to say which
// group it belongs to, or to make a new group.
describe('adding a category in the M-Pesa picker', () => {
  const screen = read('app/mpesa-import.tsx');
  const sheet = screen.slice(screen.indexOf('function CategorySheet'), screen.indexOf('export default function MpesaImportScreen'));

  it('asks which group it goes under, or lets it stand on its own', () => {
    expect(sheet).toContain('Put it under');
    expect(sheet).toContain("name: 'Its own (or a new group)'");
    expect(sheet).toContain('testID="mpesa-category-parents"');
    expect(sheet).toContain('testID={`mpesa-category-parent-${choice.id ?? \'own\'}`}');
  });

  it('sends the chosen group as the parent, and only when one was chosen', () => {
    expect(sheet).toContain('...(newParentId !== null ? { parentId: newParentId } : {}),');
    expect(sheet).toContain('const [newParentId, setNewParentId] = useState<number | null>(null);');
  });

  it('offers only top-level categories as groups, since the app keeps two levels', () => {
    expect(sheet).toContain('categories.filter((row) => !row.parentId && row.name.trim().toLocaleLowerCase() !== \'other\')');
  });

  it('starts each new category on its own again', () => {
    expect(sheet).toContain('setNewParentId(null);\n    onPick(name);');
  });

  it('the day of banking already does the same, so the two agree', () => {
    const day = read('app/bank-day.tsx');
    expect(day).toContain('...(newParentId !== null ? { parentId: newParentId } : {}),');
  });
});
