/**
 * The page a hidden WebView runs to read a statement PDF.
 *
 * It has no network and no way to reach the rest of the app: the PDF arrives as
 * base64 through `window.__read`, and what comes back is only the position of
 * each piece of text (`{type:'pages'}`), or why it could not be read
 * (`{type:'error'}`). The password is handed to pdf.js and used nowhere else.
 * `{type:'ready'}` says the page can be asked to read.
 */
export type ReaderMessage =
  | { type: 'ready' }
  /** A page has been read, so the screen can say how far along it is. */
  | { type: 'progress'; page: number; of: number }
  | { type: 'pages'; pages: Array<Array<{ str: string; x: number; y: number; w: number }>> }
  | { type: 'error'; name?: string; code?: number; message: string };

/** The library and its worker are given as text, and turned into blobs inside the page. */
export function readerHtml(library: string, worker: string): string {
  // `</` cannot appear inside an inline script; the generated bundle already escapes it.
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
const LIBRARY = ${JSON.stringify(library).replace(/<\//g, '<\\/')};
const WORKER = ${JSON.stringify(worker).replace(/<\//g, '<\\/')};
const post = (message) => window.ReactNativeWebView.postMessage(JSON.stringify(message));
const blobUrl = (source) => URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
let pdfjs = null;
// The library is large and slow to start, so it starts loading as soon as the
// page exists - which can be before there is anything to read - and the page
// says it is ready only once it has.
const loading = (async () => {
  pdfjs = await import(blobUrl(LIBRARY));
  pdfjs.GlobalWorkerOptions.workerSrc = blobUrl(WORKER);
})();
window.__read = async (base64, password) => {
  try {
    await loading;
    const binary = atob(base64);
    const data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) data[i] = binary.charCodeAt(i);
    let doc;
    const loadingTask = pdfjs.getDocument({ data, password: password || undefined });
    try {
      doc = await loadingTask.promise;
    } catch (error) {
      post({ type: 'error', name: error && error.name, code: error && error.code, message: String((error && error.message) || error) });
      return;
    }
    const pages = [];
    for (let number = 1; number <= doc.numPages; number += 1) {
      const page = await doc.getPage(number);
      const content = await page.getTextContent();
      // Let go of the page once its text is out: kept, a long statement's
      // pages filled the phone's memory and the reader was killed.
      try {
        page.cleanup();
      } catch {}
      pages.push(
        content.items
          .filter((item) => typeof item.str === 'string' && item.str.trim() !== '')
          .map((item) => ({ str: item.str, x: item.transform[4], y: item.transform[5], w: item.width })),
      );
      post({ type: 'progress', page: number, of: doc.numPages });
    }
    // Free the worker's copy too. pdf.js 6 ends a document through its loading
    // task (doc.destroy no longer exists - calling it failed every read), and
    // tidying up must never cost the read, so a failure here is ignored.
    try {
      loadingTask.destroy().catch(() => {});
    } catch {}
    post({ type: 'pages', pages });
  } catch (error) {
    post({ type: 'error', message: String((error && error.message) || error) });
  }
};
loading.then(
  () => post({ type: 'ready' }),
  (error) => post({ type: 'error', message: String((error && error.message) || error) }),
);
</script></body></html>`;
}
