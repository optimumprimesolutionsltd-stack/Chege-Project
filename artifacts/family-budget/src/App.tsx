import { Route, Switch, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuth } from '@workspace/replit-auth-web';
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
            ? "You have been removed from the group’s access list. Shared budgets, bank activity, goals, reports, and history remain with the group."
            : "Your shared group access has changed. Ask a current owner or admin to send you a new invitation if you need to rejoin."}
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
  const { isAuthenticated, isLoading } = useAuth();
  const { data: hasGroupAccess, isLoading: isCheckingGroupAccess } = useQuery({
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-primary/20 rounded-2xl"></div>
          <div className="h-4 w-24 bg-primary/20 rounded"></div>
        </div>
      </div>
    );
  }

  // Auth-done page must be reachable before auth state resolves (popup context).
  if (window.location.pathname.endsWith('/auth-done')) {
    return <AuthDone />;
  }

  if (/\/invite\/[^/]+$/.test(window.location.pathname)) {
    return <InvitePage />;
  }

  if (/\/join\/[^/]+$/.test(window.location.pathname)) {
    return <JoinGroupPage />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (isCheckingGroupAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <MainRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
