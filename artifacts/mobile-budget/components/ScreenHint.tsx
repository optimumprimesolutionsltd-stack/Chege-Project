import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { useColors } from '@/hooks/useColors';

/**
 * One plain sentence under a screen's title saying what the screen is for, so
 * nobody has to guess. `light` is for the coloured headers.
 */
export function ScreenHint({ children, light = false }: { children: string; light?: boolean }) {
  const colors = useColors();
  return (
    <Text style={[styles.hint, { color: light ? 'rgba(255,255,255,0.78)' : colors.mutedForeground }]} testID="screen-hint">
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2, marginBottom: 4 },
});
