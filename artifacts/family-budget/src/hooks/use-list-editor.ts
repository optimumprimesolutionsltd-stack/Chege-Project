import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

/**
 * The shared "edit this list" behaviour for a panel: an Edit control on the
 * heading turns the panel editable — rows can be renamed or staged for removal,
 * and (where the caller allows it) new names queued — and a Save at the foot
 * applies everything at once through the handlers the caller supplies.
 *
 * A list that only needs bulk removal (bank transactions, activity) passes just
 * a `remove` handler and never renders the add row.
 */
export type ListEditorHandlers = {
  add?: (name: string) => Promise<unknown>;
  rename?: (id: number, name: string) => Promise<unknown>;
  remove?: (id: number) => Promise<unknown>;
  /** Runs once after all staged changes apply (and again on failure), e.g. query invalidation. */
  afterSave?: () => Promise<unknown> | unknown;
  /** Noun for the toast summary, e.g. "account", "category". Defaults to "change". */
  noun?: string;
};

export function useListEditor(handlers: ListEditorHandlers) {
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [adds, setAdds] = useState<string[]>([]);
  const [addName, setAddName] = useState("");
  const [removals, setRemovals] = useState<Set<number>>(new Set());
  const [renames, setRenames] = useState<Record<number, string>>({});
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [rowDraft, setRowDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const dirty = adds.length > 0 || removals.size > 0 || Object.keys(renames).length > 0;

  const reset = () => {
    setAdds([]);
    setAddName("");
    setRemovals(new Set());
    setRenames({});
    setEditingRow(null);
    setRowDraft("");
  };
  const open = () => {
    reset();
    setEditing(true);
  };
  const cancel = () => {
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
      toast({ variant: "destructive", title: "Name too long", description: "Use 120 characters or fewer." });
      return;
    }
    setAdds((current) => [...current, name]);
    setAddName("");
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
      const noun = handlers.noun ?? "change";
      const parts = [
        adds.length ? `${adds.length} added` : "",
        Object.keys(renames).length ? `${Object.keys(renames).length} renamed` : "",
        removals.size ? `${removals.size} removed` : "",
      ].filter(Boolean);
      toast({ title: "Saved", description: parts.length ? `${parts.join(", ")}.` : `${noun} list updated.` });
      reset();
      setEditing(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not save the changes",
        description: error instanceof Error ? error.message : "Some changes may not have applied. Reopen edit to check.",
      });
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
