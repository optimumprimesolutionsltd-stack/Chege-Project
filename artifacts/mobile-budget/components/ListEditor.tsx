import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { ListEditor } from '@/hooks/useListEditor';

/**
 * The Edit control for a panel heading, shared by every panel that has one.
 *
 * It used to be a bare 14px pencil in muted grey with no label, which read as
 * decoration next to the heading rather than something to press — people could
 * not tell a list was editable at all. It is now a labelled pill in the accent
 * colour, with a touch target that clears the 44px guideline.
 */
export function EditPill({
  onPress,
  accessibilityLabel,
  testID,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed }) => [
        editPillStyles.pill,
        {
          borderColor: colors.primary + '66',
          backgroundColor: pressed ? colors.primary + '22' : colors.primary + '12',
          borderRadius: colors.radius,
        },
      ]}
    >
      <Feather name="edit-2" size={13} color={colors.primary} />
      <Text style={[editPillStyles.label, { color: colors.primary }]}>Edit</Text>
    </Pressable>
  );
}

const editPillStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 10,
    minHeight: 32,
    paddingVertical: 4,
  },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});

/**
 * The Edit control for a panel heading. Hidden for non-managers.
 *
 * While editing it becomes Cancel instead of disappearing — it used to just
 * vanish, leaving Cancel reachable only from the footer below every row in
 * the list. A long transaction history made that a real scroll, with no way
 * back into ordinary browsing until you found it, so people were quitting
 * the app and reopening it instead.
 */
export function ListEditButton({ editor, canManage }: { editor: ListEditor; canManage: boolean }) {
  const colors = useColors();
  if (!canManage) return null;
  if (editor.editing) {
    return (
      <Pressable
        onPress={editor.cancel}
        disabled={editor.saving}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Stuck in editing? Tap to cancel"
        testID="list-edit-cancel"
        style={({ pressed }) => [
          editPillStyles.pill,
          {
            borderColor: colors.border,
            backgroundColor: pressed ? colors.muted : 'transparent',
            borderRadius: colors.radius,
            opacity: editor.saving ? 0.5 : 1,
          },
        ]}
      >
        <Feather name="x" size={13} color={colors.mutedForeground} />
        <Text style={[editPillStyles.label, { color: colors.mutedForeground }]}>Stuck? Cancel</Text>
      </Pressable>
    );
  }
  return <EditPill onPress={editor.open} accessibilityLabel="Edit this list" testID="list-edit" />;
}

/** A per-row remove toggle. Only rendered in edit mode. */
export function RemoveRowButton({
  editor,
  id,
  disabled,
}: {
  editor: ListEditor;
  id: number;
  disabled?: boolean;
}) {
  const colors = useColors();
  if (!editor.editing) return null;
  const staged = editor.isRemoving(id);
  return (
    <Pressable
      onPress={() => editor.toggleRemoval(id)}
      disabled={disabled}
      hitSlop={8}
      accessibilityLabel={staged ? 'Keep' : 'Remove'}
      testID={`list-remove-${id}`}
    >
      <Feather
        name={staged ? 'rotate-ccw' : 'trash-2'}
        size={15}
        color={disabled ? colors.mutedForeground : staged ? colors.primary : '#ef4444'}
      />
    </Pressable>
  );
}

/**
 * A row's name. Read-only outside edit mode; a tap starts an inline rename in
 * edit mode, and a staged new name shows until Save.
 */
export function EditableName({
  editor,
  id,
  name,
  textStyle,
}: {
  editor: ListEditor;
  id: number;
  name: string;
  textStyle?: object;
}) {
  const colors = useColors();

  if (!editor.editing) {
    return (
      <Text style={textStyle} numberOfLines={1}>
        {name}
      </Text>
    );
  }

  if (editor.editingRow === id) {
    return (
      <View style={styles.renameInline}>
        <TextInput
          autoFocus
          maxLength={120}
          value={editor.rowDraft}
          onChangeText={editor.setRowDraft}
          onSubmitEditing={() => editor.commitRename(id, name)}
          style={[styles.renameInlineInput, { borderColor: colors.border, color: colors.foreground }]}
        />
        <Pressable onPress={() => editor.commitRename(id, name)} hitSlop={8}>
          <Feather name="check" size={16} color={colors.primary} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable onPress={() => editor.startRename(id, name)} style={styles.renameTrigger} hitSlop={6}>
      <Text
        style={[textStyle, editor.isRemoving(id) && { color: colors.mutedForeground, textDecorationLine: 'line-through' }]}
        numberOfLines={1}
      >
        {editor.displayName(id, name)}
      </Text>
      <Feather name="edit-2" size={11} color={colors.mutedForeground} />
    </Pressable>
  );
}

/**
 * The foot of an editable panel: an optional add-a-name row, then Save / Cancel.
 * Pass `addPlaceholder` only for lists that support adding; omit it for
 * bulk-removal-only lists.
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
  const colors = useColors();
  if (!editor.editing) return null;
  return (
    <View style={[styles.footer, { borderColor: colors.border }]}>
      {addPlaceholder ? (
        <View style={styles.addRow}>
          <TextInput
            value={editor.addName}
            onChangeText={editor.setAddName}
            maxLength={120}
            placeholder={addPlaceholder}
            placeholderTextColor={colors.mutedForeground}
            onSubmitEditing={editor.commitAdd}
            style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
          />
          <Pressable onPress={editor.commitAdd} style={[styles.addBtn, { borderColor: colors.border }]}>
            <Feather name="plus" size={16} color={colors.foreground} />
          </Pressable>
        </View>
      ) : null}

      {editor.adds.length > 0 ? (
        <View style={styles.chips}>
          {editor.adds.map((name, index) => (
            <Pressable
              key={`${name}-${index}`}
              onPress={() => editor.dropAdd(index)}
              style={[styles.chip, { borderColor: colors.primary, backgroundColor: `${colors.primary}12` }]}
            >
              <Text style={[styles.chipText, { color: colors.foreground }]}>{name}</Text>
              <Feather name="x" size={12} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {summary ? <Text style={[styles.summary, { color: colors.mutedForeground }]}>{summary}</Text> : null}

      <View style={styles.actions}>
        <Pressable onPress={editor.cancel} disabled={editor.saving} style={styles.cancelBtn}>
          <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => void editor.save()}
          disabled={editor.saving || !editor.dirty}
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: editor.saving || !editor.dirty ? 0.5 : 1 }]}
          testID="list-save"
        >
          {editor.saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : null}
          <Text style={[styles.saveText, { color: colors.primaryForeground }]}>Save changes</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  renameInline: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  renameInlineInput: {
    flex: 1,
    minWidth: 0,
    height: 32,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 8,
    fontSize: 13,
  },
  renameTrigger: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, minWidth: 0 },
  footer: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 10, marginTop: 8 },
  addRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, height: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 10, fontSize: 14 },
  addBtn: { width: 40, height: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  summary: { fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  cancelBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  cancelText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 9, justifyContent: 'center' },
  saveText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
});
