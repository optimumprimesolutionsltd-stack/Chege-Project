import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';

export default function ProfileSetupScreen() {
  const insets = useSafeAreaInsets();
  const { saveDisplayName } = useAuth();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter the name you would like the group to use.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await saveDisplayName(trimmed);
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your name.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <LinearGradient
      colors={['#0a1a10', '#0f2217', '#163020']}
      style={[styles.container, { paddingTop: (Platform.OS === 'web' ? 67 : insets.top) + 28 }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <View style={styles.iconCircle}>
          <Feather name="user" size={32} color="#cf7217" />
        </View>
        <Text style={styles.title}>What should we call you?</Text>
        <Text style={styles.subtitle}>
          This is the name your group will see in Jamvi. Your email stays private and is only used to sign you in.
        </Text>

        <Text style={styles.label}>YOUR NAME</Text>
        <TextInput
          autoFocus
          autoCapitalize="words"
          autoCorrect={false}
          editable={!saving}
          maxLength={40}
          onChangeText={(value) => {
            setName(value);
            if (error) setError('');
          }}
          onSubmitEditing={submit}
          placeholder="e.g. Chege"
          placeholderTextColor="#6f927b"
          returnKeyType="done"
          style={styles.input}
          testID="display-name-input"
          value={name}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          disabled={saving || !name.trim()}
          onPress={submit}
          style={({ pressed }) => [
            styles.button,
            (pressed || saving || !name.trim()) && styles.buttonMuted,
          ]}
          testID="save-display-name"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.buttonText}>Continue</Text>
              <Feather name="arrow-right" size={18} color="#fff" />
            </>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 28 },
  content: { flex: 1, justifyContent: 'center', paddingBottom: 72 },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(207,114,23,0.15)',
    borderColor: 'rgba(207,114,23,0.3)',
    borderRadius: 24,
    borderWidth: 1,
    height: 72,
    justifyContent: 'center',
    marginBottom: 24,
    width: 72,
  },
  title: { color: '#f7faf6', fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -0.5 },
  subtitle: { color: '#8fb19a', fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 24, marginTop: 12 },
  label: { color: '#8fb19a', fontFamily: 'Inter_600SemiBold', fontSize: 12, letterSpacing: 0.8, marginTop: 34, marginBottom: 8 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 14,
    borderWidth: 1,
    color: '#f7faf6',
    fontFamily: 'Inter_400Regular',
    fontSize: 17,
    height: 54,
    paddingHorizontal: 16,
  },
  error: { color: '#fca5a5', fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 8 },
  button: {
    alignItems: 'center',
    backgroundColor: '#2e6b44',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    height: 54,
    justifyContent: 'center',
    marginTop: 24,
  },
  buttonMuted: { opacity: 0.6 },
  buttonText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 16 },
});