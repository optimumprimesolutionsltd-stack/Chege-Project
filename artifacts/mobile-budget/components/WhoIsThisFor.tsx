/**
 * "Who is this for?" on a payment or money in: you, or one of your businesses.
 *
 * "Since the app already recognizes a bank account, it can ask: is it paying
 * for a business (and which one) or just a personal category - then it does
 * the rest", for money received too, and for personal M-Pesa numbers (8 Oct
 * 2026). Bank does the rest after Save (lib/whoIsThisFor): the payee is
 * remembered for that business, and the payee's other entries are offered.
 *
 * Money out for a business picks one of that business's costs - a category
 * linked to it in Reports - or adds one ("Ujenzi - materials") linked to it.
 * Money in for a business is that business's sales: its income stream.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

export type Business = { id: number; name: string };

export function WhoIsThisFor({
  direction,
  businesses,
  businessId,
  onBusiness,
  costs,
  category,
  onCategory,
  onAddCost,
  onAddBusiness,
}: {
  direction: 'in' | 'out';
  businesses: readonly Business[];
  /** Null for Personal. */
  businessId: number | null;
  onBusiness: (id: number | null) => void;
  /** The chosen business's own costs (money out only). */
  costs: readonly string[];
  category: string;
  onCategory: (name: string) => void;
  /** Adds a cost linked to the chosen business, and picks it. */
  onAddCost: (name: string) => Promise<void>;
  /** Adds a business (an income stream), and picks it. */
  onAddBusiness: (name: string) => Promise<void>;
}) {
  const colors = useColors();
  const chosen = businesses.find((one) => one.id === businessId) ?? null;
  const [newCost, setNewCost] = useState('');
  const [newBusiness, setNewBusiness] = useState('');
  const [adding, setAdding] = useState(false);
  const chip = (on: boolean) => ({
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
    borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}22` : colors.muted,
  }) as const;
  const input = { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: colors.foreground } as const;
  const add = async (what: () => Promise<void>) => {
    setAdding(true);
    try { await what(); } finally { setAdding(false); }
  };

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, gap: 8, marginBottom: 12 }} testID="who-is-this-for">
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>Who is this for?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Pressable onPress={() => onBusiness(null)} accessibilityRole="radio" accessibilityState={{ selected: businessId === null }} testID="who-for-personal" style={chip(businessId === null)}>
          <Text style={{ color: businessId === null ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Personal</Text>
        </Pressable>
        {businesses.map((one) => (
          <Pressable key={one.id} onPress={() => onBusiness(one.id)} accessibilityRole="radio" accessibilityState={{ selected: businessId === one.id }} testID={`who-for-business-${one.id}`} style={[chip(businessId === one.id), { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
            <Feather name="briefcase" size={12} color={businessId === one.id ? colors.primary : colors.mutedForeground} />
            <Text style={{ color: businessId === one.id ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{one.name}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput value={newBusiness} onChangeText={setNewBusiness} placeholder="Or a business not listed" placeholderTextColor={colors.mutedForeground} style={input} testID="who-for-new-business" />
        {newBusiness.trim() ? (
          <Pressable onPress={() => void add(async () => { await onAddBusiness(newBusiness.trim()); setNewBusiness(''); })} disabled={adding} accessibilityRole="button" testID="who-for-add-business"
            style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' }}>
            {adding ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold' }}>Add</Text>}
          </Pressable>
        ) : null}
      </View>

      {chosen && direction === 'out' ? (
        <>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
            One of {chosen.name}'s costs - it counts in {chosen.name}'s profit in the Business report.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {costs.map((name) => (
              <Pressable key={name} onPress={() => onCategory(name)} accessibilityRole="radio" accessibilityState={{ selected: category === name }} testID={`who-for-cost-${name}`} style={chip(category === name)}>
                <Text style={{ color: category === name ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{name}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput value={newCost} onChangeText={setNewCost} placeholder={`New cost, e.g. ${chosen.name} - materials`} placeholderTextColor={colors.mutedForeground} style={input} testID="who-for-new-cost" />
            {newCost.trim() ? (
              <Pressable onPress={() => void add(async () => { await onAddCost(newCost.trim()); setNewCost(''); })} disabled={adding} accessibilityRole="button" testID="who-for-add-cost"
                style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' }}>
                {adding ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold' }}>Add</Text>}
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}
      {chosen && direction === 'in' ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 17 }}>
          {chosen.name}'s sales - in the Business report. Money in from this payer goes to {chosen.name} from now on.
        </Text>
      ) : null}
      {chosen ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>After Save, Jamvi remembers this payee for {chosen.name} and offers to do the same for their other entries.</Text>
      ) : null}
    </View>
  );
}
