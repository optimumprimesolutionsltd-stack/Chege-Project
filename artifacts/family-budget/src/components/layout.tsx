import { Link, useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { LayoutDashboard, Receipt, PieChart, Activity, LogOut, Menu, X, Settings, Target, Landmark, BarChart3, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useGetGroup, useGetMembers } from '@workspace/api-client-react';
import { WorkspaceSwitcher, workspaceLabel } from '@/components/workspace-switcher';

export function Layout({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isQuickLogOpen, setIsQuickLogOpen] = useState(false);
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { data: group } = useGetGroup();
  const { data: members = [] } = useGetMembers();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location]);

  const isSharedWorkspace = group?.isPrivate === false;
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

  const openQuickLog = (action: 'income' | 'expense' | 'goal') => {
    if (sharedTransactionsLocked && (action === 'expense' || action === 'goal')) return;
    setIsQuickLogOpen(false);
    setIsMobileMenuOpen(false);
    if (location === '/') {
      window.dispatchEvent(new CustomEvent('jamvi:quick-log', { detail: action }));
      return;
    }
    navigate(action === 'income' ? '/?quick=income' : action === 'expense' ? '/?quick=expense' : '/?quick=goal');
  };

  const navItems = [
    { href: '/', label: isSharedWorkspace ? 'Group Overview' : 'My budget', icon: LayoutDashboard },
    { href: '/expenses', label: isSharedWorkspace ? 'Group Expenses' : 'My Expenses', icon: Receipt },
    { href: '/budget', label: isSharedWorkspace ? 'Group Budget' : 'My budget', icon: PieChart },
    { href: '/activity', label: isSharedWorkspace ? 'Group Activity' : 'My Activity', icon: Activity },
    { href: '/savings-goals', label: isSharedWorkspace ? 'Group Goals' : 'My Goals', icon: Target },
    { href: '/bank', label: isSharedWorkspace ? 'Joint Account' : 'My Account', icon: Landmark },
    { href: '/reports', label: isSharedWorkspace ? 'Group Reports' : 'My Reports', icon: BarChart3 },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex min-h-screen w-full max-w-full overflow-x-hidden bg-background text-foreground selection:bg-primary/20">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border h-screen sticky top-0">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-sidebar-primary rounded-xl flex items-center justify-center shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-sidebar-primary-foreground">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
            </svg>
          </div>
          <div className="min-w-0">
            <span className="block font-display font-bold text-xl tracking-tight">Jamvi</span>
            <span className="block truncate text-xs text-sidebar-foreground/60">{group ? workspaceLabel(group) : 'My budget'}</span>
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
            <div className="w-10 h-10 rounded-full bg-sidebar-accent border border-sidebar-border flex items-center justify-center overflow-hidden flex-shrink-0">
              {user?.profileImageUrl ? (
                <img src={user.profileImageUrl} alt={user.firstName ?? 'User'} className="w-full h-full object-cover" />
              ) : (
                <span className="font-bold text-sidebar-primary">{user?.firstName?.charAt(0) || 'U'}</span>
              )}
            </div>
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
          <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-sidebar-primary-foreground">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
            </svg>
          </div>
          <div className="min-w-0">
            <span className="block font-display font-bold text-lg leading-none">Jamvi</span>
            <span className="block max-w-36 truncate text-[10px] text-sidebar-foreground/60">{group ? workspaceLabel(group) : 'My budget'}</span>
          </div>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-sidebar-foreground">
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-sidebar pt-16 flex flex-col" onClick={(e) => { if (e.target === e.currentTarget) setIsMobileMenuOpen(false); }}>
          <nav className="flex-1 p-4 space-y-2">
            <WorkspaceSwitcher activeWorkspaceId={group?.id} className="mb-3 w-full" />
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
          <div className="p-6 border-t border-sidebar-border">
            <Button variant="outline" className="w-full h-12 text-lg border-sidebar-border text-sidebar-foreground bg-transparent hover:bg-sidebar-accent" onClick={logout}>
              <LogOut className="w-5 h-5 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      )}

      {/* Persistent quick logging control */}
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
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
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
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
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
              onClick={() => openQuickLog('goal')}
              disabled={sharedTransactionsLocked}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
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

      {/* Main Content */}
      <main className="min-w-0 flex-1 flex flex-col min-h-screen pb-24 pt-16 md:pb-0 md:pt-0">
        <div className="min-w-0 flex-1 w-full max-w-6xl mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
