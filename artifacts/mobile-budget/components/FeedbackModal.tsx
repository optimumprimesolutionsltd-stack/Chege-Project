/**
 * Feedback modal — reused by the Settings row and the occasional random
 * prompt, so there is exactly one place that knows how to send feedback.
 *
 * Posts to Jamvi's own /api/feedback, which relays it to the Optimum Prime
 * CRM tagged as Jamvi's — see artifacts/api-server/src/routes/feedback.ts.
 * Nothing is stored in Jamvi itself.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { customFetch, ApiError } from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Where this modal was opened from — not shown to the person, just
   *  context for whoever reads the feedback later. */
  context: 'settings' | 'random-prompt';
  /** Fires once the CRM has accepted the submission, before the "Thank you"
   *  screen or onClose — lets a caller suppress future prompts without
   *  needing to distinguish "sent" from "dismissed" by any other means. */
  onSubmitted?: () => void;
}

export function FeedbackModal({ visible, onClose, context, onSubmitted }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMessage('');
    setRating(null);
    setSubmitting(false);
    setSent(false);
    setError(null);
  };

  const handleClose = () => {
    onClose();
    // Delay the reset past the close animation so the form doesn't visibly
    // clear itself before the modal is gone.
    setTimeout(reset, 300);
  };

  const submit = async () => {
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await customFetch('/api/feedback', {
        method: 'POST',
        responseType: 'json',
        body: JSON.stringify({
          message: message.trim(),
          rating: rating ?? undefined,
          context,
          appVersion: Constants.expoConfig?.version,
        }),
      });
      setSent(true);
      onSubmitted?.();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Could not send feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.handle} />
          {sent ? (
            <View style={styles.doneWrap}>
              <Feather name="check-circle" size={40} color="#22c55e" />
              <Text style={[styles.title, { color: colors.foreground, marginTop: 12 }]}>Thank you</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                Your feedback helps shape what Jamvi builds next.
              </Text>
              <Pressable testID="feedback-done" onPress={handleClose} style={[styles.primaryBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.primaryBtnText}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.foreground }]}>Send feedback</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                Tell us what's working, what's not, or what would make Jamvi more useful.
              </Text>

              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable key={value} testID={`feedback-star-${value}`} onPress={() => setRating(rating === value ? null : value)} hitSlop={8}>
                    <Feather
                      name="star"
                      size={26}
                      color={rating != null && value <= rating ? '#fbbf24' : colors.border}
                      style={rating != null && value <= rating ? styles.starFilled : undefined}
                    />
                  </Pressable>
                ))}
              </View>

              <TextInput
                testID="feedback-message"
                value={message}
                onChangeText={setMessage}
                placeholder="What's on your mind?"
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={4}
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                testID="feedback-submit"
                onPress={() => void submit()}
                disabled={!message.trim() || submitting}
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: !message.trim() || submitting ? 0.5 : 1 }]}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send</Text>}
              </Pressable>
              <Pressable onPress={handleClose} style={styles.laterBtn}>
                <Text style={[styles.laterText, { color: colors.mutedForeground }]}>Not now</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(120,120,120,0.3)', alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  subtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 6, marginBottom: 18, lineHeight: 19 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 16 },
  starFilled: {},
  input: { borderWidth: 1, borderRadius: 14, padding: 14, minHeight: 100, textAlignVertical: 'top', fontSize: 15, fontFamily: 'Inter_400Regular' },
  error: { color: '#ef4444', fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 10, textAlign: 'center' },
  primaryBtn: { marginTop: 18, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold' },
  laterBtn: { marginTop: 10, paddingVertical: 10, alignItems: 'center' },
  laterText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  doneWrap: { alignItems: 'center', paddingVertical: 12 },
});
