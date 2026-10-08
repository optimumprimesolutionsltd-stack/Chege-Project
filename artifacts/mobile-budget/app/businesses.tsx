/**
 * My businesses: the businesses you run or handle money for, named by you
 * (api-server lib/business-streams). A business is never an income stream -
 * "remove logic of income streams as businesses to avoid confusion" (8 Oct
 * 2026) - so income streams are not listed here at all. Your pay from a
 * business ("Ujenzi salary") stays an income stream, on Budget.
 *
 * Each business either counts its profit here - a side hustle tracked wholly,
 * with a Business report - or its money only passes through your phone: "this
 * is not the whole of Ujenzi in the app and I wouldn't want to track it here,
 * as I am already drawing a salary from the business" (8 Oct 2026). Either way
 * its money in and out stays out of your personal income and spending.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { PageScrollView } from '@/components/PageScrollReset';
import { useBusinesses } from '@/hooks/useBusinesses';
import { BusinessCostCategories } from '@/components/BusinessCostCategories';

export default function BusinessesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const businesses = useBusinesses();
  const [name, setName] = useState('');
  const [working, setWorking] = useState(false);
  // Its cost categories, ticked several at a time (components/BusinessCostCategories).
  const [costsFor, setCostsFor] = useState<{ id: number; name: string } | null>(null);

  const add = async () => {
    const typed = name.trim();
    if (!typed) return;
    setWorking(true);
    try {
      // A name already used is that business, not a second one (useBusinesses).
      await businesses.create(typed);
      setName('');
    } catch (error) {
      Alert.alert('Could not add that business', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  const setCounts = (id: number, counts: boolean) => {
    void businesses.setCountsProfit(id, counts).catch((error) =>
      Alert.alert('Could not change it', error instanceof Error ? error.message : 'Please try again.'));
  };

  return (
    <PageScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, gap: 16 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" testID="businesses-back">
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20 }}>My businesses</Text>
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 20 }}>
        Money in and out for a business is kept out of your personal income and spending. Your pay from a business - "Ujenzi salary" - is an income stream, set on Budget, not a business.
      </Text>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput value={name} onChangeText={setName} onSubmitEditing={() => void add()} placeholder="Business name, e.g. Dahanak Ventures" placeholderTextColor={colors.mutedForeground}
          style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground }} testID="businesses-add-input" />
        <Pressable onPress={() => void add()} disabled={!name.trim() || working} accessibilityRole="button" testID="businesses-add"
          style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center', opacity: !name.trim() || working ? 0.5 : 1 }}>
          {working ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold' }}>Add</Text>}
        </Pressable>
      </View>

      <View style={{ gap: 8 }}>
        {businesses.list.length === 0 ? (
          <Text style={{ color: colors.mutedForeground }} testID="businesses-none">None yet.</Text>
        ) : businesses.list.map((business) => (
          <View key={business.id} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, gap: 10 }} testID={`business-${business.id}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Feather name="briefcase" size={16} color={colors.primary} />
              <Text style={{ flex: 1, color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{business.name}</Text>
              <Pressable
                onPress={() => Alert.alert(`Remove ${business.name}?`, 'Its money counts as personal again.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => void businesses.setBusiness(business.id, false) },
                ])}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${business.name}`}
              >
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Count its profit</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
                  {business.countsProfit
                    ? 'Tracked wholly here: sales, costs and profit in the Business report.'
                    : 'Its money only passes through your phone. No Business report.'}
                </Text>
              </View>
              <Switch value={business.countsProfit} onValueChange={(on) => setCounts(business.id, on)} testID={`business-counts-profit-${business.id}`} />
            </View>
            <Pressable onPress={() => setCostsFor({ id: business.id, name: business.name })} accessibilityRole="button" testID={`business-cost-categories-${business.id}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="link-2" size={14} color={colors.primary} />
              <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Cost categories</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <BusinessCostCategories business={costsFor} onClose={() => setCostsFor(null)} />
    </PageScrollView>
  );
}
