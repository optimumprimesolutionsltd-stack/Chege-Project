import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { readerHtml, type ReaderMessage } from '@/lib/statementReaderHtml';

type WebViewHandle = { injectJavaScript: (script: string) => void };
type WebViewComponent = React.ComponentType<Record<string, unknown> & { ref?: React.Ref<WebViewHandle> }>;

let WebView: WebViewComponent | null = null;
try {
  // Native code: only a new build has it (see lib/statementFile.ts).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  WebView = (require('react-native-webview') as { WebView: WebViewComponent }).WebView;
} catch {
  WebView = null;
}

export interface ReaderJob {
  base64: string;
  password: string;
}

/**
 * Reads a statement PDF inside a hidden page, on this phone.
 *
 * The page cannot reach anything: no network, no other pages, and the only
 * things that cross are the file and its password going in and the position of
 * each piece of text coming out. Nothing is uploaded or stored.
 *
 * `warm` creates the page early - once a statement has been chosen, while the
 * password is still being typed - so its large library has loaded by the time
 * Read is tapped. Warm or not, the file and password go in only with a job.
 */
export function StatementReader({ job, warm = false, onDone }: { job: ReaderJob | null; warm?: boolean; onDone: (result: ReaderMessage) => void }) {
  const ref = useRef<WebViewHandle | null>(null);
  const jobRef = useRef(job);
  jobRef.current = job;
  const pageReady = useRef(false);
  const sentJob = useRef<ReaderJob | null>(null);
  const wanted = job !== null || warm;

  // Hands the job to the page once both are there: the page ready and a job
  // asked for, in whichever order they arrive. Each job goes in once.
  const send = () => {
    const current = jobRef.current;
    if (!current || !pageReady.current || sentJob.current === current) return;
    sentJob.current = current;
    ref.current?.injectJavaScript(`window.__read(${JSON.stringify(current.base64)}, ${JSON.stringify(current.password)}); true;`);
  };
  useEffect(() => {
    if (job) send();
    else sentJob.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);
  useEffect(() => {
    if (!wanted) pageReady.current = false;
  }, [wanted]);

  // The library is large, so the page only exists when a statement is chosen or being read.
  const html = useMemo(() => {
    if (!wanted) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bundle = require('@/lib/pdfjsBundle') as { PDFJS_MAIN: string; PDFJS_WORKER: string };
    return readerHtml(bundle.PDFJS_MAIN, bundle.PDFJS_WORKER);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

  if (!wanted || !WebView || !html) return null;
  const Page = WebView;
  return (
    <View style={{ height: 0, width: 0, overflow: 'hidden' }} pointerEvents="none" testID="statement-reader">
      <Page
        ref={ref}
        originWhitelist={['about:*', 'https://statement.invalid*']}
        source={{ html, baseUrl: 'https://statement.invalid' }}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        allowsLinkPreview={false}
        setSupportMultipleWindows={false}
        mixedContentMode="never"
        onShouldStartLoadWithRequest={(request: { url: string }) => request.url.startsWith('about:') || request.url.startsWith('https://statement.invalid')}
        onMessage={(event: { nativeEvent: { data: string } }) => {
          let message: ReaderMessage;
          try {
            message = JSON.parse(event.nativeEvent.data) as ReaderMessage;
          } catch {
            return;
          }
          if (message.type === 'ready') {
            pageReady.current = true;
            send();
            return;
          }
          // Warming up with nothing asked for: nobody is waiting on an answer.
          if (!jobRef.current) return;
          onDone(message);
        }}
        onError={() => onDone({ type: 'error', message: 'The statement reader could not start.' })}
      />
    </View>
  );
}
