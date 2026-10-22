import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { getProcesses, GetProcessesOutputType } from 'zitejs/api';
import { logout } from 'zitejs/auth';
import {
  Boxes, Keyboard, LogOut, Network, PanelLeftClose, PanelLeftOpen, Plus, Search, Workflow,
} from 'lucide-react';
import { useMe } from '@/lib/me';
import CommandMenu from './CommandMenu';
import ShortcutsDialog from './ShortcutsDialog';
import VersionFooter from './VersionFooter';

type ProcessRow = GetProcessesOutputType['processes'][number];

const COLLAPSE_KEY = 'bpm_sidebar_collapsed';
const ACCESS_WORD: Record<string, string> = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
export const MOD_KEY = isMac ? '⌘' : 'Ctrl';

/** Green when a version is live, amber while a process is still a draft. */
const statusDot = (p: ProcessRow) =>
  p.versions.some((v) => v.state === 'Current') ? 'bg-emerald-500' : 'bg-amber-400';

/**
 * The frame around every page: a sidebar to move around, the Cmd+K menu, and
 * the shortcuts list. Pages render in the space on the right.
 */
export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { me, canEdit } = useMe();

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
  const onElements = location.pathname === '/' && searchParams.get('tab') === 'elements';
  const onProcesses = location.pathname === '/' && !onElements;

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

        {/* Main places */}
        <nav className="space-y-0.5 px-3">
          <NavLink to="/" end className={() => navItem(onProcesses || location.pathname.startsWith('/process/'))} title="Processes">
            <Workflow className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1">Processes</span>
                <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                  {processes.length}
                </span>
              </>
            )}
          </NavLink>
          <NavLink
            to="/?tab=elements"
            className={() => navItem(onElements || location.pathname.startsWith('/element/'))}
            title="Elements"
          >
            <Boxes className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="flex-1">Elements</span>}
          </NavLink>
        </nav>

        {/* Every process, A to Z, one click away */}
        {!collapsed ? (
          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-5 pb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                All processes
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => navigate('/?new=process')}
                  aria-label="New process"
                  title="New process"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
              {sorted.map((p) => {
                const active = location.pathname === `/process/${p.id}`;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => navigate(`/process/${p.id}`)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                      active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(p)}`} />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1" />
        )}

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
        <Outlet />
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
