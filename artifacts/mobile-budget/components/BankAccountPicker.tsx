import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

/**
 * A single bank-account choice, shown one at a time.
 *
 * Listing every account as its own row, all visible at once with only a
 * border colour telling them apart, reads as "these are all in play" rather
 * than "pick one" - which one is actually selected is easy to miss, and the
 * others sit there as noise once it is chosen. This shows only the current
 * choice, with the rest reachable in a picker rather than always on screen.
 */
export function BankAccountPicker({
  accounts,
  selectedAccountId,
  onSelect,
  testIDPrefix,
  placeholder = 'Choose an account',
}: {
  accounts: readonly { id: number; name: string }[];
  selectedAccountId: number | null;
  onSelect: (id: number) => void;
  testIDPrefix: string;
  placeholder?: string;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.field, { borderColor: colors.border, backgroundColor: colors.card }]}
        accessibilityRole="button"
        accessibilityLabel="Choose bank account"
        testID={`${testIDPrefix}-picker`}
      >
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>
          {accounts.find((account) => account.id === selectedAccountId)?.name ?? placeholder}
        </Text>
        <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.foreground }]}>Bank account</Text>
            {accounts.map((account) => {
              const on = account.id === selectedAccountId;
              return (
                <Pressable
                  key={account.id}
                  onPress={() => { onSelect(account.id); setOpen(false); }}
                  style={[styles.row, { borderColor: colors.border }]}
                  testID={`${testIDPrefix}-option-${account.id}`}
                >
                  <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: on ? 'Inter_600SemiBold' : 'Inter_400Regular' }}>
                    {account.name}
                  </Text>
                  {on && <Feather name="check" size={16} color={colors.primary} />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 4 },
  label: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
