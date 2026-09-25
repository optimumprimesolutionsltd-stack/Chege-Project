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
window.__read = async (base64, password) => {
  try {
    if (!pdfjs) {
      pdfjs = await import(blobUrl(LIBRARY));
      pdfjs.GlobalWorkerOptions.workerSrc = blobUrl(WORKER);
    }
    const binary = atob(base64);
    const data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) data[i] = binary.charCodeAt(i);
    let doc;
    try {
      doc = await pdfjs.getDocument({ data, password: password || undefined }).promise;
    } catch (error) {
      post({ type: 'error', name: error && error.name, code: error && error.code, message: String((error && error.message) || error) });
      return;
    }
    const pages = [];
    for (let number = 1; number <= doc.numPages; number += 1) {
      const content = await (await doc.getPage(number)).getTextContent();
      pages.push(
        content.items
          .filter((item) => typeof item.str === 'string' && item.str.trim() !== '')
          .map((item) => ({ str: item.str, x: item.transform[4], y: item.transform[5], w: item.width })),
      );
    }
    post({ type: 'pages', pages });
  } catch (error) {
    post({ type: 'error', message: String((error && error.message) || error) });
  }
};
post({ type: 'ready' });
</script></body></html>`;
}
