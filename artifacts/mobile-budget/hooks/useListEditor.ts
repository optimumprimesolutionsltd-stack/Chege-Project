import { useState } from 'react';
import { Alert, LayoutAnimation } from 'react-native';

/**
 * The shared "edit this list" behaviour for mobile panels.
 *
 * An Edit control on a panel's heading turns the panel editable: each row can
 * be renamed or staged for removal, and — where the caller allows it — new
 * names can be queued. Nothing is written until Save, which the caller wires to
 * whatever API the list needs through the `handlers` argument.
 *
 * A list that only needs bulk removal (bank transactions, activity) simply
 * ignores the rename/add parts and passes a single `remove` handler.
 */
export type ListEditorHandlers = {
  add?: (name: string) => Promise<unknown>;
  rename?: (id: number, name: string) => Promise<unknown>;
  remove?: (id: number) => Promise<unknown>;
  /** Runs once after every staged change applied, e.g. query invalidation. */
  afterSave?: () => Promise<unknown> | unknown;
};

export function useListEditor(handlers: ListEditorHandlers) {
  const [editing, setEditing] = useState(false);
  const [adds, setAdds] = useState<string[]>([]);
  const [addName, setAddName] = useState('');
  const [removals, setRemovals] = useState<Set<number>>(new Set());
  const [renames, setRenames] = useState<Record<number, string>>({});
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [rowDraft, setRowDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const dirty = adds.length > 0 || removals.size > 0 || Object.keys(renames).length > 0;

  const reset = () => {
    setAdds([]);
    setAddName('');
    setRemovals(new Set());
    setRenames({});
    setEditingRow(null);
    setRowDraft('');
  };
  const open = () => {
    reset();
    setEditing(true);
  };
  const cancel = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    reset();
    setEditing(false);
  };

  const startRename = (id: number, current: string) => {
    setEditingRow(id);
    setRowDraft(renames[id] ?? current);
  };
  const cancelRename = () => setEditingRow(null);
  const commitRename = (id: number, original: string) => {
    const name = rowDraft.trim();
    setEditingRow(null);
    setRenames((current) => {
      const next = { ...current };
      if (name && name !== original && name.length <= 120) next[id] = name;
      else delete next[id];
      return next;
    });
  };
  const displayName = (id: number, original: string) => renames[id] ?? original;

  const commitAdd = () => {
    const name = addName.trim();
    if (!name) return;
    if (name.length > 120) {
      Alert.alert('Name too long', 'Use 120 characters or fewer.');
      return;
    }
    setAdds((current) => [...current, name]);
    setAddName('');
  };
  const dropAdd = (index: number) => setAdds((current) => current.filter((_, i) => i !== index));

  const isRemoving = (id: number) => removals.has(id);
  const toggleRemoval = (id: number) =>
    setRemovals((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    if (!dirty) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      if (handlers.add) {
        for (const name of adds) await handlers.add(name);
      }
      if (handlers.rename) {
        for (const [id, name] of Object.entries(renames)) {
          if (removals.has(Number(id))) continue;
          await handlers.rename(Number(id), name);
        }
      }
      if (handlers.remove) {
        for (const id of removals) await handlers.remove(id);
      }
      await handlers.afterSave?.();
      reset();
      setEditing(false);
    } catch (error) {
      Alert.alert(
        'Could not save the changes',
        error instanceof Error ? error.message : 'Some changes may not have applied. Reopen edit to check.',
      );
      await handlers.afterSave?.();
    } finally {
      setSaving(false);
    }
  };

  return {
    editing,
    open,
    cancel,
    dirty,
    saving,
    adds,
    addName,
    setAddName,
    commitAdd,
    dropAdd,
    isRemoving,
    toggleRemoval,
    editingRow,
    rowDraft,
    setRowDraft,
    startRename,
    cancelRename,
    commitRename,
    displayName,
    save,
  };
}

export type ListEditor = ReturnType<typeof useListEditor>;
