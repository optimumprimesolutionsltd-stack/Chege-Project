import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Share, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetGroupInviteLinksQueryKey,
  useCreateGroupInviteLink,
  useGetGroupInviteLinks,
  useRevokeGroupInviteLink,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { isMemberLimitError, MEMBER_LIMIT_PROMPT } from '@/lib/memberLimit';

const WHATSAPP_GREEN = '#25D366';

function shareOrigin(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : 'https://jamvi.co.ke';
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Invite a member with a link, rather than only by email.
 *
 * "Share invite on WhatsApp" used to make a link and send it in the same tap
 * without ever showing it — fine on WhatsApp, a dead end for anyone who
 * wanted to paste it into SMS, Telegram, or anywhere else. This shows the
 * link itself, mirroring the read-only link right below it: created or reset
 * on request, shown once for privacy, copyable and shareable from there.
 */
export function GroupInviteLinkCard({ groupName }: { groupName?: string }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { data: links = [] } = useGetGroupInviteLinks();
  const createLink = useCreateGroupInviteLink();
  const revokeLink = useRevokeGroupInviteLink();
  const activeLink = links.find((link) => link.status === 'active');
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const create = async () => {
    try {
      const created = await createLink.mutateAsync();
      setCreatedUrl(`${shareOrigin()}/invite/${created.token}`);
      await queryClient.invalidateQueries({ queryKey: getGetGroupInviteLinksQueryKey() });
    } catch (error: unknown) {
      Alert.alert(
        isMemberLimitError(error) ? MEMBER_LIMIT_PROMPT.title : 'Could not create link',
        isMemberLimitError(error) ? MEMBER_LIMIT_PROMPT.message : error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  const revoke = async () => {
    if (!activeLink) return;
    try {
      await revokeLink.mutateAsync({ id: activeLink.id });
      setCreatedUrl(null);
      await queryClient.invalidateQueries({ queryKey: getGetGroupInviteLinksQueryKey() });
      Alert.alert('Private link revoked', 'It can no longer add anyone to the group.');
    } catch (error: unknown) {
      Alert.alert('Could not revoke link', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const shareLink = async (url: string) => {
    const message = `Join ${groupName || 'my Jamvi Shared group'} using this private invite link: ${url}`;
    try {
      await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`);
    } catch {
      await Share.share({ message });
    }
  };

  const busy = createLink.isPending ? 'create' : revokeLink.isPending ? 'revoke' : null;

  return (
    <View style={[styles.card, { borderTopColor: colors.border }]}>
      <View style={styles.headingRow}>
        <Feather name="link" size={15} color={colors.primary} />
        <Text style={[styles.heading, { color: colors.foreground }]}>Private invite link</Text>
      </View>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        Anyone with this link can sign in and join as a member. Expires in 7 days, or sooner if you reset it.
      </Text>

      {createdUrl ? (
        <View style={[styles.result, { borderColor: colors.border }]}>
          <Text style={[styles.resultTitle, { color: colors.foreground }]}>Private invite link ready</Text>
          <Text selectable style={[styles.url, { color: colors.mutedForeground, borderColor: colors.border }]} testID="group-invite-link-url">
            {createdUrl}
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={() => void shareLink(createdUrl)} style={[styles.btn, { backgroundColor: WHATSAPP_GREEN }]}>
              <Feather name="message-circle" size={15} color="#fff" />
              <Text style={styles.btnLabel}>WhatsApp</Text>
            </Pressable>
            <Pressable
              onPress={() => void Share.share({ message: createdUrl })}
              style={[styles.btn, styles.btnOutline, { borderColor: colors.border }]}
            >
              <Feather name="share-2" size={15} color={colors.foreground} />
              <Text style={[styles.btnLabel, { color: colors.foreground }]}>Share</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => void revoke()} disabled={busy !== null} style={styles.revoke}>
            <Feather name="x" size={14} color={colors.destructive} />
            <Text style={[styles.revokeText, { color: colors.destructive }]}>Revoke</Text>
          </Pressable>
        </View>
      ) : activeLink ? (
        <View style={[styles.result, { borderColor: colors.border }]}>
          <Text style={[styles.resultTitle, { color: colors.foreground }]}>Active until {formatDay(activeLink.expiresAt)}</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            For privacy the link is only shown when you create or reset it.
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={() => void create()}
              disabled={busy !== null}
              testID="group-invite-link-reset"
              style={[styles.btn, styles.btnOutline, { borderColor: colors.border }]}
            >
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
        <Pressable
          onPress={() => void create()}
          disabled={busy !== null}
          testID="group-invite-link-create"
          style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.primary }]}
        >
          {busy === 'create' ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="link" size={15} color={colors.primaryForeground} />}
          <Text style={[styles.btnLabel, { color: colors.primaryForeground }]}>Create invite link</Text>
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
  result: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 10 },
  resultTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  url: { fontSize: 11, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 40, borderRadius: 10 },
  btnPrimary: { flex: undefined, width: '100%' },
  btnOutline: { borderWidth: StyleSheet.hairlineWidth },
  btnLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' },
  revoke: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  revokeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
