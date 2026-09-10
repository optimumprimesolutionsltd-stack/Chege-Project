import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { BrandLogo } from '@/components/BrandLogo';

const NAVY = '#011C4E';
const GOLD = '#FDBB0A';

/**
 * The screen shown while the app is still working out where to send you.
 *
 * It carries the Jamvi mark and slogan so a slow launch reads as "opening",
 * not "stuck on a blank blue screen". Optimistic auth + a warm query cache
 * mean returning users rarely see it for more than a frame.
 */
export function AppLoading({ message }: { message?: string }) {
  return (
    <View style={styles.root}>
      <BrandLogo compact style={styles.mark} />
      <Text style={styles.slogan}>Pesa yetu, wazi</Text>
      <ActivityIndicator size="small" color={GOLD} style={styles.spinner} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NAVY,
    padding: 32,
  },
  mark: {
    width: 96,
    height: 96,
  },
  slogan: {
    marginTop: 16,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.3,
  },
  spinner: {
    marginTop: 28,
  },
  message: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
