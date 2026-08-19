/**
 * UpdatePrompt — shown when a new OTA update is ready.
 *
 * Slides up from the bottom of the screen. Shows the update message from
 * `eas update --message "..."` (or a generic fallback), and gives the user
 * two choices: update now (downloads + reloads) or dismiss until next launch.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Updates from 'expo-updates';

interface Props {
  message: string;
  onDismiss: () => void;
}

export function UpdatePrompt({ message, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slideAnim = useRef(new Animated.Value(400)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  function dismiss() {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 400,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start(() => onDismiss());
  }

  async function applyUpdate() {
    setInstalling(true);
    setError(null);
    try {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch {
      setInstalling(false);
      setError('Could not download the update. Check your connection and try again.');
    }
  }

  return (
    <Modal transparent animationType="none" statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropAnim }]}
        pointerEvents="box-none"
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={installing ? undefined : dismiss} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 20, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View style={styles.handle} />

        {/* Icon badge */}
        <View style={styles.iconWrap}>
          <Feather name="download-cloud" size={28} color="#cf7217" />
        </View>

        {/* Heading */}
        <Text style={styles.title}>Update ready</Text>
        <Text style={styles.message}>{message}</Text>

        {/* Error */}
        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Primary CTA */}
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed, installing && styles.primaryBtnLoading]}
          onPress={applyUpdate}
          disabled={installing}
        >
          {installing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Feather name="refresh-cw" size={16} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.primaryBtnText}>Update now</Text>
            </>
          )}
        </Pressable>

        {/* Dismiss */}
        {!installing && (
          <Pressable onPress={dismiss} style={styles.laterBtn}>
            <Text style={styles.laterText}>Remind me later</Text>
          </Pressable>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0f2217',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 24,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 24,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(207,114,23,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: '#f5f0e8',
    textAlign: 'center',
    marginBottom: 10,
  },
  message: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(245,240,232,0.72)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#f87171',
    textAlign: 'center',
    marginBottom: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#cf7217',
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 12,
  },
  primaryBtnPressed: {
    backgroundColor: '#b8631A',
  },
  primaryBtnLoading: {
    opacity: 0.75,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  laterBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  laterText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(245,240,232,0.5)',
  },
});
