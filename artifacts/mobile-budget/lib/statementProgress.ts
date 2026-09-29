export type ReadProgress = { stage: 'opening' | 'reading' | 'checking'; page?: number; of?: number };

/**
 * How far a statement read has got, 0 to 100, across its three stages:
 * opening the file 0-10, reading its pages 10-90, checking what is already
 * recorded 90-100. Pages are most of the wait, so they get most of the bar.
 */
export function readPercent(progress: ReadProgress): number {
  if (progress.stage === 'opening') return 5;
  if (progress.stage === 'checking') return 95;
  const of = progress.of ?? 0;
  if (of <= 0) return 10;
  return Math.round(10 + (Math.min(progress.page ?? 0, of) / of) * 80);
}
