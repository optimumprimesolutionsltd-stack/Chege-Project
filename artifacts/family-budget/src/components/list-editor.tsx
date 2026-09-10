import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Lock, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import type { ListEditor } from "@/hooks/use-list-editor";

/** The Edit pencil for a panel heading. Hidden for non-managers and while editing. */
export function ListEditButton({
  editor,
  canManage,
  label = "Edit this list",
}: {
  editor: ListEditor;
  canManage: boolean;
  label?: string;
}) {
  if (!canManage || editor.editing) return null;
  return (
    <button
      type="button"
      onClick={editor.open}
      className="inline-flex items-center gap-1 rounded p-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      aria-label={label}
      data-testid="list-edit"
    >
      <Pencil className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

/** A per-row remove toggle. Staged rows read as struck-through until Save. */
export function RemoveRowButton({
  editor,
  id,
  name,
  disabled,
}: {
  editor: ListEditor;
  id: number;
  name: string;
  disabled?: boolean;
}) {
  if (!editor.editing) return null;
  if (disabled) {
    return <Lock className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-label={`${name} cannot be removed`} />;
  }
  const staged = editor.isRemoving(id);
  return (
    <button
      type="button"
      onClick={() => editor.toggleRemoval(id)}
      className={`shrink-0 rounded p-1 transition-colors ${
        staged ? "text-primary hover:text-primary" : "text-muted-foreground hover:text-destructive"
      }`}
      aria-label={staged ? `Keep ${name}` : `Remove ${name}`}
      data-testid={`list-stage-remove-${id}`}
    >
      {staged ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}

/**
 * A row's name. Read-only outside edit mode; in edit mode a pencil starts an
 * inline rename, and a staged new name shows until Save. Pass `renamable={false}`
 * for a list that only supports bulk removal.
 */
export function EditableName({
  editor,
  id,
  name,
  className = "",
  renamable = true,
}: {
  editor: ListEditor;
  id: number;
  name: string;
  className?: string;
  renamable?: boolean;
}) {
  if (!editor.editing || !renamable) {
    return <span className={`${editor.isRemoving(id) ? "text-muted-foreground line-through" : ""} ${className}`}>{name}</span>;
  }

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
          data-testid={`list-rename-input-${id}`}
        />
        <Button type="button" size="sm" onClick={() => editor.commitRename(id, name)}>
          OK
        </Button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => editor.startRename(id, name)}
      className={`flex min-w-0 items-center gap-1 text-left ${editor.isRemoving(id) ? "text-muted-foreground line-through" : ""} ${className}`}
      data-testid={`list-rename-${id}`}
      aria-label={`Rename ${name}`}
    >
      <span className="truncate">{editor.displayName(id, name)}</span>
      <Pencil className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

/**
 * The foot of an editable panel: an optional add-a-name row, an optional
 * summary line, then Save changes / Cancel. Pass `addPlaceholder` only for
 * lists that support adding.
 */
export function ListEditorFooter({
  editor,
  addPlaceholder,
  summary,
}: {
  editor: ListEditor;
  addPlaceholder?: string;
  summary?: string;
}) {
  if (!editor.editing) return null;
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
      {addPlaceholder ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder={addPlaceholder}
            value={editor.addName}
            maxLength={120}
            onChange={(event) => editor.setAddName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                editor.commitAdd();
              }
            }}
            data-testid="list-add-name"
          />
          <Button type="button" variant="outline" onClick={editor.commitAdd} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Add
          </Button>
        </div>
      ) : null}

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

      {summary ? <p className="text-xs leading-relaxed text-muted-foreground">{summary}</p> : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={editor.cancel} disabled={editor.saving}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void editor.save()}
          disabled={editor.saving || !editor.dirty}
          data-testid="list-save-changes"
        >
          {editor.saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Save changes
        </Button>
      </div>
    </div>
  );
}
