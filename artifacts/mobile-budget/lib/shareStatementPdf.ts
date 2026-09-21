import { Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { customFetch } from '@workspace/api-client-react';
import { writePdf } from '@/lib/savePdf';

/**
 * Fetch an account statement as a PDF and hand it to the share sheet.
 *
 * Kept out of the screen so the fetch, the write and the share can be read in
 * one place — the same three steps the monthly report and the contribution
 * ledger already take, and the same order, because getting them out of order
 * is how you end up sharing the file you wrote last time.
 */
export async function shareStatementPdf({
  accountId,
  from,
  to,
  accountName,
}: {
  accountId: number;
  from: string;
  to: string;
  accountName: string;
}): Promise<void> {
  const blob = await customFetch<Blob>(
    `/api/joint-account/statement.pdf?accountId=${accountId}&from=${from}&to=${to}`,
    { responseType: 'blob', cache: 'no-store' },
  );
  const slug = accountName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'account';
  const file = await writePdf(Paths.cache, `jamvi-statement-${slug}-${from}-to-${to}.pdf`, blob);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Save or share account statement',
    UTI: 'com.adobe.pdf',
  });
}
