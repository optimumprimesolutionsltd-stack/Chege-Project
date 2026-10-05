import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';

/**
 * "Signed in as … · Not you? Sign in with another account", on the screens a
 * new account starts on (the name, the setup questions, choosing a budget).
 *
 * Signing in with another account than the usual one - a different Google
 * email, say - makes a new, empty account, and these screens had no way back
 * out of it (5 Oct 2026). This signs out, and the sign-in screen follows.
 */
/** Asks, then signs out and opens the sign-in screen. Nothing is deleted. */
function useSwitchAccount() {
  const { user, logout } = useAuth();
  const [leaving, setLeaving] = useState(false);
  const signOut = () => {
    Alert.alert(
      'Sign in with another account?',
      `${user?.email ? `You are signed in as ${user.email}. ` : ''}Jamvi signs you out of it here, and you can sign in the way you usually do. Nothing is deleted.`,
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Sign out',
          onPress: async () => {
            setLeaving(true);
            try {
              await logout();
              router.replace('/login' as never);
            } finally {
              setLeaving(false);
            }
          },
        },
      ],
    );
  };
  return { user, leaving, signOut };
}

/**
 * "← Back" on the first screen of a new account's setup, where there is no
 * earlier step: back is the sign-in screen. "There should be a go back sign
 * here and everywhere else with continue/next" (5 Oct 2026).
 */
export function BackToSignIn({ color, testID = 'back-to-sign-in' }: { color: string; testID?: string }) {
  const { leaving, signOut } = useSwitchAccount();
  return (
    <Pressable onPress={signOut} disabled={leaving} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back to sign in" testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, alignSelf: 'flex-start' }}>
      <Feather name="chevron-left" size={20} color={color} />
      <Text style={{ color, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>{leaving ? 'Signing out…' : 'Back'}</Text>
    </Pressable>
  );
}

export function SwitchAccountLink({ color, testID = 'switch-account' }: { color: string; testID?: string }) {
  const { user, leaving, signOut } = useSwitchAccount();

  return (
    <View style={{ alignItems: 'center', gap: 2, paddingVertical: 10 }}>
      <Text style={{ color, fontSize: 12, fontFamily: 'Inter_400Regular' }} numberOfLines={1}>
        {user?.email ? `Signed in as ${user.email}` : 'This account has no email'}
      </Text>
      <Pressable onPress={signOut} disabled={leaving} hitSlop={10} accessibilityRole="button" testID={testID}>
        <Text style={{ color, fontSize: 13, fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' }}>
          {leaving ? 'Signing out…' : 'Not you? Sign in with another account'}
        </Text>
      </Pressable>
    </View>
  );
}
