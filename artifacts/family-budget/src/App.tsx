import { Route, Switch, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AuthProvider, useAuth } from '@workspace/replit-auth-web';
import LoginPage from '@/pages/login';
import { Layout } from '@/components/layout';
import Dashboard from '@/pages/dashboard';
import Expenses from '@/pages/expenses';
import Budget from '@/pages/budget';
import Activity from '@/pages/activity';
import NotFound from '@/pages/not-found';
import AuthDone from '@/pages/auth-done';
import Settings from '@/pages/settings';
import SavingsGoals from '@/pages/savings-goals';
import Bank from '@/pages/bank';
import Parity from '@/pages/parity';
import IncomeStreamsReport from '@/pages/income-streams-report';
import InvitePage from '@/pages/invite';
import JoinGroupPage from '@/pages/join-group';

const queryClient = new QueryClient();

function AppLoading({ message = 'Loading Jamvi…' }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="flex flex-col items-center gap-4 text-center" role="status" aria-live="polite">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function AppErrorFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-lg">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-2xl">
          !
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold text-foreground">Jamvi could not load</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Something interrupted the page. Your saved data is safe. Reload Jamvi and try again.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Reload Jamvi
        </button>
      </div>
    </div>
  );
}

function AuthConnectionFallback({ retry }: { retry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-lg">
        <h1 className="font-display text-2xl font-bold text-foreground">Jamvi is taking too long to connect</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          We could not check your account yet. This is usually a temporary connection problem, not a sign-in problem.
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-6 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Jamvi failed to render', error, errorInfo);
  }

  render() {
    return this.state.hasError ? <AppErrorFallback /> : this.props.children;
  }
}

function AuthenticatedApp() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/expenses" component={Expenses} />
        <Route path="/budget" component={Budget} />
        <Route path="/contributions" component={Activity} />
        <Route path="/activity" component={Activity} />
        <Route path="/savings-goals" component={SavingsGoals} />
        <Route path="/bank" component={Bank} />
        <Route path="/reports" component={IncomeStreamsReport} />
        <Route path="/settings" component={Settings} />
        <Route path="/invite/:token" component={InvitePage} />
        <Route path="/join/:token" component={JoinGroupPage} />
        <Route path="/parity" component={Parity} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function NoGroupAccess({ voluntarilyLeft }: { voluntarilyLeft: boolean }) {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-lg">
        <h1 className="font-display text-2xl font-bold text-foreground">
          {voluntarilyLeft ? "You left this group" : "You no longer have access to this group"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {voluntarilyLeft
            ? "You have been removed from the group’s access list. Shared budget funds, bank activity, goals, reports, and history remain with the group."
            : "Your Shared budget access has changed. Ask a current owner or admin to send you a new invitation if you need to rejoin."}
        </p>
        <button
          type="button"
          onClick={() => logout()}
          className="mt-6 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function MainRouter() {
  const { isAuthenticated, isLoading, error: authError, retry: retryAuth } = useAuth();
  const {
    data: hasGroupAccess,
    isLoading: isCheckingGroupAccess,
    isError: groupAccessError,
    refetch: refetchGroupAccess,
  } = useQuery({
    queryKey: ['group-access', isAuthenticated],
    queryFn: async () => {
      const response = await fetch('/api/members', { credentials: 'include' });
      if (response.status === 403) return false;
      if (!response.ok) throw new Error('Could not check group access.');
      return true;
    },
    enabled: isAuthenticated,
    retry: false,
  });

  // Auth-done page must be reachable before auth state resolves (popup context).
  if (window.location.pathname.endsWith('/auth-done')) {
    return <AuthDone />;
  }

  if (isLoading) {
    return <AppLoading message="Checking your account…" />;
  }

  if (/\/invite\/[^/]+$/.test(window.location.pathname)) {
    return <InvitePage />;
  }

  if (/\/join\/[^/]+$/.test(window.location.pathname)) {
    return <JoinGroupPage />;
  }

  if (authError) {
    return <AuthConnectionFallback retry={retryAuth} />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (isCheckingGroupAccess) {
    return <AppLoading message="Loading your budget…" />;
  }

  if (groupAccessError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-lg">
          <h1 className="font-display text-2xl font-bold text-foreground">Your budget could not load</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Check your connection and try again. Nothing has been changed.
          </p>
          <button
            type="button"
            onClick={() => void refetchGroupAccess()}
            className="mt-6 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (hasGroupAccess === false) {
    return <NoGroupAccess voluntarilyLeft={new URLSearchParams(window.location.search).get('left') === '1'} />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <MainRouter />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}

export default App;
