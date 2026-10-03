import React, { useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { arrange, EMPTY_ARRANGEMENT, moveItem, moveItemTo, toggleHidden, type Arrangement } from '@/lib/layoutPrefs';

type Item = { id: string; label: string; icon: keyof typeof Feather.glyphMap };

/**
 * Put a list of shortcuts in your own order, and hide the ones you never use.
 * Two ways to move one: hold its grip and drag it where you want it, or step
 * it with the up and down arrows (easier to hit precisely, and to reach with
 * a screen reader). `slots`, when given, says only the first so many shown
 * are used (the quick-action bar holds four).
 */
export function ArrangeSheet({
  visible,
  title,
  hint,
  items,
  arrangement,
  onChange,
  onClose,
  slots,
  testID,
}: {
  visible: boolean;
  title: string;
  hint: string;
  items: readonly Item[];
  arrangement: Arrangement;
  onChange: (next: Arrangement) => void;
  onClose: () => void;
  slots?: number;
  testID?: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const all = arrange(items, arrangement, true);

  // The row being dragged, how far it has moved, and where it would land.
  const [dragging, setDragging] = useState<string | null>(null);
  const [landing, setLanding] = useState<number | null>(null);
  const offset = useRef(new Animated.Value(0)).current;
  const rowHeight = useRef(56);
  // Read inside the responders, which are made once per row id.
  const latest = useRef({ all, arrangement, items, onChange });
  latest.current = { all, arrangement, items, onChange };

  const responders = useMemo(() => {
    const made = new Map<string, ReturnType<typeof PanResponder.create>>();
    for (const item of all) {
      const landingFor = (dy: number) => {
        const from = latest.current.all.findIndex((row) => row.id === item.id);
        const to = from + Math.round(dy / rowHeight.current);
        return Math.max(0, Math.min(latest.current.all.length - 1, to));
      };
      made.set(item.id, PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Keep the drag once it has started, rather than the list scrolling away with it.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          offset.setValue(0);
          setDragging(item.id);
          setLanding(latest.current.all.findIndex((row) => row.id === item.id));
        },
        onPanResponderMove: (_event, gesture) => {
          offset.setValue(gesture.dy);
          setLanding(landingFor(gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          const to = landingFor(gesture.dy);
          const { items: list, arrangement: current, onChange: change } = latest.current;
          change(moveItemTo(list, current, item.id, to));
          offset.setValue(0);
          setDragging(null);
          setLanding(null);
        },
        onPanResponderTerminate: () => {
          offset.setValue(0);
          setDragging(null);
          setLanding(null);
        },
      }));
    }
    return made;
    // One responder per row; the rows' order is read from `latest` when it moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all.map((item) => item.id).join('|')]);

  let shownSoFar = 0;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) + 4 }]} testID={testID}>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint} Hold ≡ and drag to move one, or use the arrows.</Text>
          <ScrollView style={{ flexGrow: 0 }} scrollEnabled={dragging === null}>
            {all.map((item, index) => {
              const hidden = arrangement.hidden.includes(item.id);
              if (!hidden) shownSoFar += 1;
              const outOfSlots = slots != null && !hidden && shownSoFar > slots;
              const isDragged = dragging === item.id;
              const isLanding = dragging !== null && !isDragged && landing === index;
              return (
                <Animated.View
                  key={item.id}
                  onLayout={index === 0 ? (event) => { rowHeight.current = event.nativeEvent.layout.height || 56; } : undefined}
                  style={[
                    styles.row,
                    { borderColor: isLanding ? colors.primary : colors.border, opacity: hidden || outOfSlots ? 0.5 : 1 },
                    isLanding && { borderBottomWidth: 2 },
                    isDragged && { transform: [{ translateY: offset }], zIndex: 10, backgroundColor: colors.muted, borderRadius: 6, elevation: 6 },
                  ]}
                  testID={`arrange-row-${item.id}`}
                >
                  <View
                    {...responders.get(item.id)?.panHandlers}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                    accessibilityLabel={`Drag to move ${item.label}`}
                    testID={`arrange-drag-${item.id}`}
                    style={styles.grip}
                  >
                    <Feather name="menu" size={18} color={isDragged ? colors.primary : colors.mutedForeground} />
                  </View>
                  <Feather name={item.icon} size={18} color={colors.primary} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.label, { color: colors.foreground }]} numberOfLines={1}>{item.label}</Text>
                    {outOfSlots ? <Text style={[styles.small, { color: colors.mutedForeground }]}>Move up to put it in the bar</Text> : null}
                  </View>
                  <Pressable
                    onPress={() => onChange(moveItem(items, arrangement, item.id, -1))}
                    disabled={index === 0}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${item.label} up`}
                    testID={`arrange-up-${item.id}`}
                    style={[styles.iconButton, { borderColor: colors.border, opacity: index === 0 ? 0.3 : 1 }]}
                  >
                    <Feather name="chevron-up" size={18} color={colors.foreground} />
                  </Pressable>
                  <Pressable
                    onPress={() => onChange(moveItem(items, arrangement, item.id, 1))}
                    disabled={index === all.length - 1}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${item.label} down`}
                    testID={`arrange-down-${item.id}`}
                    style={[styles.iconButton, { borderColor: colors.border, opacity: index === all.length - 1 ? 0.3 : 1 }]}
                  >
                    <Feather name="chevron-down" size={18} color={colors.foreground} />
                  </Pressable>
                  <Pressable
                    onPress={() => onChange(toggleHidden(arrangement, item.id))}
                    hitSlop={6}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: !hidden }}
                    accessibilityLabel={`${hidden ? 'Show' : 'Hide'} ${item.label}`}
                    testID={`arrange-toggle-${item.id}`}
                    style={[styles.iconButton, { borderColor: colors.border }]}
                  >
                    <Feather name={hidden ? 'eye-off' : 'eye'} size={17} color={hidden ? colors.mutedForeground : colors.primary} />
                  </Pressable>
                </Animated.View>
              );
            })}
          </ScrollView>
          <View style={styles.foot}>
            <Pressable onPress={() => onChange(EMPTY_ARRANGEMENT)} accessibilityRole="button" testID="arrange-reset" style={styles.reset}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Back to the usual order</Text>
            </Pressable>
            <Pressable onPress={onClose} accessibilityRole="button" testID="arrange-done" style={[styles.done, { backgroundColor: colors.primary }]}>
              <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '82%' },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  hint: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 4, marginBottom: 10, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  grip: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  small: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  iconButton: { width: 34, height: 34, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  reset: { flex: 1, paddingVertical: 12 },
  done: { borderRadius: 8, paddingVertical: 12, paddingHorizontal: 28, alignItems: 'center' },
});
