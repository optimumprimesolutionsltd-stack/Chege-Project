/**
 * How do I…
 *
 * A task-oriented index of the app. Not a tour and not a feature list: every
 * entry starts from something somebody wants to do and ends at the button that
 * does it.
 *
 * Answers are collapsed by default so the whole map is visible at once. Being
 * able to see that a thing exists is most of what this screen is for — the
 * complaint that prompted it was not "I cannot use this", it was "I do not
 * know where to go".
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { searchHelp, type HelpTopic } from '@/lib/helpTopics';

function TopicRow({ topic, index }: { topic: HelpTopic; index: number }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.topic, { borderBottomColor: colors.border }]}>
      <Pressable
        onPress={() => setOpen((was) => !was)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={topic.question}
        testID={`help-topic-${index}`}
        style={styles.topicHeader}
        hitSlop={6}
      >
        <Text style={[styles.question, { color: colors.foreground }]}>{topic.question}</Text>
        <Feather
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.mutedForeground}
        />
      </Pressable>
      {open ? (
        <View style={styles.answer} testID={`help-answer-${index}`}>
          {topic.steps.map((step, stepIndex) => (
            <View key={step} style={styles.step}>
              <Text style={[styles.stepNumber, { color: colors.primary }]}>{stepIndex + 1}</Text>
              <Text style={[styles.stepText, { color: colors.mutedForeground }]}>{step}</Text>
            </View>
          ))}
          {topic.route ? (
            <Pressable
              onPress={() => router.push(topic.route as never)}
              accessibilityRole="button"
              testID={`help-go-${index}`}
              style={[styles.goButton, { borderColor: colors.primary }]}
            >
              <Feather name="arrow-right-circle" size={15} color={colors.primary} />
              <Text style={[styles.goText, { color: colors.primary }]}>Take me there</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function HelpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const sections = useMemo(() => searchHelp(query), [query]);
  const found = sections.reduce((count, section) => count + section.topics.length, 0);

  // Numbered across the whole screen rather than per section, so a testID
  // belongs to one row however the list is filtered.
  let rowIndex = -1;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: (Platform.OS === 'web' ? 16 : insets.top) + 12, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="help-back"
        >
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>How do I…</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.muted }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search: savings, statement, subcategory…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            testID="help-search"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} testID="help-search-clear">
              <Feather name="x-circle" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {found === 0 ? (
          <View style={styles.empty} testID="help-no-match">
            <Feather name="help-circle" size={34} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nothing here matches that</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Try a word from the screen you are on. If the thing you want is genuinely missing, it is worth saying so —
              some of this app can only be done on a laptop yet.
            </Text>
          </View>
        ) : (
          sections.map((section) => (
            <View key={section.title} style={{ marginBottom: 22 }}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                {section.title.toUpperCase()}
              </Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {section.topics.map((topic) => {
                  rowIndex += 1;
                  return <TopicRow key={topic.question} topic={topic} index={rowIndex} />;
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular', paddingVertical: 10 },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.6, marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  topic: { borderBottomWidth: StyleSheet.hairlineWidth },
  topicHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  question: { flex: 1, fontSize: 15, fontFamily: 'Inter_600SemiBold', lineHeight: 21 },
  answer: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  step: { flexDirection: 'row', gap: 10 },
  stepNumber: { fontSize: 13, fontFamily: 'Inter_700Bold', minWidth: 14 },
  stepText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  goButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 4,
  },
  goText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  empty: { alignItems: 'center', gap: 10, paddingTop: 48, paddingHorizontal: 12 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
});
