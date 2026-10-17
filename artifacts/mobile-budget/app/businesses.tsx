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
 * as I am already drawing a salary from the business" (8 Oct 2026).
 *
 * A business whose profit counts is asked once whether you pay yourself a
 * salary from it (lib/businessSalary). Yes: your salary is your income, the
 * business's profit stays in its report. No: you live on it, so its profit -
 * sales less costs - is your income, one line on All income. Either way its
 * costs stay out of your household spending.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { PageScrollView } from '@/components/PageScrollReset';
import { useBusinesses } from '@/hooks/useBusinesses';
import { EARNS_FROM_MAX, earnsChoices, earnsHint, earnsKey, earnsWord, sameEarns, type EarnsFrom } from '@/lib/businessEarns';
import { BusinessCostCategories } from '@/components/BusinessCostCategories';
import { salaryAnswers, salaryAnswerHint } from '@/lib/businessSalary';
import { businessSuggestions } from '@/lib/businessSuggestions';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';

export default function BusinessesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const businesses = useBusinesses();
  const [name, setName] = useState('');
  const [working, setWorking] = useState(false);
  // Its cost categories, ticked several at a time (components/BusinessCostCategories).
  const [costsFor, setCostsFor] = useState<{ id: number; name: string } | null>(null);

  // Income streams that may be one of your businesses, made one in a tap
  // (lib/businessSuggestions): "be energy should appear in the list of my
  // businesses" (15 Oct 2026).
  const { data: streams = [] } = useQuery({
    queryKey: ['income-sources', '__group__'],
    queryFn: () => customFetch<Array<{ id: number; name: string }>>('/api/income-sources'),
    staleTime: 60_000,
  });
  const suggestions = businessSuggestions(streams, businesses.list);
  const [making, setMaking] = useState<number | null>(null);
  const makeBusiness = async (id: number) => {
    setMaking(id);
    try {
      await businesses.setBusiness(id, true);
    } catch (error) {
      Alert.alert('Could not add that business', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setMaking(null);
    }
  };

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

  const setSalary = (id: number, pays: boolean) => {
    void businesses.setPaysSalary(id, pays).catch((error) =>
      Alert.alert('Could not change it', error instanceof Error ? error.message : 'Please try again.'));
  };

  // "Other…": the business whose own words are being typed, and the words.
  const [otherFor, setOtherFor] = useState<number | null>(null);
  const [otherText, setOtherText] = useState('');
  const setEarns = (id: number, earnsFrom: EarnsFrom) => {
    void businesses.setEarnsFrom(id, earnsFrom).catch((error) =>
      Alert.alert('Could not change it', error instanceof Error ? error.message : 'Please try again.'));
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
        A business's costs are kept out of your household spending. If you pay yourself a salary from it, the salary is your income; if you live on its profit, its profit is.
      </Text>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput value={name} onChangeText={setName} onSubmitEditing={() => void add()} placeholder="Business name, e.g. Dahanak Ventures" placeholderTextColor={colors.mutedForeground}
          style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground }} testID="businesses-add-input" />
        <Pressable onPress={() => void add()} disabled={!name.trim() || working} accessibilityRole="button" testID="businesses-add"
          style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center', opacity: !name.trim() || working ? 0.5 : 1 }}>
          {working ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold' }}>Add</Text>}
        </Pressable>
      </View>

      {suggestions.length > 0 ? (
        <View style={{ gap: 8 }} testID="businesses-suggestions">
          <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Is one of these your business?</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>Your income streams. Tap one to make it a business - its entries come with it.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {suggestions.map((stream) => (
              <Pressable
                key={stream.id}
                onPress={() => void makeBusiness(stream.id)}
                disabled={making !== null}
                accessibilityRole="button"
                accessibilityLabel={`Make ${stream.name} a business`}
                testID={`businesses-suggestion-${stream.id}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted, opacity: making !== null && making !== stream.id ? 0.5 : 1 }}
              >
                {making === stream.id ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="plus" size={14} color={colors.primary} />}
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{stream.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

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
                    ? `Tracked wholly here: ${earnsWord(business)}, costs and profit in the Business report.`
                    : 'Its money only passes through your phone. No Business report.'}
                </Text>
              </View>
              <Switch value={business.countsProfit} onValueChange={(on) => setCounts(business.id, on)} testID={`business-counts-profit-${business.id}`} />
            </View>
            {/* Sales, rent, or the person's own words, for this business only ("we
                need to have an option to add more..not just sales and rent", 17 Oct 2026). */}
            <View style={{ gap: 6 }} testID={`business-earns-from-${business.id}`}>
              <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>What does it earn from?</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {earnsChoices(businesses.list).map((answer) => {
                  const on = sameEarns(earnsKey(business), answer.earnsFrom);
                  return (
                    <Pressable
                      key={answer.earnsFrom}
                      onPress={() => setEarns(business.id, answer.earnsFrom)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      testID={`business-earns-from-${business.id}-${answer.earnsFrom}`}
                      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted }}
                    >
                      <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{answer.label}</Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => { setOtherFor(otherFor === business.id ? null : business.id); setOtherText(''); }}
                  accessibilityRole="button"
                  testID={`business-earns-from-${business.id}-other`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border }}
                >
                  <Feather name="plus" size={13} color={colors.foreground} />
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Other…</Text>
                </Pressable>
              </View>
              {otherFor === business.id ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    value={otherText}
                    onChangeText={setOtherText}
                    onSubmitEditing={() => { if (otherText.trim()) { setOtherFor(null); setEarns(business.id, otherText.trim()); } }}
                    placeholder="e.g. Commission, Consulting fees"
                    placeholderTextColor={colors.mutedForeground}
                    maxLength={EARNS_FROM_MAX}
                    autoFocus
                    returnKeyType="done"
                    testID={`business-earns-from-${business.id}-other-input`}
                    style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: colors.foreground }}
                  />
                  <Pressable
                    onPress={() => { if (otherText.trim()) { setOtherFor(null); setEarns(business.id, otherText.trim()); } }}
                    disabled={!otherText.trim()}
                    accessibilityRole="button"
                    testID={`business-earns-from-${business.id}-other-save`}
                    style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: otherText.trim() ? colors.primary : colors.muted }}
                  >
                    <Text style={{ color: otherText.trim() ? colors.primaryForeground : colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>Save</Text>
                  </Pressable>
                </View>
              ) : null}
              <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>{earnsHint(business)}</Text>
            </View>
            {/* Every business, profit counted or not: one whose money only passes
                through can still pay you a salary ("optimum and ujenzi dont have
                that part", 15 Oct 2026). */}
            <View style={{ gap: 6 }} testID={`business-pays-salary-${business.id}`}>
                <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>Do you pay yourself a salary from it?</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {salaryAnswers(business).map((answer) => {
                    const on = business.paysSalary === answer.paysSalary;
                    return (
                      <Pressable
                        key={answer.label}
                        onPress={() => setSalary(business.id, answer.paysSalary)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        testID={`business-pays-salary-${business.id}-${answer.paysSalary ? 'yes' : 'no'}`}
                        style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted }}
                      >
                        <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{answer.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>{salaryAnswerHint(business)}</Text>
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
