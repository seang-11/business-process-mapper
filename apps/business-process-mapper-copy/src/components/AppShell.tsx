import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getProcesses, GetProcessesOutputType } from 'zitejs/api';
import { ChevronDown, Keyboard, Network, Search } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@project/components/ui/dropdown-menu';
import { useMe } from '@/lib/me';
import { useTrackTrail } from '@/lib/backTrail';
import CommandMenu from './CommandMenu';
import ShortcutsDialog from './ShortcutsDialog';
import PreviewSwitcher from './PreviewSwitcher';
import { PageError } from './PageState';

type ProcessRow = GetProcessesOutputType['processes'][number];

const ACCESS_WORD: Record<string, string> = { admin: 'Admin', viewer: 'Viewer' };

const initialsOf = (name: string) =>
  name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
export const MOD_KEY = isMac ? '⌘' : 'Ctrl';

/**
 * The frame around every page: one navigation bar along the top, with search,
 * the admin's View as switcher, and your profile and sign out at the right.
 * Pages get the whole width underneath, so a process map is never squeezed.
 */
export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me, isAdmin, canEdit } = useMe();

  const [menuOpen, setMenuOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [processes, setProcesses] = useState<ProcessRow[]>([]);

  // The process list feeds the Cmd+K menu. It refreshes as you move around,
  // so a new process shows up there without a reload.
  const loadProcesses = useCallback(() => {
    getProcesses({})
      .then((r) => setProcesses(r.processes))
      .catch(() => {
        /* the menu just keeps what it had */
      });
  }, []);
  useEffect(() => {
    loadProcesses();
  }, [loadProcesses, location.pathname]);

  // Remember the pages visited, so Back buttons return to where you came from.
  useTrackTrail();

  // A trackpad pinch the page didn't catch zooms the whole browser page, and that zoom
  // follows you to the next page (the edit page opened huge after zooming the Brain).
  // The Brain and the process map zoom themselves; everywhere else a pinch does nothing.
  useEffect(() => {
    const stopPageZoom = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    const stopGesture = (e: Event) => e.preventDefault(); // Safari's own pinch events
    window.addEventListener('wheel', stopPageZoom, { passive: false });
    document.addEventListener('gesturestart', stopGesture);
    document.addEventListener('gesturechange', stopGesture);
    return () => {
      window.removeEventListener('wheel', stopPageZoom);
      document.removeEventListener('gesturestart', stopGesture);
      document.removeEventListener('gesturechange', stopGesture);
    };
  }, []);

  // Cmd/Ctrl+K opens the menu from anywhere. ? opens the shortcuts list unless you are typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The jump-to menu is full of editing shortcuts, so it's for editors; viewers search their list.
      if (canEdit && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setMenuOpen((o) => !o);
        return;
      }
      const typing = (e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]');
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit]);

  const sorted = useMemo(() => [...processes].sort((a, b) => a.name.localeCompare(b.name)), [processes]);

  // Home covers the list of processes, the elements tab, and any process or element opened from them.
  const onHome =
    location.pathname === '/' ||
    location.pathname.startsWith('/process/') ||
    location.pathname.startsWith('/element/') ||
    location.pathname.startsWith('/view/');

  const links: { to: string; label: string; active: boolean }[] = [
    { to: '/', label: 'Home', active: onHome },
    { to: '/brain', label: 'Brain', active: location.pathname === '/brain' },
    { to: '/roles', label: 'Roles', active: location.pathname.startsWith('/roles') },
    { to: '/training', label: 'Training', active: location.pathname === '/training' },
    // Follows the preview: an admin previewing as a viewer sees what a viewer sees.
    ...(isAdmin ? [{ to: '/team', label: 'Team and access', active: location.pathname === '/team' }] : []),
  ];

  const name = me?.name || me?.email || 'You';
  const access = ACCESS_WORD[me?.access ?? 'viewer'];

  return (
    <div className="flex h-screen flex-col bg-[hsl(220_20%_98.5%)] print:block print:h-auto print:bg-white">
      <header className="z-30 flex h-14 shrink-0 print:hidden items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur md:px-6">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Home"
          className="flex shrink-0 items-center gap-2.5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_2px_8px_hsl(var(--primary)/0.35)]">
            <Network className="h-[18px] w-[18px]" />
          </span>
          <span className="hidden text-[15px] font-semibold tracking-tight lg:block">Process Mapper</span>
        </button>

        <nav className="ml-1 flex min-w-0 items-center gap-0.5 overflow-x-auto md:ml-3" aria-label="Main">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={() =>
                `shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  l.active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {canEdit && (
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            title={`Search or jump to (${MOD_KEY}+K)`}
            className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-sm text-muted-foreground shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:border-primary/30 hover:text-foreground md:w-52"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="hidden flex-1 text-left md:block">Search</span>
            <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium md:block">
              {MOD_KEY} K
            </kbd>
          </button>
          )}

          <PreviewSwitcher />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Your profile"
                className="flex h-9 items-center gap-2 rounded-lg pl-1 pr-2 transition-colors hover:bg-muted"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {initialsOf(name)}
                </span>
                <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <span className="block truncate text-sm font-semibold">{name}</span>
                {me?.email && me.email !== name && (
                  <span className="block truncate text-xs text-muted-foreground">{me.email}</span>
                )}
                <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {access}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
                <Keyboard className="mr-2 h-4 w-4" /> Keyboard shortcuts
                <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">?</kbd>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
        {/* A crash on one page shows a calm message here instead of a blank screen. */}
        <ErrorBoundary
          key={location.pathname}
          fallbackRender={({ resetErrorBoundary }) => (
            <div className="mx-auto max-w-xl px-8 py-16">
              <PageError
                message="This page hit a problem. Your work is safe. Try again, or go back Home."
                onRetry={resetErrorBoundary}
              />
            </div>
          )}
        >
          <Outlet />
        </ErrorBoundary>
      </main>

      <CommandMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        processes={sorted}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
