import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

// Layout
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

// Pages
import Home from '@/pages/home';
import Features from '@/pages/features';
import Pricing from '@/pages/pricing';
import About from '@/pages/about';
import FAQ from '@/pages/faq';
import Terms from '@/pages/terms';
import Privacy from '@/pages/privacy';
import NotFound from '@/pages/not-found';
import { SegmentPage } from '@/pages/segment';
import { SEGMENTS } from '@/lib/segments';
import Guides from '@/pages/guides';
import { GuidePage } from '@/pages/guide';
import { GUIDES } from '@/lib/guides';

const queryClient = new QueryClient();

function Router() {
  return (
    <div className="flex flex-col min-h-screen selection:bg-secondary/30">
      <Navbar />
      <main className="flex-grow">
        <RoutedErrorBoundary>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/features" component={Features} />
            <Route path="/pricing" component={Pricing} />
            <Route path="/about" component={About} />
            <Route path="/faq" component={FAQ} />
            <Route path="/terms" component={Terms} />
            <Route path="/privacy" component={Privacy} />
            <Route path="/guides" component={Guides} />
            {GUIDES.map((guide) => (
              <Route key={guide.slug} path={guide.slug}>
                <GuidePage guide={guide} />
              </Route>
            ))}
            {SEGMENTS.map((segment) => (
              <Route key={segment.slug} path={segment.slug}>
                <SegmentPage segment={segment} />
              </Route>
            ))}
            <Route component={NotFound} />
          </Switch>
        </RoutedErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

/**
 * `ssrPath` is supplied only by the build-time render, which has no browser to
 * read the location from. In the browser it is undefined and wouter uses the
 * address bar as before.
 */
function App({ ssrPath }: { ssrPath?: string }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')} ssrPath={ssrPath}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
