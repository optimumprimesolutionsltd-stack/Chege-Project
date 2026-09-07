import { createRoot, hydrateRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

const container = document.getElementById('root')!;

const tree = (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

// Keeps caught errors off reportError(), which would raise the dev overlay.
const onCaughtError = (error: unknown, errorInfo: { componentStack?: string }) => {
  console.error(error, errorInfo.componentStack);
};

// The build writes each page's markup into #root. Hydrating adopts it, so the
// text a crawler reads is the same text a person sees and there is no blank
// flash while React boots. `dev` serves an empty root, so it still mounts.
if (container.firstChild) {
  hydrateRoot(container, tree, { onCaughtError });
} else {
  createRoot(container, { onCaughtError }).render(tree);
}
