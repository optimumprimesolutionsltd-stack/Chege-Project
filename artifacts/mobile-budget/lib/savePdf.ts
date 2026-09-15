import { File } from 'expo-file-system';
import type { Directory } from 'expo-file-system';
import { blobToBase64 } from '@/lib/blobToBase64';

/**
 * Writes a downloaded PDF to a file, without ever asking the Blob for an
 * ArrayBuffer — see the note in blobToBase64 for why that mattered.
 */
export async function writePdf(directory: Directory, name: string, blob: Blob): Promise<File> {
  const base64 = await blobToBase64(blob);
  const file = new File(directory, name);
  // A second attempt must not fail on the leftovers of the first.
  if (file.exists) file.delete();
  file.create();
  file.write(base64, { encoding: 'base64' });
  return file;
}
