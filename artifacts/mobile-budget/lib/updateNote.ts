/**
 * What an over-the-air update says is new, read from its manifest before it
 * is downloaded (see app.config.js): a short list, or empty when it says
 * nothing, for the prompt's own general line.
 */
export function updateNotesFrom(manifest: unknown): string[] {
  const record = (value: unknown) => (value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined);
  const root = record(manifest);
  // The app config the update was published with, where JAMVI_UPDATE_NOTE lands.
  const note = record(record(record(root?.extra)?.expoClient)?.extra)?.updateNote;
  // Older publishes, should the service ever pass --message through.
  const message = record(root?.metadata)?.message;
  const raw = typeof note === 'string' && note.trim() ? note : typeof message === 'string' ? message : '';
  return raw
    .split('|')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 6);
}
