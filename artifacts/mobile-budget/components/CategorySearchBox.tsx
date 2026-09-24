import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useColors } from '@/hooks/useColors';

/**
 * A quick search field for a long category list. Pair it with
 * `filterCategoryTree` from @workspace/category-tree.
 */
export function CategorySearchBox({
  value,
  onChange,
  testID,
}: {
  value: string;
  onChange: (next: string) => void;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 12,
        marginTop: 10,
        marginBottom: 4,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderRadius: 10,
        borderColor: colors.border,
        backgroundColor: colors.muted,
      }}
    >
      <Feather name="search" size={15} color={colors.mutedForeground} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search categories"
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        testID={testID}
        style={{ flex: 1, paddingVertical: 8, color: colors.foreground, fontFamily: 'Inter_400Regular' }}
      />
      {value ? (
        <Pressable onPress={() => onChange('')} hitSlop={8} accessibilityLabel="Clear search">
          <Feather name="x" size={15} color={colors.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}
