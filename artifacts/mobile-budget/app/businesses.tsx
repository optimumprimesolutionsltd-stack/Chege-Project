/**
 * My businesses: the businesses you run, named by you (api-server
 * lib/business-streams). "Right now income streams appear under businesses ...
 * add a section I can create business name" (8 Oct 2026). Your pay from a
 * business ("Ujenzi salary") stays an income stream; the business ("Ujenzi")
 * is listed here, and its sales and costs show in the Business report rather
 * than your personal income and spending.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { PageScrollView } from '@/components/PageScrollReset';
import { useBusinesses } from '@/hooks/useBusinesses';

type Stream = { id: number; name: string };

export default function BusinessesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const businesses = useBusinesses();
  const { data: streams = [] } = useQuery<Stream[]>({
    queryKey: ['income-sources', '__group__'],
    queryFn: () => customFetch<Stream[]>('/api/income-sources'),
    staleTime: 30_000,
  });
  const [name, setName] = useState('');
  const [working, setWorking] = useState(false);
  const mine = streams.filter((stream) => businesses.ids.has(stream.id));
  const others = streams.filter((stream) => !businesses.ids.has(stream.id));

  const add = async () => {
    const typed = name.trim();
    if (!typed) return;
    const existing = streams.find((stream) => stream.name.trim().toLowerCase() === typed.toLowerCase());
    setWorking(true);
    try {
      if (existing) await businesses.setBusiness(existing.id, true);
      else await businesses.create(typed);
      setName('');
    } catch (error) {
      Alert.alert('Could not add that business', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  const row = { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 } as const;

  return (
    <PageScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, gap: 16 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" testID="businesses-back">
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20 }}>My businesses</Text>
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 20 }}>
        A business's sales and costs show in the Business report, not in your personal income and spending. What you pay yourself from it - "Ujenzi salary" - stays an income stream.
      </Text>

      <View style={{ gap: 8 }}>
        {mine.length === 0 ? (
          <Text style={{ color: colors.mutedForeground }} testID="businesses-none">None yet.</Text>
        ) : mine.map((stream) => (
          <View key={stream.id} style={row} testID={`business-${stream.id}`}>
            <Feather name="briefcase" size={16} color={colors.primary} />
            <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{stream.name}</Text>
            <Pressable
              onPress={() => Alert.alert(`${stream.name} is not a business?`, 'Its sales and costs count as personal again.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Not a business', style: 'destructive', onPress: () => void businesses.setBusiness(stream.id, false) },
              ])}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`${stream.name} is not a business`}
            >
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput value={name} onChangeText={setName} onSubmitEditing={() => void add()} placeholder="Business name, e.g. Ujenzi" placeholderTextColor={colors.mutedForeground}
            style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground }} testID="businesses-add-input" />
          <Pressable onPress={() => void add()} disabled={!name.trim() || working} accessibilityRole="button" testID="businesses-add"
            style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center', opacity: !name.trim() || working ? 0.5 : 1 }}>
            {working ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold' }}>Add</Text>}
          </Pressable>
        </View>
      </View>

      {others.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }}>Your income streams</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Personal income. If one is really a business, make it one.</Text>
          {others.map((stream) => (
            <View key={stream.id} style={row} testID={`income-stream-${stream.id}`}>
              <Feather name="trending-up" size={16} color={colors.mutedForeground} />
              <Text style={{ flex: 1, color: colors.foreground }}>{stream.name}</Text>
              <Pressable onPress={() => void businesses.setBusiness(stream.id, true)} accessibilityRole="button" testID={`make-business-${stream.id}`}>
                <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Make it a business</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </PageScrollView>
  );
}
