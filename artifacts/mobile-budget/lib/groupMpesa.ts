/**
 * Which M-Pesa a budget's money moves through, and so whose phone messages may
 * be read into it: "my worry is the app importing users mpesa when it may not be
 * what the group is using" (16 Oct 2026).
 *
 * A Personal budget is the person's own M-Pesa. A shared group says, once, which
 * M-Pesa it uses (api-server lib/group-mpesa-source); only a group run on its
 * treasurer's own line reads that treasurer's phone messages. Every other group
 * - and one that has not said - reads none: it brings in its own statement.
 */
export type GroupMpesaSourceKind = 'treasurer_line' | 'paybill' | 'till' | 'bank' | 'none';
export type GroupMpesaSource = { source: GroupMpesaSourceKind | null; lineNumber: string | null; treasurerUserId: string | null };

export const GROUP_MPESA_CHOICES: ReadonlyArray<{ source: GroupMpesaSourceKind; title: string; description: string; asksNumber?: 'phone' | 'business' }> = [
  { source: 'paybill', title: 'A Paybill', description: 'Members pay to the group\'s own Paybill number.', asksNumber: 'business' },
  { source: 'till', title: 'A Till (Buy Goods)', description: 'Members pay to the group\'s own Till number.', asksNumber: 'business' },
  { source: 'treasurer_line', title: 'My own M-Pesa line', description: 'Members send to my phone number. My messages are read here, and I sort what is the group\'s.', asksNumber: 'phone' },
  { source: 'bank', title: 'A bank account', description: 'Members pay into the group\'s bank account.' },
  { source: 'none', title: 'We don\'t use M-Pesa', description: 'Cash or other ways. No M-Pesa is read here.' },
];

/** Whether this phone's own M-Pesa messages may be read into the budget open now. */
export function smsAllowedIn(
  group: { isPrivate?: boolean | null } | null | undefined,
  source: GroupMpesaSource | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!group) return false;
  if (group.isPrivate === true) return true;
  return source?.source === 'treasurer_line' && !!userId && source.treasurerUserId === userId;
}

/** The last nine digits of a Kenyan number, however it is written (07.., 2547.., +2547..). */
export const lineDigits = (value: string | null | undefined): string | null => {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : null;
};

const shown = (digits: string) => `0${digits.slice(0, 3)} *** ${digits.slice(-3)}`;

/**
 * A statement brought into a group that is not the group's own line: said
 * before anything is saved. Null when it is (or nothing is known to compare).
 */
export function wrongLineWarning(
  groupName: string,
  source: GroupMpesaSource | null | undefined,
  holderPhone: string | null | undefined,
): string | null {
  if (!source?.source) return null;
  const holder = lineDigits(holderPhone);
  if (source.source === 'paybill' || source.source === 'till') {
    if (!holder) return null;
    const kind = source.source === 'paybill' ? 'Paybill' : 'Till';
    return `This is a personal M-Pesa statement (${shown(holder)}), but ${groupName} uses its ${kind}${source.lineNumber ? ` ${source.lineNumber}` : ''}. Only save what is the group's.`;
  }
  if (source.source === 'treasurer_line') {
    const line = lineDigits(source.lineNumber);
    if (!holder || !line || holder === line) return null;
    return `This statement is for ${shown(holder)}, but ${groupName}'s money goes to ${shown(line)}. Only save what is the group's.`;
  }
  if (source.source === 'bank' || source.source === 'none') {
    return `${groupName} doesn't use M-Pesa${source.source === 'bank' ? ' - its money is in a bank account' : ''}. Only save what is the group's.`;
  }
  return null;
}
