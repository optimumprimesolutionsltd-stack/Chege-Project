import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { UNDO_DELETE_MS } from '@/lib/undoDelete';

type Pending = { key: string; label: string; run: () => Promise<void>; timer: ReturnType<typeof setTimeout> };

/**
 * "Deleted - Undo", for bank entries, expenses and budget categories (asked
 * for 3 Oct 2026). A delete is held back for a few seconds: the item leaves
 * the list at once and a bar offers Undo; only when the bar goes does the
 * delete reach the server. Undo cancels it, so nothing has to be rebuilt and
 * every link the entry had - a charge, a debt, a split - is still there.
 *
 * Leaving the screen or the app sends a waiting delete at once rather than
 * losing it.
 */
export function useUndoableDelete() {
  const pending = useRef<Pending[]>([]);
  const [shown, setShown] = useState<Array<{ key: string; label: string }>>([]);

  const sync = () => setShown(pending.current.map(({ key, label }) => ({ key, label })));

  const send = useCallback((key: string) => {
    const item = pending.current.find((entry) => entry.key === key);
    if (!item) return;
    clearTimeout(item.timer);
    pending.current = pending.current.filter((entry) => entry.key !== key);
    sync();
    void item.run();
  }, []);

  /** Hides the item now and deletes it in a few seconds, unless Undo is tapped. */
  const schedule = useCallback((key: string, label: string, run: () => Promise<void>) => {
    if (pending.current.some((entry) => entry.key === key)) return;
    const timer = setTimeout(() => send(key), UNDO_DELETE_MS);
    pending.current = [...pending.current, { key, label, run, timer }];
    sync();
  }, [send]);

  const undo = useCallback((key: string) => {
    const item = pending.current.find((entry) => entry.key === key);
    if (!item) return;
    clearTimeout(item.timer);
    pending.current = pending.current.filter((entry) => entry.key !== key);
    sync();
  }, []);

  // Leaving Jamvi, or this screen, sends what is waiting rather than losing it.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') for (const entry of [...pending.current]) send(entry.key);
    });
    return () => {
      subscription.remove();
      for (const entry of [...pending.current]) send(entry.key);
    };
  }, [send]);

  const isHidden = useCallback((key: string) => shown.some((entry) => entry.key === key), [shown]);

  return { schedule, undo, isHidden, pending: shown };
}

/** The bar itself: the newest waiting delete, with Undo. */
export function UndoDeleteBar({ pending, onUndo }: { pending: Array<{ key: string; label: string }>; onUndo: (key: string) => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const latest = pending[pending.length - 1];
  if (!latest) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + 90 }]}
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.bar, { backgroundColor: colors.foreground }]} testID="undo-delete-bar">
        <Feather name="trash-2" size={16} color={colors.background} />
        <Text style={[styles.text, { color: colors.background }]} numberOfLines={1}>
          Deleted {latest.label}{pending.length > 1 ? ` (+${pending.length - 1} more)` : ''}
        </Text>
        <Pressable onPress={() => onUndo(latest.key)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Undo deleting ${latest.label}`} testID="undo-delete">
          <Text style={[styles.undo, { color: colors.primary }]}>UNDO</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, maxWidth: 520, width: '100%', elevation: 6, shadowOpacity: 0.2, shadowRadius: 8 },
  text: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  undo: { fontFamily: 'Inter_700Bold', fontSize: 14 },
});
