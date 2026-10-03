import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { importProgressText, setImportProgress, useImportProgress } from '@/lib/importProgress';

/**
 * A thin bar at the top of every screen while an M-Pesa import saves, and
 * once it is done, so the person can leave the import and still see how it
 * went. The import screen shows its own progress, so the bar stays off there.
 */
export function ImportSavingBar() {
  const progress = useImportProgress();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  if (!progress || pathname === '/mpesa-import') return null;
  const done = progress.stage === 'done';
  const failed = done && progress.failed > 0;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 6 }]}>
      <Pressable
        onPress={() => {
          // Bank shows what was saved.
          if (done) router.push('/(tabs)/bank' as never);
        }}
        accessibilityRole={done ? 'button' : 'text'}
        accessibilityLiveRegion="polite"
        testID="import-saving-bar"
        style={[styles.bar, { backgroundColor: failed ? '#7f1d1d' : '#0B1F2A' }]}
      >
        <Feather name={done ? (failed ? 'alert-circle' : 'check-circle') : 'upload-cloud'} size={15} color="#E9B949" />
        <Text style={styles.text} numberOfLines={2}>{importProgressText(progress)}</Text>
        {done ? (
          <Pressable
            onPress={() => setImportProgress(null)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            testID="import-saving-bar-dismiss"
          >
            <Feather name="x" size={16} color="#f5f0e8" />
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 50 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    maxWidth: 520,
    alignSelf: 'stretch',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  text: { flex: 1, color: '#f5f0e8', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
