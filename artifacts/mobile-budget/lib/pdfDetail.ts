import { Alert } from 'react-native';

export type PdfDetail = 'summary' | 'detailed';

/**
 * Asked before a PDF of a grouped list: each group's total on a page or two,
 * or every entry under its group. A month of expenses by category ran to a
 * dozen pages when only the totals were wanted.
 */
export function askPdfDetail(groupedBy: string, choose: (detail: PdfDetail) => void) {
  Alert.alert(
    'Summary or detailed?',
    `Summary gives the total for each ${groupedBy}. Detailed also lists every entry under it.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Summary', onPress: () => choose('summary') },
      { text: 'Detailed', onPress: () => choose('detailed') },
    ],
  );
}
