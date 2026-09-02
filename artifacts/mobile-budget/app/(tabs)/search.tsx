import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { customFetch, useGetGroup } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { WorkspaceIdentityRow } from '@/components/WorkspaceIdentityRow';

type SearchTab = 'all' | 'expenses' | 'bank' | 'goals' | 'income';
type SearchResult = {
  id: number;
  kind: Exclude<SearchTab, 'all'>;
  title: string;
  subtitle: string;
  amount: number;
  date?: string | null;
  direction?: 'in' | 'out';
};
type SearchResponse = { query: string; tab: SearchTab; results: SearchResult[] };

const TABS: Array<{ key: SearchTab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'bank', label: 'Bank' },
  { key: 'goals', label: 'Goals' },
  { key: 'income', label: 'Income' },
];

const destinationFor = (kind: SearchResult['kind']) => {
  if (kind === 'expenses') return '/(tabs)/history';
  if (kind === 'bank') return '/(tabs)/bank';
  if (kind === 'goals') return '/(tabs)/goals';
  return '/(tabs)/budget';
};

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: group } = useGetGroup();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<SearchTab>('all');
  const normalizedQuery = query.trim();
  const search = useQuery<SearchResponse>({
    queryKey: ['workspace-search', group?.id, normalizedQuery, tab],
    queryFn: () => customFetch<SearchResponse>(`/api/search?q=${encodeURIComponent(normalizedQuery)}&tab=${tab}`),
    enabled: normalizedQuery.length >= 2 && Boolean(group?.id),
  });
  const results = useMemo(() => search.data?.results ?? [], [search.data]);
  const submit = () => {
    const value = draft.trim();
    if (value.length >= 2) setQuery(value);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: (Platform.OS === 'web' ? 67 : insets.top) + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <WorkspaceIdentityRow group={group} tone="light" />
        <Text style={[styles.title, { color: colors.foreground }]}>Search</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Find expenses, bank entries, goals, and income sources in this budget.</Text>
        <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submit}
            placeholder="Try “Kids offering” or “rent”"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground }]}
            returnKeyType="search"
            autoCapitalize="none"
            accessibilityLabel="Search this budget"
          />
          {draft ? (
            <Pressable onPress={() => { setDraft(''); setQuery(''); }} hitSlop={8} accessibilityLabel="Clear search">
              <Feather name="x-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.tabs}>
          {TABS.map((item) => {
            const selected = item.key === tab;
            return (
              <Pressable
                key={item.key}
                onPress={() => setTab(item.key)}
                style={[styles.tab, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}16` : colors.card }]}
              >
                <Text style={[styles.tabText, { color: selected ? colors.primary : colors.mutedForeground }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {search.isFetching ? (
        <ActivityIndicator color={colors.primary} size="large" style={styles.loading} />
      ) : search.isError ? (
        <View style={styles.empty}>
          <Feather name="alert-circle" size={34} color={colors.destructive} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Search could not load</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Check your connection and try again.</Text>
        </View>
      ) : normalizedQuery.length < 2 ? (
        <View style={styles.empty}>
          <Feather name="search" size={38} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Search all your ledgers</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Enter at least two letters. Results stay inside the selected budget.</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="inbox" size={38} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No matching records</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Try a description, category, goal, or income-source name.</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 110 }]}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(destinationFor(item.kind))}
              style={[styles.result, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[styles.icon, { backgroundColor: `${colors.primary}14` }]}>
                <Feather name={item.kind === 'expenses' ? 'shopping-bag' : item.kind === 'bank' ? 'credit-card' : item.kind === 'goals' ? 'target' : 'trending-up'} size={18} color={colors.primary} />
              </View>
              <View style={styles.resultCopy}>
                <Text numberOfLines={1} style={[styles.resultTitle, { color: colors.foreground }]}>{item.title}</Text>
                <Text numberOfLines={2} style={[styles.resultSubtitle, { color: colors.mutedForeground }]}>{item.subtitle}{item.date ? ` · ${String(item.date).slice(0, 10)}` : ''}</Text>
              </View>
              <Text numberOfLines={1} style={[styles.amount, { color: item.direction === 'in' ? colors.success : colors.foreground }]}>
                {item.direction === 'in' ? '+' : ''}KES {Number(item.amount).toLocaleString('en-KE')}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  title: { marginTop: 10, fontSize: 25, fontFamily: 'Inter_700Bold' },
  subtitle: { marginTop: 4, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  searchBox: { minHeight: 48, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  tab: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  tabText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  loading: { marginTop: 70 },
  list: { padding: 16, gap: 10 },
  result: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 14, padding: 12 },
  icon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  resultCopy: { flex: 1, minWidth: 0 },
  resultTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  resultSubtitle: { marginTop: 3, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  amount: { maxWidth: 105, fontSize: 12, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 35, paddingBottom: 80 },
  emptyTitle: { marginTop: 14, fontSize: 18, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  emptyText: { marginTop: 6, fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});