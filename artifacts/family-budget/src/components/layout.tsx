import { Link, useLocation } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { LayoutDashboard, Receipt, PieChart, Activity, LogOut, Menu, X, Settings, Target, Landmark, BarChart3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useGetGroup } from '@workspace/api-client-react';
import { WorkspaceSwitcher, workspaceLabel } from '@/components/workspace-switcher';

export function Layout({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { data: group } = useGetGroup();

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

  const navItems = [
    { href: '/', label: isSharedWorkspace ? 'Group Overview' : 'Personal budget', icon: LayoutDashboard },
    { href: '/expenses', label: isSharedWorkspace ? 'Group Expenses' : 'My Expenses', icon: Receipt },
    { href: '/budget', label: isSharedWorkspace ? 'Group Budget' : 'Personal budget', icon: PieChart },
    { href: '/activity', label: isSharedWorkspace ? 'Group Activity' : 'My Activity', icon: Activity },
    { href: '/savings-goals', label: isSharedWorkspace ? 'Group Goals' : 'My Goals', icon: Target },
    { href: '/bank', label: isSharedWorkspace ? 'Joint Account' : 'My Account', icon: Landmark },
    { href: '/reports', label: isSharedWorkspace ? 'Group Reports' : 'My Reports', icon: BarChart3 },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground selection:bg-primary/20 overflow-x-hidden">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border h-screen sticky top-0">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-sidebar-primary rounded-xl flex items-center justify-center shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-sidebar-primary-foreground">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
            </svg>
          </div>
          <div className="min-w-0">
            <span className="block font-display font-bold text-xl tracking-tight">Bajeti</span>
            <span className="block truncate text-xs text-sidebar-foreground/60">{group ? workspaceLabel(group) : 'Personal budget'}</span>
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
            <span className="block font-display font-bold text-lg leading-none">Bajeti</span>
            <span className="block max-w-36 truncate text-[10px] text-sidebar-foreground/60">{group ? workspaceLabel(group) : 'Personal budget'}</span>
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

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen pt-16 md:pt-0">
        <div className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
