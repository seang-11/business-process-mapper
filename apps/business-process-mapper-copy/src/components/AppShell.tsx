import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { getProcesses, GetProcessesOutputType } from 'zitejs/api';
import { Network, Search } from 'lucide-react';
import { useMe } from '@/lib/me';
import { useTrackTrail } from '@/lib/backTrail';
import CommandMenu from './CommandMenu';
import ShortcutsDialog from './ShortcutsDialog';
import PreviewSwitcher from './PreviewSwitcher';
import { PageError } from './PageState';

type ProcessRow = GetProcessesOutputType['processes'][number];

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
export const MOD_KEY = isMac ? '⌘' : 'Ctrl';

/** The frame around every page: a quiet top bar, and the page underneath with a soft fade between pages. */
export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, canEdit, isRealAdmin } = useMe();

  const [menuOpen, setMenuOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [processes, setProcesses] = useState<ProcessRow[]>([]);

  const loadProcesses = useCallback(() => {
    if (!canEdit) return;
    getProcesses({})
      .then((r) => setProcesses(r.processes))
      .catch(() => {});
  }, [canEdit]);
  useEffect(() => {
    loadProcesses();
  }, [loadProcesses, location.pathname]);

  useTrackTrail();

  // The Brain and the process map zoom themselves; a stray ctrl+wheel never zooms the whole page.
  // (Phones keep normal pinch-zoom so small text can still be read.)
  useEffect(() => {
    const stopPageZoom = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    window.addEventListener('wheel', stopPageZoom, { passive: false });
    return () => window.removeEventListener('wheel', stopPageZoom);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (canEdit && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setMenuOpen((o) => !o);
        return;
      }
      const typing = (e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]');
      if (canEdit && !typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit]);

  const sorted = useMemo(() => [...processes].sort((a, b) => a.name.localeCompare(b.name)), [processes]);

  const onHome =
    location.pathname === '/' ||
    location.pathname.startsWith('/process/') ||
    location.pathname.startsWith('/element/') ||
    location.pathname.startsWith('/view/');

  const links: { to: string; label: string; active: boolean }[] = [
    { to: '/', label: 'Processes', active: onHome },
    { to: '/brain', label: 'Brain', active: location.pathname === '/brain' },
    { to: '/roles', label: 'Roles', active: location.pathname.startsWith('/roles') },
    ...(isAdmin ? [{ to: '/team', label: 'Team', active: location.pathname === '/team' }] : []),
  ];

  // One fade per top-level section, so moving inside a page doesn't flash.
  const section = '/' + (location.pathname.split('/')[1] ?? '');

  return (
    <div className="flex h-screen flex-col bg-background print:block print:h-auto print:bg-white">
      <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border/70 bg-background/80 px-4 backdrop-blur-md print:hidden md:px-6">
        <button type="button" onClick={() => navigate('/')} aria-label="Home" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[hsl(218_70%_18%)] text-primary-foreground shadow-sm">
            <Network className="h-4 w-4" />
          </span>
          <span className="hidden text-[15px] font-semibold tracking-tight sm:block">Process Mapper</span>
        </button>

        <nav className="ml-2 flex min-w-0 items-center gap-0.5 overflow-x-auto md:ml-4" aria-label="Main">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={`relative shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                l.active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {l.active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 -z-10 rounded-md bg-muted"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
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
              className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground md:w-52"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="hidden flex-1 text-left md:block">Search</span>
            </button>
          )}
          {isRealAdmin && <PreviewSwitcher />}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
        <ErrorBoundary
          key={location.pathname}
          fallbackRender={({ resetErrorBoundary }) => (
            <div className="mx-auto max-w-xl px-8 py-16">
              <PageError message="This page hit a problem. Try again, or go back Home." onRetry={resetErrorBoundary} />
            </div>
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={section}
              className="h-full"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </ErrorBoundary>
      </main>

      {canEdit && (
        <>
          <CommandMenu open={menuOpen} onOpenChange={setMenuOpen} processes={sorted} onShowShortcuts={() => setShortcutsOpen(true)} />
          <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        </>
      )}
    </div>
  );
}
