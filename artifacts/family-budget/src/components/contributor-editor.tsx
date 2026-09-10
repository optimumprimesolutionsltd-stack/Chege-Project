import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";

/**
 * The shared "edit this list" pattern: an Edit pencil on a panel's headline
 * turns the panel editable — each row gains a remove control and an add row
 * appears — and a Save changes button at the foot applies everything at once.
 * Nothing is written until Save. Used by "Who has paid" and "Expected vs
 * actual", and meant for any panel that lists the group's contributors.
 */
export function useContributorEditor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const open = () => {
    reset();
    setEditing(true);
  };

  const cancel = () => {
    reset();
    setEditing(false);
  };

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
      for (const name of adds) {
        const response = await fetch("/api/contributors", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!response.ok) throw new Error("add failed");
      }
      for (const [id, name] of Object.entries(renames)) {
        if (removals.has(Number(id))) continue;
        const response = await fetch(`/api/contributors/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!response.ok) throw new Error("rename failed");
      }
      for (const id of removals) {
        const response = await fetch(`/api/contributors/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        });
        if (!response.ok) throw new Error("remove failed");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["contributors"] }),
        queryClient.invalidateQueries({ queryKey: ["contribution-grid"] }),
      ]);
      const parts = [
        adds.length ? `${adds.length} added` : "",
        Object.keys(renames).length ? `${Object.keys(renames).length} renamed` : "",
        removals.size ? `${removals.size} removed` : "",
      ].filter(Boolean);
      toast({ title: "Saved", description: `${parts.join(", ")}.` });
      reset();
      setEditing(false);
    } catch {
      toast({
        variant: "destructive",
        title: "Could not save the changes",
        description: "Some changes may not have been applied. Reopen edit to check.",
      });
      await queryClient.invalidateQueries({ queryKey: ["contributors"] });
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

type Editor = ReturnType<typeof useContributorEditor>;

/** The Edit pencil for a panel headline. Hidden for non-managers. */
export function EditListButton({
  editor,
  label,
  canManage,
}: {
  editor: Editor;
  label: string;
  canManage: boolean;
}) {
  if (!canManage || editor.editing) return null;
  return (
    <button
      type="button"
      onClick={editor.open}
      className="inline-flex items-center gap-1 rounded p-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      aria-label={label}
      data-testid="edit-list"
    >
      <Pencil className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

/**
 * The member's name in a row. Read-only outside edit mode; in edit mode a
 * pencil starts an inline rename, and a staged new name shows until Save.
 */
export function EditableName({ editor, id, name }: { editor: Editor; id: number; name: string }) {
  if (!editor.editing) return <span className="block truncate">{name}</span>;

  if (editor.editingRow === id) {
    return (
      <span className="flex min-w-0 items-center gap-1">
        <Input
          autoFocus
          maxLength={120}
          className="h-8 flex-1"
          value={editor.rowDraft}
          onChange={(event) => editor.setRowDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              editor.commitRename(id, name);
            }
            if (event.key === "Escape") editor.cancelRename();
          }}
          data-testid={`rename-input-${id}`}
        />
        <Button type="button" size="sm" onClick={() => editor.commitRename(id, name)}>OK</Button>
      </span>
    );
  }

  const shown = editor.displayName(id, name);
  return (
    <button
      type="button"
      onClick={() => editor.startRename(id, name)}
      className={`flex min-w-0 items-center gap-1 text-left ${editor.isRemoving(id) ? "text-muted-foreground line-through" : ""}`}
      data-testid={`rename-${id}`}
      aria-label={`Rename ${name}`}
    >
      <span className="truncate">{shown}</span>
      <Pencil className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

/** A per-row remove toggle. Staged rows read as struck-through until Save. */
export function RemoveRowButton({ editor, id, name }: { editor: Editor; id: number; name: string }) {
  if (!editor.editing) return null;
  const staged = editor.isRemoving(id);
  return (
    <button
      type="button"
      onClick={() => editor.toggleRemoval(id)}
      className={`shrink-0 rounded p-1 transition-colors ${
        staged ? "text-primary hover:text-primary" : "text-muted-foreground hover:text-destructive"
      }`}
      aria-label={staged ? `Keep ${name}` : `Remove ${name}`}
      data-testid={`stage-remove-${id}`}
    >
      {staged ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}

/** The add-a-name row plus Save changes / Cancel, shown at the foot of the panel. */
export function ContributorEditorFooter({ editor }: { editor: Editor }) {
  if (!editor.editing) return null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Add a person by name"
          value={editor.addName}
          maxLength={120}
          onChange={(event) => editor.setAddName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              editor.commitAdd();
            }
          }}
          data-testid="add-contributor-name"
        />
        <Button type="button" variant="outline" onClick={editor.commitAdd} className="shrink-0">
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          Add
        </Button>
      </div>

      {editor.adds.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {editor.adds.map((name, index) => (
            <li
              key={`${name}-${index}`}
              className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs text-foreground"
            >
              {name}
              <button
                type="button"
                onClick={() => editor.dropAdd(index)}
                aria-label={`Don't add ${name}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={editor.cancel} disabled={editor.saving}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void editor.save()}
          disabled={editor.saving || !editor.dirty}
          data-testid="save-list-changes"
        >
          {editor.saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Save changes
        </Button>
      </div>
    </div>
  );
}
