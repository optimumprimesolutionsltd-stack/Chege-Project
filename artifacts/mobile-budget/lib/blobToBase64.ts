/**
 * Reads a Blob as base64.
 *
 * Both PDF exports used `blob.arrayBuffer()`, which does not exist in React
 * Native — its Blob is a thin polyfill over a native blob registry and
 * implements almost none of the web API. The call threw "undefined is not a
 * function", the catch reported it as the report having failed, and the
 * server was blamed for it.
 *
 * `FileReader.readAsDataURL` is the one blob reader React Native does
 * implement, and expo-file-system writes base64 directly, so the bytes never
 * need to exist as an ArrayBuffer in JS at all.
 *
 * Kept free of any expo import so it can be tested without the native module.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The downloaded report could not be read on this phone.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        reject(new Error('The downloaded report was empty.'));
        return;
      }
      // readAsDataURL yields "data:application/pdf;base64,<payload>"; the file
      // wants only the payload.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}
