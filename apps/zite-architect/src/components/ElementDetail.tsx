import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getElementDetail, getTaxonomy, GetElementDetailOutputType } from 'zitejs/api';
import { format } from 'date-fns';
import { ArrowLeft, ArrowRight, Boxes, ChevronRight, Pencil, Trash2, Workflow } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Skeleton } from '@project/components/ui/skeleton';
import type { ElementSummary, ElementType } from '@/types';
import { ownerPhrase, partyToken, statusToken } from '@/lib/elementTokens';
import ElementIcon from './ElementIcon';
import { TokenBadge } from './TokenBadge';
import ElementDialog from './ElementDialog';
import DeleteElementDialog from './DeleteElementDialog';
import { useMe } from '@/lib/me';

type Detail = GetElementDetailOutputType;
type StepRow = Detail['steps'][number];
type OwnedRow = Detail['owns'][number];

const CAPACITY_ORDER = ['Performs', 'Uses', 'Produces', 'Expands into'];

const CAPACITY_STYLE: Record<string, string> = {
  Performs: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  Uses: 'bg-muted text-muted-foreground',
  Produces: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  'Expands into': 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
};

const CARD = 'rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]';

const prettyDate = (value: string) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? format(d, 'MMM d, yyyy') : '';
};

/** One step in one process, with every way this element takes part in it. */
interface UsedStep {
  id: string;
  title: string;
  versionId: string;
  versionName: string;
  capacities: string[];
}

interface UsedProcess {
  processId: string;
  processName: string;
  steps: UsedStep[];
}

export default function ElementDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canEdit } = useMe();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [elements, setElements] = useState<ElementSummary[]>([]);
  const [types, setTypes] = useState<ElementType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    // The taxonomy comes along for the edit dialog's type and owner pickers.
    const [res, taxonomy] = await Promise.all([getElementDetail({ id }), getTaxonomy({})]);
    setDetail(res);
    setElements(taxonomy.elements);
    setTypes(taxonomy.types);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Grouped by process, then by step: one element can take part in a step in
  // more than one way, and that reads best as tags on a single row.
  const used = useMemo<UsedProcess[]>(() => {
    const byProcess = new Map<string, UsedProcess>();
    for (const s of detail?.steps ?? ([] as StepRow[])) {
      const key = s.processId ?? 'none';
      let proc = byProcess.get(key);
      if (!proc) {
        proc = { processId: s.processId ?? '', processName: s.processName || 'No process', steps: [] };
        byProcess.set(key, proc);
      }
      let step = proc.steps.find((x) => x.id === s.id);
      if (!step) {
        step = { id: s.id, title: s.title, versionId: s.versionId, versionName: s.versionName, capacities: [] };
        proc.steps.push(step);
      }
      step.capacities.push(s.capacity);
    }
    for (const proc of byProcess.values()) {
      for (const st of proc.steps) {
        st.capacities.sort((a, b) => CAPACITY_ORDER.indexOf(a) - CAPACITY_ORDER.indexOf(b));
      }
    }
    return [...byProcess.values()].sort((a, b) => a.processName.localeCompare(b.processName));
  }, [detail]);

  const groupByType = (rows: OwnedRow[]) => {
    const map = new Map<string, OwnedRow[]>();
    for (const o of rows) {
      const list = map.get(o.typeName || 'Untyped');
      if (list) list.push(o);
      else map.set(o.typeName || 'Untyped', [o]);
    }
    return [...map.entries()];
  };

  // People reporting in and things being looked after are different questions,
  // so they get their own groups rather than one undifferentiated pile.
  const reports = useMemo(
    () => (detail?.owns ?? []).filter((o) => o.actorClass === 'Human'),
    [detail],
  );
  const owned = useMemo(
    () => (detail?.owns ?? []).filter((o) => o.actorClass !== 'Human'),
    [detail],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[hsl(220_20%_98.5%)] p-8">
        <Skeleton className="mb-6 h-8 w-64" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (!detail?.element) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">That element no longer exists.</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/?tab=elements')}>
          Back to elements
        </Button>
      </div>
    );
  }

  const el = detail.element;
  // The list row carries the reference counts the delete confirmation reads.
  const summary = elements.find((e) => e.id === el.id) ?? null;

  const stepCount = new Set(detail.steps.map((s) => s.id)).size;
  const performs = new Set(detail.steps.filter((s) => s.capacity === 'Performs').map((s) => s.id)).size;
  const tint = el.color ? `${el.color}1A` : undefined;
  const from = prettyDate(el.effectiveFrom);
  const to = prettyDate(el.effectiveTo);

  return (
    <div className="min-h-screen bg-[hsl(220_20%_98.5%)]">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 px-8 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 text-sm">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigate('/?tab=elements')}
            aria-label="Back to elements"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={() => navigate('/?tab=elements')}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Elements
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate font-medium">{el.name}</span>

          <div className="ml-auto flex items-center gap-2">
            {canEdit && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditing(true)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Button>
            )}
            {canEdit && summary && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-destructive hover:text-destructive"
                onClick={() => setDeleting(true)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-8 py-8">
        {/* Who or what this is */}
        <section className={`${CARD} flex items-start gap-5 p-6`}>
          <span
            className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-2xl border border-border/70"
            style={{ backgroundColor: tint ?? 'hsl(var(--muted))' }}
          >
            <ElementIcon
              name={el.name}
              image={el.image}
              icon={el.icon}
              typeIcon={el.typeIcon}
              color={el.color}
              size={40}
            />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-3xl font-semibold tracking-tight">{el.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium">
                <ElementIcon name={el.typeName} typeIcon={el.typeIcon} color={el.color} size={12} />
                {el.typeName || 'No type'}
              </span>
              {el.party && <TokenBadge token={partyToken(el.party)} />}
              {el.status && <TokenBadge token={statusToken(el.status)} />}
              {el.ownerName && (
                <span className="text-xs text-muted-foreground">{ownerPhrase(el.actorClass, el.ownerName)}</span>
              )}
            </div>
            {el.description ? (
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{el.description}</p>
            ) : canEdit ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-4 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Add a description
              </button>
            ) : null}
          </div>
        </section>

        {/* The shape of its role in the business */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Processes" value={used.filter((u) => u.processId).length} />
          <Stat label="Steps" value={stepCount} />
          <Stat label="Performs" value={performs} />
          <Stat label="Owns" value={detail.owns.length} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section>
            <h2 className="mb-3 text-sm font-semibold">Where it's used</h2>
            {used.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Boxes className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-medium">Not used in any process yet</p>
                <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                  Add it to a step and every process it takes part in will show up here.
                </p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/')}>
                  Browse processes
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {used.map((proc) => (
                  <div key={proc.processId || 'none'} className={`${CARD} overflow-hidden`}>
                    <button
                      type="button"
                      disabled={!proc.processId}
                      onClick={() => navigate(`/process/${proc.processId}`)}
                      className="group flex w-full items-center gap-2.5 border-b border-border/70 bg-muted/30 px-4 py-2.5 text-left transition-colors enabled:hover:bg-muted/60"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
                        <Workflow className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{proc.processName}</span>
                      <span className="text-xs text-muted-foreground">
                        {proc.steps.length} step{proc.steps.length === 1 ? '' : 's'}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-enabled:group-hover:translate-x-0.5" />
                    </button>
                    <ul className="divide-y divide-border/70">
                      {proc.steps.map((st) => (
                        <li key={st.id}>
                          <button
                            type="button"
                            onClick={() => navigate(`/process/${proc.processId}?version=${st.versionId}`)}
                            className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm">{st.title}</span>
                              {st.versionName && (
                                <span className="block truncate text-[11px] text-muted-foreground">{st.versionName}</span>
                              )}
                            </span>
                            <span className="flex shrink-0 flex-wrap justify-end gap-1">
                              {st.capacities.map((c) => (
                                <span
                                  key={c}
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CAPACITY_STYLE[c] ?? CAPACITY_STYLE.Uses}`}
                                >
                                  {c}
                                </span>
                              ))}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <section className={`${CARD} p-4`}>
              <h2 className="text-sm font-semibold">Details</h2>
              <dl className="mt-3 space-y-2.5 text-sm">
                <Row label="Type">{el.typeName || '—'}</Row>
                <Row label="Party">{el.party || '—'}</Row>
                <Row label="Status">{el.status || '—'}</Row>
                <Row label={el.actorClass === 'Human' ? 'Reports to' : 'Owner'}>
                  {el.ownerId ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/element/${el.ownerId}`)}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {el.ownerName}
                    </button>
                  ) : (
                    '—'
                  )}
                </Row>
                {(from || to) && <Row label="Active">{from || 'Always'} to {to || 'now'}</Row>}
              </dl>
            </section>

            <section className={`${CARD} p-4`}>
              <h2 className="text-sm font-semibold">Accountable for</h2>
              {detail.owns.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Nothing reports to this element, and it owns nothing.
                </p>
              ) : (
                <div className="mt-3 space-y-4">
                  {[
                    { key: 'reports', heading: 'Direct reports', rows: reports },
                    { key: 'owns', heading: 'Owns', rows: owned },
                  ]
                    .filter((s) => s.rows.length > 0)
                    .map((section) => (
                      <div key={section.key}>
                        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          {section.heading} ({section.rows.length})
                        </p>
                        {groupByType(section.rows).map(([typeName, items]) => (
                          <div key={typeName} className="mb-2">
                            <p className="mb-1 text-[11px] text-muted-foreground">{typeName}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {items.map((o) => (
                                <button
                                  key={o.id}
                                  onClick={() => navigate(`/element/${o.id}`)}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs transition-colors hover:border-primary/40"
                                >
                                  <ElementIcon
                                    name={o.name}
                                    image={o.image}
                                    icon={o.icon}
                                    typeIcon={o.typeIcon}
                                    color={o.color}
                                    size={13}
                                  />
                                  {o.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>

      {editing && (
        <ElementDialog
          types={types}
          elements={elements}
          element={{
            id: el.id,
            name: el.name,
            description: el.description,
            icon: el.icon,
            image: el.image,
            typeId: el.typeId,
            party: el.party,
            status: el.status,
            ownerId: el.ownerId,
          }}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}

      {deleting && summary && (
        <DeleteElementDialog
          element={summary}
          onClose={() => setDeleting(false)}
          onDeleted={() => navigate('/?tab=elements')}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={`${CARD} px-4 py-3`}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${value === 0 ? 'text-muted-foreground/60' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{children}</dd>
    </div>
  );
}
