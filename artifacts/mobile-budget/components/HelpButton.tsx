/**
 * The way into the guide from the screen you are on.
 *
 * "How do I…" lived in Settings alone, which is where you go when you know
 * what you want — not when you are lost. A question mark on the screen itself
 * is findable at the moment of being stuck, and it carries that screen's name
 * with it so the guide opens already filtered.
 */
import React from 'react';
import { Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

export function HelpButton({ about, color = '#86efac' }: { about: string; color?: string }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/help', params: { about } })}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`How do I, about ${about}`}
      testID={`help-button-${about}`}
    >
      <Feather name="help-circle" size={19} color={color} />
    </Pressable>
  );
}
