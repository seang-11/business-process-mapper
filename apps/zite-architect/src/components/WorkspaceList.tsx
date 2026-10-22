import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getProcesses, getTaxonomy, GetProcessesOutputType } from 'zitejs/api';
import { Workflow, Boxes, Plus, LayoutGrid, Table2, Columns3, Grid3x3, Search } from 'lucide-react';
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
import ProcessCards from './ProcessCards';
import ProcessBoard from './ProcessBoard';
import ProcessGrid from './ProcessGrid';
import Welcome from './Welcome';
import { PageError } from './PageState';
import TalkItThrough from './TalkItThrough';
import { useMe } from '@/lib/me';

type ProcessRow = GetProcessesOutputType['processes'][number];

type HomeView = 'table' | 'cards' | 'board' | 'grid';

const VIEWS: { key: HomeView; label: string; Icon: typeof Table2 }[] = [
  { key: 'table', label: 'Table', Icon: Table2 },
  { key: 'cards', label: 'Cards', Icon: LayoutGrid },
  { key: 'board', label: 'Board', Icon: Columns3 },
  { key: 'grid', label: 'Grid', Icon: Grid3x3 },
];

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
  const [viewChoice, setViewChoice] = useState<HomeView | null>(() => {
    const saved = storedFlag('bpm_home_view');
    return saved === 'table' || saved === 'cards' || saved === 'board' || saved === 'grid' ? saved : null;
  });
  // The table is where everyone lands. A view they pick sticks.
  const view: HomeView = viewChoice ?? 'table';
  const [query, setQuery] = useState('');

  const chooseView = (next: HomeView) => {
    setViewChoice(next);
    storeFlag('bpm_home_view', next);
  };


  const [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      const [processRes, taxonomy] = await Promise.all([getProcesses({}), getTaxonomy({})]);
      setProcesses(processRes.processes);
      setElements(taxonomy.elements);
      setTypes(taxonomy.types);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Cmd+K and the sidebar open the new-process form by linking here with ?new=process.
  useEffect(() => {
    if (searchParams.get('new') !== 'process' || !me) return;
    if (canEdit) setCreating(true);
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, canEdit, me]);

  // Departments already in use, offered as suggestions in the process forms.
  const departments = useMemo(
    () => [...new Set(processes.map((p) => p.department).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [processes],
  );

  const elementCount = useMemo(
    () => elements.filter((e) => e.typeKey !== TYPE_KEYS.process).length,
    [elements],
  );

  if (loadFailed && processes.length === 0) {
    return (
      <div className="min-h-full p-8">
        <PageError
          onRetry={() => {
            setLoading(true);
            load();
          }}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-full p-8">
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
    <div className="min-h-full bg-[hsl(220_20%_98.5%)]">
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

        {canEdit && <TalkItThrough />}

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
                {VIEWS.map(({ key, label, Icon }) => (
                  <button key={key} className={segBtn(view === key)} onClick={() => chooseView(key)} aria-label={label}>
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
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

        {tab === 'processes' && view !== 'table' ? (
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
              (() => {
                const q = query.trim().toLowerCase();
                const visible = processes.filter(
                  (p) =>
                    !q ||
                    p.name.toLowerCase().includes(q) ||
                    p.description.toLowerCase().includes(q) ||
                    p.people.some((x) => x.name.toLowerCase().includes(q)) ||
                    p.apps.some((x) => x.name.toLowerCase().includes(q)),
                );
                const open = (processId: string) => navigate(`/process/${processId}`);
                const train = (processId: string) => navigate(`/process/${processId}?train=all&view=process`);
                if (visible.length === 0) {
                  return <p className="py-12 text-center text-sm text-muted-foreground">No processes match that search.</p>;
                }
                return view === 'board' ? (
                  <ProcessBoard processes={visible} onOpen={open} onTrain={train} canMove={canEdit} onChanged={load} />
                ) : view === 'grid' ? (
                  <ProcessGrid processes={visible} onOpen={open} />
                ) : (
                  <ProcessCards processes={visible} onOpen={open} onTrain={train} />
                );
              })()
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
          departments={departments}
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
            backupOwnerId: editProcessTarget.backupOwnerId,
            department: editProcessTarget.department,
          }}
          elements={elements}
          types={types}
          departments={departments}
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
    </div>
  );
}
