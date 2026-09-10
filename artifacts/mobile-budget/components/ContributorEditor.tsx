import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

/**
 * The shared "edit this list" pattern for mobile: an Edit pencil on a panel's
 * heading turns the panel editable — each member row gains a remove toggle and
 * an add row appears — and Save changes at the foot applies everything at once.
 * Nothing is written until Save.
 */
export function useContributorEditor() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [adds, setAdds] = useState<string[]>([]);
  const [addName, setAddName] = useState('');
  const [removals, setRemovals] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const dirty = adds.length > 0 || removals.size > 0;

  const reset = () => {
    setAdds([]);
    setAddName('');
    setRemovals(new Set());
  };
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
      Alert.alert('Name too long', 'Use 120 characters or fewer.');
      return;
    }
    setAdds((c) => [...c, name]);
    setAddName('');
  };
  const dropAdd = (index: number) => setAdds((c) => c.filter((_, i) => i !== index));
  const isRemoving = (id: number) => removals.has(id);
  const toggleRemoval = (id: number) =>
    setRemovals((c) => {
      const next = new Set(c);
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
        await customFetch('/api/contributors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
      }
      for (const id of removals) {
        await customFetch(`/api/contributors/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: true }),
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contributors'] }),
        queryClient.invalidateQueries({ queryKey: ['contribution-grid'] }),
      ]);
      reset();
      setEditing(false);
    } catch (error) {
      Alert.alert('Could not save the changes', error instanceof Error ? error.message : 'Some changes may not have applied.');
      await queryClient.invalidateQueries({ queryKey: ['contributors'] });
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
    save,
  };
}

type Editor = ReturnType<typeof useContributorEditor>;

export function EditListButton({ editor, canManage }: { editor: Editor; canManage: boolean }) {
  const colors = useColors();
  if (!canManage || editor.editing) return null;
  return (
    <Pressable onPress={editor.open} hitSlop={8} accessibilityLabel="Add or remove people">
      <Feather name="edit-2" size={14} color={colors.mutedForeground} />
    </Pressable>
  );
}

export function RemoveRowButton({ editor, id }: { editor: Editor; id: number }) {
  const colors = useColors();
  if (!editor.editing) return null;
  const staged = editor.isRemoving(id);
  return (
    <Pressable onPress={() => editor.toggleRemoval(id)} hitSlop={8} accessibilityLabel={staged ? 'Keep' : 'Remove'}>
      <Feather name={staged ? 'rotate-ccw' : 'trash-2'} size={15} color={staged ? colors.primary : '#ef4444'} />
    </Pressable>
  );
}

export function ContributorEditorFooter({ editor }: { editor: Editor }) {
  const colors = useColors();
  if (!editor.editing) return null;
  return (
    <View style={[styles.footer, { borderColor: colors.border }]}>
      <View style={styles.addRow}>
        <TextInput
          value={editor.addName}
          onChangeText={editor.setAddName}
          maxLength={120}
          placeholder="Add a person by name"
          placeholderTextColor={colors.mutedForeground}
          onSubmitEditing={editor.commitAdd}
          style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
        />
        <Pressable onPress={editor.commitAdd} style={[styles.addBtn, { borderColor: colors.border }]}>
          <Feather name="plus" size={16} color={colors.foreground} />
        </Pressable>
      </View>

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

      <View style={styles.actions}>
        <Pressable onPress={editor.cancel} disabled={editor.saving} style={styles.cancelBtn}>
          <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => void editor.save()}
          disabled={editor.saving || !editor.dirty}
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: editor.saving || !editor.dirty ? 0.5 : 1 }]}
        >
          {editor.saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : null}
          <Text style={[styles.saveText, { color: colors.primaryForeground }]}>Save changes</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 10, marginTop: 8 },
  addRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, height: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 10, fontSize: 14 },
  addBtn: { width: 40, height: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  cancelBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  cancelText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 9, justifyContent: 'center' },
  saveText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
});
