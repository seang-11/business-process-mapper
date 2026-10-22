import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getProcesses, GetProcessesOutputType } from 'zitejs/api';
import { logout } from 'zitejs/auth';
import {
  ArrowLeftRight, BarChart3, GraduationCap, Home, Keyboard, LogOut, Network, PanelLeftClose, PanelLeftOpen, Search, Users,
} from 'lucide-react';
import { useMe } from '@/lib/me';
import CommandMenu from './CommandMenu';
import ShortcutsDialog from './ShortcutsDialog';
import VersionFooter from './VersionFooter';
import { PageError } from './PageState';

type ProcessRow = GetProcessesOutputType['processes'][number];

const COLLAPSE_KEY = 'bpm_sidebar_collapsed';
const ACCESS_WORD: Record<string, string> = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
export const MOD_KEY = isMac ? '⌘' : 'Ctrl';

/**
 * The frame around every page: a sidebar to move around, the Cmd+K menu, and
 * the shortcuts list. Pages render in the space on the right.
 */
export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me, isRealAdmin } = useMe();

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [processes, setProcesses] = useState<ProcessRow[]>([]);

  // The process list feeds both the sidebar and the Cmd+K menu. It refreshes
  // as you move around, so a new process shows up without a reload.
  const loadProcesses = useCallback(() => {
    getProcesses({})
      .then((r) => setProcesses(r.processes))
      .catch(() => {
        /* the sidebar just keeps what it had */
      });
  }, []);
  useEffect(() => {
    loadProcesses();
  }, [loadProcesses, location.pathname]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* it just resets next visit */
      }
      return !c;
    });
  };

  // Cmd/Ctrl+K opens the menu from anywhere. ? opens the shortcuts list unless you are typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
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
  }, []);

  const sorted = useMemo(() => [...processes].sort((a, b) => a.name.localeCompare(b.name)), [processes]);
  // Home covers the list of processes, the elements tab, and any process or element opened from them.
  const onHome =
    location.pathname === '/' || location.pathname.startsWith('/process/') || location.pathname.startsWith('/element/');

  const navItem = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
      active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    } ${collapsed ? 'justify-center px-0' : ''}`;

  const name = me?.name || me?.email || 'You';

  return (
    <div className="flex min-h-screen bg-[hsl(220_20%_98.5%)]">
      <aside
        className={`sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200 md:flex ${
          collapsed ? 'w-[68px]' : 'w-[252px]'
        }`}
      >
        {/* Brand and collapse */}
        <div className={`flex h-16 shrink-0 items-center gap-3 px-4 ${collapsed ? 'justify-center px-0' : ''}`}>
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Home"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_2px_8px_hsl(var(--primary)/0.35)]"
          >
            <Network className="h-5 w-5" />
          </button>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">Process Mapper</span>
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Collapse sidebar"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
        {collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Expand sidebar"
            className="mx-auto mb-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        {/* Search */}
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            title={`Search or jump to (${MOD_KEY}+K)`}
            className={`flex w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-sm text-muted-foreground shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:border-primary/30 hover:text-foreground ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            <Search className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Search</span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                  {MOD_KEY} K
                </kbd>
              </>
            )}
          </button>
        </div>

        {/* Main places. Processes and elements live on Home, so they are not repeated here. */}
        <nav className="space-y-0.5 px-3">
          <NavLink to="/" end className={() => navItem(onHome)} title="Home">
            <Home className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="flex-1">Home</span>}
          </NavLink>
          <NavLink to="/overview" className={() => navItem(location.pathname === '/overview')} title="Overview">
            <BarChart3 className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="flex-1">Overview</span>}
          </NavLink>
          <NavLink to="/handoffs" className={() => navItem(location.pathname === '/handoffs')} title="Handoffs">
            <ArrowLeftRight className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="flex-1">Handoffs</span>}
          </NavLink>
          <NavLink to="/training" className={() => navItem(location.pathname === '/training')} title="Training">
            <GraduationCap className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="flex-1">Training</span>}
          </NavLink>
          {isRealAdmin && (
            <NavLink to="/team" className={() => navItem(location.pathname === '/team')} title="Team and access">
              <Users className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1">Team and access</span>}
            </NavLink>
          )}
        </nav>

        <div className="flex-1" />

        {/* Bottom: help, version, and you */}
        <div className="shrink-0 space-y-1 border-t border-border p-3">
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard shortcuts (?)"
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            <Keyboard className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Keyboard shortcuts</span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">?</kbd>
              </>
            )}
          </button>

          {!collapsed && me?.access === 'admin' && (
            <div className="px-2.5 py-1">
              <VersionFooter />
            </div>
          )}

          <div className={`flex items-center gap-2.5 rounded-lg p-1.5 ${collapsed ? 'justify-center' : ''}`}>
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
              title={collapsed ? `${name} (${ACCESS_WORD[me?.access ?? 'viewer']})` : undefined}
            >
              {initialsOf(name)}
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[13px] font-medium">{name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {ACCESS_WORD[me?.access ?? 'viewer']}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => logout()}
                  aria-label="Sign out"
                  title="Sign out"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          {collapsed && (
            <button
              type="button"
              onClick={() => logout()}
              aria-label="Sign out"
              title="Sign out"
              className="mx-auto flex rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
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
