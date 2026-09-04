import { type ReactNode } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { Settings, ShieldCheck, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ParserLayoutProps {
  children: ReactNode;
}

export function ParserLayout({ children }: ParserLayoutProps) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-[100dvh] flex flex-col w-full">
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">M-Pesa Parser Laboratory</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground mr-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span>All data processed locally or securely; nothing is saved to the cloud.</span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 px-3" data-testid="button-settings">
                  <Settings className="h-4 w-4 mr-2" />
                  Appearance
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Background Theme</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTheme('default')} className="justify-between" data-testid="theme-default">
                  Default (White)
                  {theme === 'default' && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('subtle-gray')} className="justify-between" data-testid="theme-subtle-gray">
                  Subtle Gray
                  {theme === 'subtle-gray' && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('subtle-green')} className="justify-between" data-testid="theme-subtle-green">
                  Subtle Green
                  {theme === 'subtle-green' && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('subtle-blue')} className="justify-between" data-testid="theme-subtle-blue">
                  Subtle Blue
                  {theme === 'subtle-blue' && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto max-w-6xl p-4 md:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
