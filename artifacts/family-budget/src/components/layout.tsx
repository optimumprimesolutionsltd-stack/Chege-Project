import { Link, useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { LayoutDashboard, Receipt, PieChart, Activity, LogOut, Menu, X, Settings, Target, Landmark, BarChart3, Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useGetGroup, useGetMembers } from '@workspace/api-client-react';
import { WorkspaceSwitcher } from '@/components/workspace-switcher';
import { workspaceLabel } from '@/lib/workspace-identity';
import { ProfileAvatar } from '@/components/profile-avatar';
import { BrandLogo } from '@/components/brand-logo';

export function Layout({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isQuickLogOpen, setIsQuickLogOpen] = useState(false);
  const [location, navigate] = useLocation();
  const allowBrowserExitRef = useRef(false);
  const { user, logout } = useAuth();
  const { data: group } = useGetGroup();
  const { data: members = [] } = useGetMembers();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const guardedUrl = window.location.href;
    const guardState = { ...(window.history.state ?? {}), jamviHomeGuard: true };
    window.history.pushState(guardState, '', guardedUrl);

    const handleBrowserBack = () => {
      if (allowBrowserExitRef.current) {
        allowBrowserExitRef.current = false;
        return;
      }

      if (location !== '/') {
        navigate('/', { replace: true });
        return;
      }

      const leave = window.confirm(
        'You are at Home, the beginning of Jamvi. Do you want to leave the application?',
      );
      if (leave) {
        allowBrowserExitRef.current = true;
        window.history.back();
        return;
      }

      window.history.pushState(guardState, '', guardedUrl);
    };

    window.addEventListener('popstate', handleBrowserBack);
    return () => window.removeEventListener('popstate', handleBrowserBack);
  }, [location, navigate]);

  const isSharedWorkspace = group?.isPrivate === false;
  const workspaceContextLabel = group ? (isSharedWorkspace ? 'Shared budget' : 'Personal budget') : 'Select a budget';
  const activeWorkspaceRole = group?.role ?? (group?.isPrivate ? 'owner' : 'member');
  const activeWorkspaceRoleLabel = activeWorkspaceRole === 'owner'
    ? 'Owner'
    : activeWorkspaceRole === 'admin'
      ? 'Admin'
      : 'Member';
  const sharedTransactionsLocked =
    group?.isPrivate === false &&
    group?.canRecordSharedTransactions === false &&
    members.length < 2;

  const openQuickLog = (action: 'income' | 'expense' | 'goal' | 'budget') => {
    if (sharedTransactionsLocked && (action === 'expense' || action === 'goal')) return;
    setIsQuickLogOpen(false);
    setIsMobileMenuOpen(false);
    if (action === 'budget') {
      navigate('/budget');
      return;
    }
    if (location === '/') {
      window.dispatchEvent(new CustomEvent('jamvi:quick-log', { detail: action }));
      return;
    }
    navigate(action === 'income' ? '/?quick=income' : action === 'expense' ? '/?quick=expense' : '/?quick=goal');
  };

  const navItems = [
    { href: '/', label: isSharedWorkspace ? 'Group Overview' : 'My Overview', icon: LayoutDashboard },
    { href: '/expenses', label: isSharedWorkspace ? 'Group Expenses' : 'My Expenses', icon: Receipt },
    { href: '/budget', label: isSharedWorkspace ? 'Group Budget' : 'My Budget', icon: PieChart },
    { href: '/activity', label: isSharedWorkspace ? 'Group Activity' : 'My Activity', icon: Activity },
    { href: '/savings-goals', label: isSharedWorkspace ? 'Group Goals' : 'My Goals', icon: Target },
    { href: '/bank', label: 'Bank accounts', icon: Landmark },
    { href: '/reports', label: isSharedWorkspace ? 'Group Reports' : 'My Reports', icon: BarChart3 },
    { href: '/search', label: 'Search', icon: Search },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex min-h-screen w-full max-w-full overflow-x-hidden bg-background text-foreground selection:bg-primary/20">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border h-screen sticky top-0">
        <div className="p-6">
            <div className="flex h-10 w-40 items-center justify-center rounded-xl bg-brand-surface px-2 shadow-sm">
            <BrandLogo className="h-8 w-full" alt="Jamvi — personal and shared budgeting" />
          </div>
          <div className="mt-2 min-w-0">
            <span className="block text-[11px] font-medium text-sidebar-foreground/70">Personal & shared money, together</span>
            <span className="mt-1 flex items-center gap-1.5 truncate text-xs text-sidebar-foreground/60"><span className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', isSharedWorkspace ? 'bg-[#087F8C]' : 'bg-sidebar-primary')} aria-hidden="true" />{group ? workspaceLabel(group) : 'My budget'}</span>
            <span className="mt-1 inline-flex rounded-full border border-sidebar-border bg-sidebar-accent/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground/80">{workspaceContextLabel}</span>
          </div>
        </div>
        {location !== '/' && (
          <div className="px-6">
            <WorkspaceSwitcher activeWorkspaceId={group?.id} className="w-full" />
          </div>
        )}

        <nav className="flex-1 px-4 space-y-1 mt-4">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className="block">
                <div className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium",
                  isActive 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm" 
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}>
                  <item.icon className={cn("w-5 h-5", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/60")} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border mt-auto">
          <div className="flex items-center gap-3 mb-4 px-2">
            <ProfileAvatar user={user} className="h-10 w-10 border border-sidebar-border bg-sidebar-accent text-sidebar-primary" textClassName="text-sm" alt={user?.firstName ?? 'User'} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'User'}</p>
              <p className="text-xs text-sidebar-foreground/60 capitalize truncate">{activeWorkspaceRoleLabel}</p>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={logout}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-sidebar border-b border-sidebar-border z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2 text-sidebar-foreground">
           <div className="flex h-8 w-28 items-center justify-center rounded-lg bg-brand-surface px-1.5">
            <BrandLogo className="h-6 w-full" alt="Jamvi — personal and shared budgeting" />
          </div>
          <div className="min-w-0">
            <span className="block max-w-36 truncate text-[10px] text-sidebar-foreground/60">{group ? workspaceLabel(group) : 'My budget'}</span>
            <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.1em] text-sidebar-primary">{workspaceContextLabel}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-sidebar-foreground"
          aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="isolate fixed inset-x-0 top-16 z-[70] flex h-[calc(100dvh-4rem)] flex-col overflow-hidden bg-sidebar md:hidden"
          onClick={(e) => { if (e.target === e.currentTarget) setIsMobileMenuOpen(false); }}
        >
          <nav className="min-h-0 flex-1 overscroll-contain overflow-y-auto p-4 pb-6 space-y-2">
            <div className="mb-4 space-y-2">
              <p className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-sidebar-primary">Switch budget</p>
              <p className="px-1 text-xs leading-relaxed text-sidebar-foreground/65">
                Choose Personal or Shared budget to change the money view.
              </p>
              <WorkspaceSwitcher
                activeWorkspaceId={group?.id}
                variant="mobile"
                className="w-full"
                onWorkspaceSwitchRequested={() => setIsMobileMenuOpen(false)}
              />
            </div>
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href} className="block" onClick={() => setIsMobileMenuOpen(false)}>
                  <div className={cn(
                    "flex items-center gap-3 px-4 py-4 rounded-xl text-lg font-medium",
                    isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80"
                  )}>
                    <item.icon className={cn("w-6 h-6", isActive ? "text-sidebar-primary" : "")} />
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>
          <div className="shrink-0 border-t border-sidebar-border bg-sidebar p-6">
            <Button variant="outline" className="w-full h-12 text-lg border-sidebar-border text-sidebar-foreground bg-transparent hover:bg-sidebar-accent" onClick={logout}>
              <LogOut className="w-5 h-5 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      )}

      {/* Persistent quick logging control */}
      {!isMobileMenuOpen && (
      <div className="fixed bottom-5 right-4 z-50 flex flex-col items-end gap-3 md:bottom-7 md:right-7">
        {isQuickLogOpen && (
          <div
            role="menu"
            aria-label="Quick log options"
            className="w-64 overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-2xl"
          >
            <div className="px-3 pb-2 pt-2">
              <p className="text-sm font-bold text-foreground">Quick log</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Record money without leaving the page you are on.</p>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => openQuickLog('expense')}
              disabled={sharedTransactionsLocked}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <Receipt className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">Log expense</span>
                <span className="block text-xs text-muted-foreground">Record spending now</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => openQuickLog('income')}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                <Landmark className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">Bank deposit</span>
                <span className="block text-xs text-muted-foreground">Record money received</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => openQuickLog('budget')}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
                <PieChart className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">Budget</span>
                <span className="block text-xs text-muted-foreground">Plan monthly spending</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => openQuickLog('goal')}
              disabled={sharedTransactionsLocked}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
                <Target className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">Save to goal</span>
                <span className="block text-xs text-muted-foreground">Move money toward a goal</span>
              </span>
            </button>
            {sharedTransactionsLocked && (
              <p className="mx-1 mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                Invite one more member before recording shared expenses or goal contributions.
              </p>
            )}
          </div>
        )}
        <Button
          type="button"
          onClick={() => setIsQuickLogOpen((isOpen) => !isOpen)}
          aria-expanded={isQuickLogOpen}
          aria-label={isQuickLogOpen ? 'Close quick log' : 'Open quick log'}
          className="h-12 rounded-full px-4 shadow-xl md:h-14 md:px-5"
        >
          {isQuickLogOpen ? <X className="mr-2 h-5 w-5" aria-hidden="true" /> : <Plus className="mr-2 h-5 w-5" aria-hidden="true" />}
          <span className="text-sm font-bold">Quick log</span>
        </Button>
      </div>
      )}

      {/* Main Content */}
      <main className="min-w-0 flex-1 flex flex-col min-h-screen pb-24 pt-16 md:pb-0 md:pt-0">
        <div className="min-w-0 flex-1 w-full max-w-6xl mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
