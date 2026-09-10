import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Alert, Share, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

type ActiveViewLink = { active: true; createdAt: string; expiresAt: string; passphraseRequired: boolean };
type ViewLinkStatus = { active: false } | ActiveViewLink;

const WHATSAPP_GREEN = '#25D366';

function shareOrigin(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : 'https://jamvi.co.ke';
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Read-only sharing for a Shared budget, mirroring the web Settings card. A
 * member link lets someone record and needs its own subscription; this one
 * lets the whole group only look, for free. Optionally protected by a spoken
 * passphrase — shown separately, to be said aloud rather than sent with the
 * link.
 */
export function ReadOnlyLinkCard({ groupName }: { groupName?: string }) {
  const colors = useColors();
  const queryClient = useQueryClient();

  const { data: status } = useQuery<ViewLinkStatus>({
    queryKey: ['group-view-links'],
    queryFn: () => customFetch('/api/group-view-links'),
    retry: false,
  });
  const active: ActiveViewLink | null = status && status.active ? status : null;

  const [usePassphrase, setUsePassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState<null | 'create' | 'revoke'>(null);
  const [created, setCreated] = useState<{ url: string; passphrase: string | null } | null>(null);

  useEffect(() => {
    if (!usePassphrase || passphrase) return;
    let cancelled = false;
    customFetch<{ passphrase: string }>('/api/group-view-links/suggested-passphrase')
      .then((body) => {
        if (!cancelled) setPassphrase(body.passphrase);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [usePassphrase, passphrase]);

  const reshuffle = async () => {
    try {
      const body = await customFetch<{ passphrase: string }>('/api/group-view-links/suggested-passphrase');
      setPassphrase(body.passphrase);
    } catch {
      /* keep the current one */
    }
  };

  const create = async () => {
    const phrase = usePassphrase ? passphrase.trim() : '';
    if (usePassphrase && phrase.length < 4) {
      Alert.alert('Passphrase too short', 'Use at least 4 characters, or turn the passphrase off.');
      return;
    }
    setBusy('create');
    try {
      const body = await customFetch<{ token: string; expiresAt: string }>('/api/group-view-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(usePassphrase ? { passphrase: phrase } : {}),
      });
      setCreated({ url: `${shareOrigin()}/join/${body.token}`, passphrase: usePassphrase ? phrase : null });
      queryClient.invalidateQueries({ queryKey: ['group-view-links'] });
    } catch (error) {
      Alert.alert('Could not create link', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    setBusy('revoke');
    try {
      await customFetch('/api/group-view-links', { method: 'DELETE' });
      setCreated(null);
      queryClient.invalidateQueries({ queryKey: ['group-view-links'] });
      Alert.alert('Read-only link revoked', 'It can no longer let anyone in. People already viewing keep their access until you remove them.');
    } catch (error) {
      Alert.alert('Could not revoke link', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const shareLink = async (url: string) => {
    const message = `See the finances for ${groupName || 'our Shared budget'} on Jamvi (view only): ${url}`;
    try {
      await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`);
    } catch {
      await Share.share({ message });
    }
  };

  return (
    <View style={[styles.card, { borderTopColor: colors.border }]}>
      <View style={styles.headingRow}>
        <Feather name="eye" size={15} color={colors.primary} />
        <Text style={[styles.heading, { color: colors.foreground }]}>Read-only link</Text>
      </View>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        Anyone with this link can sign in and see this budget — balances, contributions, reports — but not record anything. Free for them, lasts 30 days.
      </Text>

      {!created && (
        <Pressable
          onPress={() => setUsePassphrase((on) => !on)}
          style={[styles.check, { borderColor: colors.border }]}
        >
          <Feather
            name={usePassphrase ? 'check-square' : 'square'}
            size={18}
            color={usePassphrase ? colors.primary : colors.mutedForeground}
          />
          <Text style={[styles.checkText, { color: colors.mutedForeground }]}>
            Protect it with a passphrase — a few plain words to read out at the meeting. Say it aloud, don&rsquo;t send it with the link.
          </Text>
        </Pressable>
      )}

      {usePassphrase && !created && (
        <View style={styles.passRow}>
          <TextInput
            value={passphrase}
            onChangeText={setPassphrase}
            placeholder="e.g. kikapu-jembe-taa-4820"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
          />
          <Pressable onPress={reshuffle} style={[styles.iconBtn, { borderColor: colors.border }]}>
            <Feather name="refresh-cw" size={15} color={colors.foreground} />
          </Pressable>
        </View>
      )}

      {created ? (
        <View style={[styles.result, { borderColor: colors.border }]}>
          <Text style={[styles.resultTitle, { color: colors.foreground }]}>Read-only link ready</Text>
          <Text selectable style={[styles.url, { color: colors.mutedForeground, borderColor: colors.border }]}>
            {created.url}
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={() => void shareLink(created.url)} style={[styles.btn, { backgroundColor: WHATSAPP_GREEN }]}>
              <Feather name="message-circle" size={15} color="#fff" />
              <Text style={styles.btnLabel}>WhatsApp</Text>
            </Pressable>
            <Pressable
              onPress={() => void Share.share({ message: created.url })}
              style={[styles.btn, styles.btnOutline, { borderColor: colors.border }]}
            >
              <Feather name="share-2" size={15} color={colors.foreground} />
              <Text style={[styles.btnLabel, { color: colors.foreground }]}>Share</Text>
            </Pressable>
          </View>
          {created.passphrase && (
            <View style={[styles.passphraseBox, { borderColor: colors.warning }]}>
              <Text style={[styles.passphraseHead, { color: colors.foreground }]}>Passphrase — share this separately</Text>
              <Text selectable style={[styles.passphraseValue, { color: colors.foreground }]}>{created.passphrase}</Text>
              <Text style={[styles.passphraseNote, { color: colors.mutedForeground }]}>
                Say it at the meeting or send it another way. Anyone opening the link is asked for it.
              </Text>
            </View>
          )}
          <Pressable onPress={() => void revoke()} disabled={busy !== null} style={styles.revoke}>
            <Feather name="x" size={14} color={colors.destructive} />
            <Text style={[styles.revokeText, { color: colors.destructive }]}>Revoke</Text>
          </Pressable>
        </View>
      ) : active ? (
        <View style={[styles.result, { borderColor: colors.border }]}>
          <Text style={[styles.resultTitle, { color: colors.foreground }]}>Active until {formatDay(active.expiresAt)}</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            {active.passphraseRequired ? 'Passphrase-protected. ' : ''}For privacy the link is only shown when you create or reset it.
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={() => void create()} disabled={busy !== null} style={[styles.btn, styles.btnOutline, { borderColor: colors.border }]}>
              {busy === 'create' ? <ActivityIndicator size="small" color={colors.foreground} /> : <Feather name="refresh-cw" size={15} color={colors.foreground} />}
              <Text style={[styles.btnLabel, { color: colors.foreground }]}>Reset link</Text>
            </Pressable>
            <Pressable onPress={() => void revoke()} disabled={busy !== null} style={[styles.btn, styles.btnOutline, { borderColor: colors.border }]}>
              {busy === 'revoke' ? <ActivityIndicator size="small" color={colors.destructive} /> : <Feather name="x" size={15} color={colors.destructive} />}
              <Text style={[styles.btnLabel, { color: colors.destructive }]}>Revoke</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => void create()} disabled={busy !== null} style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.primary }]}>
          {busy === 'create' ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="eye" size={15} color={colors.primaryForeground} />}
          <Text style={[styles.btnLabel, { color: colors.primaryForeground }]}>Create read-only link</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, marginTop: 4, gap: 10 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heading: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  sub: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  check: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 10 },
  checkText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  passRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, height: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 10, fontSize: 13 },
  iconBtn: { height: 40, width: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  result: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 10 },
  resultTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  url: { fontSize: 11, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 40, borderRadius: 10 },
  btnPrimary: { flex: undefined, width: '100%' },
  btnOutline: { borderWidth: StyleSheet.hairlineWidth },
  btnLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' },
  passphraseBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 10, gap: 5 },
  passphraseHead: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  passphraseValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  passphraseNote: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_400Regular' },
  revoke: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  revokeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
