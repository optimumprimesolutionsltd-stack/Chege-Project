import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useColors } from '@/hooks/useColors';
import { MPESA_CARD_KEY, rememberMpesaCard, shouldShowMpesaCard } from '@/lib/mpesaCard';

/**
 * The first thing on Home until it has been used: Jamvi's best trick.
 * Your M-Pesa month, filled in for you, instead of typed in.
 */
export function MpesaImportCard() {
  const colors = useColors();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(MPESA_CARD_KEY)
      .then((stored) => alive && setShow(shouldShowMpesaCard(stored)))
      .catch(() => alive && setShow(true));
    return () => {
      alive = false;
    };
  }, []);

  if (!show) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary }]} testID="mpesa-home-card">
      <View style={styles.top}>
        <View style={[styles.icon, { backgroundColor: colors.muted }]}>
          <Feather name="smartphone" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>START HERE</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Your M-Pesa month, sorted in minutes</Text>
        </View>
      </View>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        Import your M-Pesa statement or paste your messages, and Jamvi fills in what you spent, on what and who paid you.
        A statement is read on this phone and never uploaded.
      </Text>
      <Pressable
        onPress={() => {
          void rememberMpesaCard('done');
          setShow(false);
          router.push('/mpesa-import' as never);
        }}
        accessibilityRole="button"
        style={[styles.primary, { backgroundColor: colors.primary }]}
        testID="mpesa-home-card-open"
      >
        <Text style={styles.primaryText}>Import my M-Pesa</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void rememberMpesaCard('dismissed');
          setShow(false);
        }}
        accessibilityRole="button"
        hitSlop={8}
        style={styles.later}
        testID="mpesa-home-card-later"
      >
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Not now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderRadius: 18, padding: 16, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 17, lineHeight: 22 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  primary: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 },
  later: { alignSelf: 'center', paddingVertical: 2 },
});
