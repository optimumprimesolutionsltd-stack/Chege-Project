/**
 * UpdatePrompt — an OTA update ready to go in, or one that just has.
 *
 * "ready": downloaded, with what is new, and the choice - Update now, or Later,
 * which lets it go in at a natural break (app/_layout, lib/updateTiming).
 * "done": it went in on its own; what is new, so it can be tried out.
 * The list comes from the note published with the update (JAMVI_UPDATE_NOTE,
 * see app.config.js), or a general line when there is none.
 *
 * Only its buttons (or Android Back, as Later) close it. A tap on the dimmed
 * screen used to, so a tap already on its way closed it the moment it
 * appeared - "for a flick of a second" (8 Oct 2026).
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

interface Props {
  kind: 'ready' | 'done';
  /** What is new, one item each; empty for the general line. */
  notes: string[];
  /** "ready" only: put it in now (restarts Jamvi where the person is). */
  onUpdate?: () => Promise<void>;
  /** Later, or Got it. */
  onDismiss: () => void;
}

export function UpdatePrompt({ kind, notes, onUpdate, onDismiss }: Props) {
  const [updating, setUpdating] = useState(false);
  const insets = useSafeAreaInsets();
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

  return (
    <Modal transparent animationType="none" statusBarTranslucent onRequestClose={() => { if (!updating) dismiss(); }}>
      {/* Backdrop - dims, and takes taps without closing anything */}
      <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} accessible={false} />
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
          <Feather name={kind === 'ready' ? 'download' : 'check-circle'} size={28} color="#E9B949" />
        </View>

        {/* Heading */}
        <Text style={styles.title}>{kind === 'ready' ? 'An update is ready' : 'Jamvi was updated'}</Text>
        {notes.length > 0 ? (
          <View style={styles.notes} testID="update-notes">
            <Text style={styles.notesHead}>What's new</Text>
            {notes.map((note) => (
              <View key={note} style={styles.noteRow}>
                <Text style={styles.noteDot}>•</Text>
                <Text style={styles.noteText}>{note}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.message}>
            {kind === 'ready' ? 'The latest improvements and fixes for Jamvi.' : 'Jamvi now has the latest improvements and fixes.'}
          </Text>
        )}
        {kind === 'ready' ? (
          <>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed, updating && styles.primaryBtnLoading]}
              disabled={updating}
              onPress={() => {
                setUpdating(true);
                void onUpdate?.().finally(() => setUpdating(false));
              }}
              testID="update-now"
            >
              <Text style={styles.primaryBtnText}>{updating ? 'Updating…' : 'Update now'}</Text>
            </Pressable>
            <Text style={styles.hint}>Jamvi restarts and brings you back to this screen.</Text>
            <Pressable style={styles.laterBtn} disabled={updating} onPress={dismiss} testID="update-later">
              <Text style={styles.laterText}>Later</Text>
            </Pressable>
            <Text style={styles.hint}>It goes in on its own the next time you open Jamvi.</Text>
          </>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
            onPress={dismiss}
            testID="update-got-it"
          >
            <Text style={styles.primaryBtnText}>Got it</Text>
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
    backgroundColor: '#0B1F2A',
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
    borderRadius: 12,
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
  notes: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: 14,
    gap: 6,
    marginBottom: 24,
  },
  notesHead: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#E9B949',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  noteRow: { flexDirection: 'row', gap: 8 },
  noteDot: { fontSize: 15, lineHeight: 21, color: 'rgba(245,240,232,0.72)' },
  noteText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(245,240,232,0.85)',
    lineHeight: 21,
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
    backgroundColor: '#E9B949',
    borderRadius: 8,
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
    paddingVertical: 12,
    alignItems: 'center',
  },
  hint: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(245,240,232,0.5)',
    textAlign: 'center',
    marginTop: -4,
    marginBottom: 8,
  },
  laterText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(245,240,232,0.5)',
  },
});
