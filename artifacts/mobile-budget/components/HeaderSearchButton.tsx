import React from 'react';
import { Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

/**
 * Search, as an icon in a screen's header. It left the tab bar when the bar was
 * cut to five tabs (lib/tabPlan, 10 Oct 2026); Activity and Budget, where a
 * person most often looks for something, keep it one tap away. Search is also
 * under More.
 */
export function HeaderSearchButton({ color, testID }: { color: string; testID: string }) {
  return (
    <Pressable
      onPress={() => router.push('/(tabs)/search' as never)}
      accessibilityRole="button"
      accessibilityLabel="Search"
      hitSlop={10}
      testID={testID}
    >
      <Feather name="search" size={20} color={color} />
    </Pressable>
  );
}
