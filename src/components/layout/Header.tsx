'use client';

import { usePathname } from 'next/navigation';
import { Building2, LogOut, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Ltr,
  Separator,
} from '@/components/UiComponents';
import { logoutAction } from '@/actions/auth.actions';
import { pageTitleFor } from '@/lib/navigation';
import { toLocaleDigits } from '@/lib/persian';
import { t } from '@/lib/t';
import { useAuth } from './AuthProvider';
import { useSidebar } from './SidebarContext';
import { ThemeToggle } from './ThemeToggle';

export function Header() {
  const pathname = usePathname();
  const { isCollapsed, toggleCollapse, setMobileOpen } = useSidebar();
  const member = useAuth();
  const title = pageTitleFor(pathname);
  const mobile = toLocaleDigits(member.mobile);

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 w-full items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label={t('shell.openMenu')}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            onClick={toggleCollapse}
            aria-label={isCollapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-5 w-5 rtl:-scale-x-100" />
            ) : (
              <PanelLeftClose className="h-5 w-5 rtl:-scale-x-100" />
            )}
          </Button>

          <p className="truncate text-lg font-bold tracking-tight text-foreground">{title}</p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <ThemeToggle />
          <Separator orientation="vertical" className="h-6" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid="user-menu"
                aria-label={t('shell.accountMenu')}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="hidden max-w-48 text-start text-xs md:block">
                  <div className="truncate font-medium">{member.organizationName}</div>
                  <div className="text-muted-foreground">
                    <Ltr>{mobile}</Ltr>
                  </div>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-border">
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">{member.organizationName}</p>
                  <p className="text-xs text-muted-foreground">
                    <Ltr>{mobile}</Ltr>
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <form action={logoutAction}>
                <DropdownMenuItem asChild>
                  <button
                    type="submit"
                    className="w-full cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="me-2 h-4 w-4 rtl:rotate-180" />
                    {t('auth.logout')}
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
