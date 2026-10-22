import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getProcesses, getTaxonomy, GetProcessesOutputType } from 'zitejs/api';
import { Workflow, Boxes, Plus, Network, LayoutGrid, List, Search } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Skeleton } from '@project/components/ui/skeleton';
import type { ElementSummary, ElementType } from '@/types';
import { TYPE_KEYS } from '@/lib/typeKeys';
import CreateProcessDialog from './CreateProcessDialog';
import ElementDialog from './ElementDialog';
import DeleteElementDialog from './DeleteElementDialog';
import DeleteProcessDialog from './DeleteProcessDialog';
import EditProcessDialog from './EditProcessDialog';
import ElementsTable from './ElementsTable';
import ProcessesTable from './ProcessesTable';
import VersionFooter from './VersionFooter';
import ProcessCards from './ProcessCards';
import Welcome from './Welcome';
import PreviewSwitcher from './PreviewSwitcher';
import { useMe } from '@/lib/me';

type ProcessRow = GetProcessesOutputType['processes'][number];

const SEG_TRACK = 'flex shrink-0 rounded-lg bg-muted p-0.5 text-xs';
const segBtn = (active: boolean) =>
  `inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-all ${
    active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
  }`;

const storedFlag = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const storeFlag = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* it just shows again next time */
  }
};

const greetingFor = (date: Date) => {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export default function WorkspaceList() {
  const navigate = useNavigate();
  const { canEdit, isAdmin, me, welcomeSeen, markWelcomeSeen } = useMe();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'elements' ? 'elements' : 'processes';

  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [elements, setElements] = useState<ElementSummary[]>([]);
  const [types, setTypes] = useState<ElementType[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingElement, setCreatingElement] = useState(false);
  const [editTarget, setEditTarget] = useState<ElementSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ElementSummary | null>(null);
  const [deleteProcessTarget, setDeleteProcessTarget] = useState<ProcessRow | null>(null);
  const [editProcessTarget, setEditProcessTarget] = useState<ProcessRow | null>(null);
  /** Cards are the friendly front door; the table is still one click away. */
  const [viewChoice, setViewChoice] = useState<'cards' | 'table' | null>(() => {
    const saved = storedFlag('bpm_home_view');
    return saved === 'cards' || saved === 'table' ? saved : null;
  });
  // Editors and admins land on the table; viewers on the friendlier cards. A choice they make sticks.
  const view = viewChoice ?? (canEdit ? 'table' : 'cards');
  const [query, setQuery] = useState('');

  const chooseView = (next: 'cards' | 'table') => {
    setViewChoice(next);
    storeFlag('bpm_home_view', next);
  };


  const load = useCallback(async () => {
    const [processRes, taxonomy] = await Promise.all([getProcesses({}), getTaxonomy({})]);
    setProcesses(processRes.processes);
    setElements(taxonomy.elements);
    setTypes(taxonomy.types);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const elementCount = useMemo(
    () => elements.filter((e) => e.typeKey !== TYPE_KEYS.process).length,
    [elements],
  );

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(220_20%_98.5%)]">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 px-8 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_2px_8px_hsl(var(--primary)/0.35)]">
            <Network className="h-5 w-5" />
          </span>
          <h1 className="text-lg font-semibold tracking-tight">Business Process Mapper</h1>
          <div className="ml-auto">
            <PreviewSwitcher />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-8 py-6">
        <section className="mb-7">
          <h2 className="text-3xl font-semibold tracking-tight">
            {greetingFor(new Date())}
            {me?.firstName ? `, ${me.firstName}` : ''}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {canEdit
              ? isAdmin
                ? "You're an admin. You can edit everything."
                : 'You can edit processes. Everyone else can look around and train.'
              : 'What do you want to learn today?'}
          </p>
        </section>

        <div className="mb-5 flex items-end justify-between gap-3 border-b border-border">
          <nav className="flex gap-6">
            {(
              [
                ['processes', 'Processes', Workflow, processes.length],
                ['elements', 'Elements', Boxes, elementCount],
              ] as const
            ).map(([key, label, Icon, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSearchParams(key === 'elements' ? { tab: 'elements' } : {})}
                className={`relative -mb-px flex items-center gap-1.5 pb-3 text-sm font-medium transition-colors ${
                  tab === key
                    ? 'text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                  {count}
                </span>
              </button>
            ))}
          </nav>

          {/* The primary action sits in the same place on both tabs. */}
          <div className="mb-2 flex items-center gap-2">
            {tab === 'processes' && (
              <div className={SEG_TRACK}>
                <button className={segBtn(view === 'cards')} onClick={() => chooseView('cards')} aria-label="Cards">
                  <LayoutGrid className="h-3.5 w-3.5" /> Cards
                </button>
                <button className={segBtn(view === 'table')} onClick={() => chooseView('table')} aria-label="Table">
                  <List className="h-3.5 w-3.5" /> Table
                </button>
              </div>
            )}
            {canEdit && (
              <Button
                size="sm"
                className="h-8 shrink-0"
                onClick={() => (tab === 'processes' ? setCreating(true) : setCreatingElement(true))}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {tab === 'processes' ? 'New process' : 'New element'}
              </Button>
            )}
          </div>
        </div>

        {tab === 'processes' && view === 'cards' ? (
          <>
            {processes.length > 0 && (
              <div className="relative mb-4 w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search processes…"
                  className="h-9 pl-8 text-sm"
                />
              </div>
            )}
            {processes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Workflow className="h-6 w-6" />
                </span>
                <p className="mt-4 text-base font-semibold">
                  {canEdit ? 'Map your first process' : 'Nothing to learn yet'}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  {canEdit
                    ? 'Add the steps, who does them, and which tools they use. Your team can then train on it.'
                    : 'Processes will show up here once an admin adds them.'}
                </p>
                {canEdit && (
                  <Button className="mt-5" onClick={() => setCreating(true)}>
                    <Plus className="mr-1.5 h-4 w-4" /> New process
                  </Button>
                )}
              </div>
            ) : (
              <ProcessCards
                processes={processes.filter((p) => {
                  const q = query.trim().toLowerCase();
                  return (
                    !q ||
                    p.name.toLowerCase().includes(q) ||
                    p.description.toLowerCase().includes(q) ||
                    p.people.some((x) => x.name.toLowerCase().includes(q)) ||
                    p.apps.some((x) => x.name.toLowerCase().includes(q))
                  );
                })}
                onOpen={(processId) => navigate(`/process/${processId}`)}
                onTrain={(processId) => navigate(`/process/${processId}?train=all&view=process`)}
              />
            )}
          </>
        ) : tab === 'processes' ? (
          <ProcessesTable
            processes={processes}
            onOpen={(processId) => navigate(`/process/${processId}`)}
            onEdit={canEdit ? (p) => setEditProcessTarget(p) : undefined}
            onDelete={canEdit ? (p) => setDeleteProcessTarget(p) : undefined}
          />
        ) : (
          <ElementsTable
            elements={elements}
            types={types}
            onOpen={(id) => navigate(`/element/${id}`)}
            onEdit={canEdit ? (el) => setEditTarget(el) : undefined}
            onDelete={canEdit ? (el) => setDeleteTarget(el) : undefined}
          />
        )}
      </div>

      {creating && (
        <CreateProcessDialog
          elements={elements}
          types={types}
          onClose={() => setCreating(false)}
          onCreated={(processId) => navigate(`/process/${processId}`)}
        />
      )}

      {(creatingElement || editTarget) && (
        <ElementDialog
          key={editTarget?.id ?? 'new'}
          types={types}
          elements={elements}
          element={editTarget}
          onClose={() => {
            setCreatingElement(false);
            setEditTarget(null);
          }}
          onSaved={() => {
            setCreatingElement(false);
            setEditTarget(null);
            load();
          }}
        />
      )}

      {deleteTarget && (
        <DeleteElementDialog
          element={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            load();
          }}
        />
      )}
      {editProcessTarget && (
        <EditProcessDialog
          process={{
            id: editProcessTarget.id,
            name: editProcessTarget.name,
            ownerId: editProcessTarget.ownerId,
          }}
          elements={elements}
          types={types}
          onClose={() => setEditProcessTarget(null)}
          onSaved={() => {
            setEditProcessTarget(null);
            load();
          }}
        />
      )}
      {deleteProcessTarget && (
        <DeleteProcessDialog
          process={deleteProcessTarget}
          onClose={() => setDeleteProcessTarget(null)}
          onDeleted={() => {
            setDeleteProcessTarget(null);
            load();
          }}
        />
      )}
      {me && !isAdmin && !welcomeSeen && (
        <Welcome
          firstName={me.firstName}
          onDone={markWelcomeSeen}
        />
      )}
      <footer className="fixed bottom-3 left-4">
        <VersionFooter />
      </footer>
    </div>
  );
}
