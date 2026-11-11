import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  getBrain,
  GetBrainOutputType,
  getProcesses,
  GetProcessesOutputType,
  getProcessGraph,
  GetProcessGraphOutputType,
  getTaxonomy,
} from 'zitejs/api';
import { AppWindow, ArrowLeft, ArrowRight, FileText, LayoutGrid, MousePointerClick, PlayCircle, Search, Users, Workflow } from 'lucide-react';
import { flowLayout } from '@/lib/brainFlow';
import { deptTag } from '@/lib/deptColors';
import { processIcon } from '@/lib/processIcon';
import { useBack } from '@/lib/backTrail';
import { FlowView } from './Brain';
import { PageEmpty, PageError, PageLoading } from './PageState';
import Train from './Train';
import StepPanel from './StepPanel';
import SwimlaneDiagram, { type LaneGrouping } from './SwimlaneDiagram';
import ProcessPopup from './ProcessPopup';
import WatchLive from './WatchLive';
import type { ElementSummary, ProcessStep } from '@/types';

type Data = GetBrainOutputType;

/** The company's processes, loaded once for both viewer pages. */
function useBrain() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    getBrain({}).then(setData).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { data, failed, load };
}

/**
 * What a viewer sees first, and almost all they see: one short list of the
 * processes that are live, grouped by department. Click one to see its steps.
 */
export function ViewerHome() {
  const navigate = useNavigate();
  const { data, failed, load } = useBrain();
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<'all' | 'current' | 'future'>('all');

  const hues = useMemo(() => new Map((data?.departments ?? []).map((d) => [d.name, d.hue])), [data]);
  const groups = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const live = data.processes.filter(
      (p) =>
        p.stepCount > 0 &&
        (show === 'all' || (show === 'current' ? p.live : !p.live || !!p.futureFlow)) &&
        (!q || p.name.toLowerCase().includes(q)),
    );
    const byDept = new Map<string, typeof live>();
    for (const p of live) {
      const key = p.department || '';
      byDept.set(key, [...(byDept.get(key) ?? []), p]);
    }
    return [...byDept.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  }, [data, query, show]);

  const total = groups.reduce((n, [, procs]) => n + procs.length, 0);
  return (
    <div className="mx-auto max-w-[880px] px-6 py-10">
      {/* A soft branded banner, so the page greets you with a bit of color. */}
      <header className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.12] via-primary/[0.04] to-card px-7 py-7 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-2xl" aria-hidden="true" />
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_2px_8px_hsl(var(--primary)/0.35)]">
          <Workflow className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-[28px] font-semibold tracking-tight">Welcome to the process map</h1>
        <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Click any process to see every step: who does it, which tools they use, and what happens next. Switch between how it runs today and how it will run in the future.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search processes"
          className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
        />
      </div>
      <div className="flex shrink-0 rounded-xl border border-border bg-card p-1 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        {(['all', 'current', 'future'] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={show === k}
            onClick={() => setShow(k)}
            className={`flex-1 rounded-lg px-3.5 py-1.5 font-medium capitalize transition-colors ${
              show === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {k}
          </button>
        ))}
      </div>
      </div>

      <div className="mt-8 space-y-8">
        {failed ? (
          <PageError onRetry={load} />
        ) : !data ? (
          <PageLoading blocks={3} height="h-32" />
        ) : total === 0 ? (
          query ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No process matches "{query}".</p>
          ) : (
            <PageEmpty icon={<Search className="h-6 w-6" />} title="Nothing to see here yet" text={show === 'all' ? 'Processes show up here once they are mapped.' : `No ${show} processes yet. Try All.`} />
          )
        ) : (
          groups.map(([dept, procs]) => (
            <section key={dept || '~'}>
              <h2 className="mb-2.5 flex items-center gap-2 px-1">
                <span
                  className="rounded-full px-2.5 py-0.5 text-[13px] font-semibold"
                  style={deptTag(dept ? hues.get(dept) : undefined)}
                >
                  {dept || 'Other'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {procs.length} {procs.length === 1 ? 'process' : 'processes'}
                </span>
                {dept && (
                  <button
                    type="button"
                    onClick={() => navigate(`/brain?dept=${encodeURIComponent(dept)}`)}
                    className="group/dept ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm transition-shadow hover:shadow-md"
                    style={{
                      color: `hsl(${hues.get(dept) ?? 217} 50% 36%)`,
                      backgroundColor: `hsl(${hues.get(dept) ?? 217} 80% 96%)`,
                      borderColor: `hsl(${hues.get(dept) ?? 217} 60% 86%)`,
                    }}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span className="group-hover/dept:underline">View department</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/dept:translate-x-0.5" />
                  </button>
                )}
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                {procs.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/view/${p.id}${show === 'future' && p.live && p.futureFlow ? '?ver=future' : ''}`)}
                      className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/40"
                    >
                      {/* Each process wears its department's color, so the list has some life and groups read at a glance. */}
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={deptTag(dept ? hues.get(dept) : undefined)}
                      >
                        {(() => {
                          const Icon = processIcon(p);
                          return <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />;
                        })()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{p.name}</span>
                        {p.description && (
                          <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{p.description}</span>
                        )}
                      </span>
                      <span className="hidden w-44 shrink-0 text-[13px] text-muted-foreground md:block">
                        {p.ownerName && (
                          <span className="block truncate">
                            <span className="text-muted-foreground/70">Owner</span> {p.ownerName}
                          </span>
                        )}
                        <span className="block">{p.stepCount} steps</span>
                      </span>
                      <span className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.live ? 'bg-emerald-50 text-emerald-700' : 'bg-accent text-accent-foreground'}`}>
                          {p.live ? 'Current' : 'Future'}
                        </span>
                        {p.live && p.futureFlow && (
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">Future version ready</span>
                        )}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-[13px] font-medium text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                        View <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

type Look = 'flow' | LaneGrouping | 'overview' | 'watch';
const LOOKS: { key: Look; label: string; Icon: typeof Workflow }[] = [
  { key: 'flow', label: 'Steps', Icon: Workflow },
  { key: 'people', label: 'By person', Icon: Users },
  { key: 'app', label: 'By app', Icon: AppWindow },
  { key: 'overview', label: 'Overview', Icon: FileText },
  { key: 'watch', label: 'Watch it Live', Icon: PlayCircle },
];

/**
 * One process, view only. It opens the way the Brain shows it: every step left
 * to right with its arrows. A switch at the top shows the same live process as
 * swim lanes, one lane per person or per app.
 */
export function ViewerProcess() {
  const { id } = useParams();
  const navigate = useNavigate();
  const back = useBack('/', 'Home');
  const [params, setParams] = useSearchParams();
  const asked = params.get('lanes');
  const look: Look = asked === 'people' || asked === 'app' || asked === 'overview' || asked === 'watch' ? asked : 'flow';
  const wantFuture = params.get('ver') === 'future';
  const setParam = (key: string, value: string | null) =>
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      if (value) n.set(key, value);
      else n.delete(key);
      return n;
    }, { replace: true });
  const setLook = (next: Look) => setParam('lanes', next === 'flow' ? null : next);
  const { data, failed, load } = useBrain();
  const base = data?.processes.find((x) => x.id === id && x.stepCount > 0) ?? null;
  const showFuture = !!(wantFuture && base?.futureFlow);
  // The process as it should be drawn: the live version, or its future version when switched.
  const p = useMemo(
    () => (base && showFuture && base.futureFlow ? { ...base, steps: base.futureFlow.steps, links: base.futureFlow.links } : base),
    [base, showFuture],
  );
  const versionId = showFuture ? base?.futureFlow?.versionId : base?.versionId;
  const [openStepId, setOpenStepId] = useState<string | null>(null);
  useEffect(() => setOpenStepId(null), [id, versionId]);
  const openStep = p?.steps.find((s) => s.id === openStepId) ?? null;
  const names = useMemo(() => new Map((data?.processes ?? []).map((x) => [x.id, x.name])), [data]);
  const layout = useMemo(() => (p ? flowLayout(p.steps.map((s) => s.id), p.links) : null), [p]);
  const runBy = useMemo(
    () => (data && p ? data.processes.filter((x) => x.runs.some((r) => r.processId === p.id)).map((x) => x.name) : []),
    [data, p],
  );

  // The swim lanes need the full map of the live version. Loaded the first time they're asked for.
  const [lanes, setLanes] = useState<{ graph: GetProcessGraphOutputType; elements: ElementSummary[] } | null>(null);
  const [lanesFailed, setLanesFailed] = useState(false);
  useEffect(() => {
    setLanes(null);
  }, [id, versionId]);
  useEffect(() => {
    if (look === 'flow' || look === 'overview' || lanes || !id) return;
    setLanesFailed(false);
    Promise.all([getProcessGraph(versionId ? { versionId } : { processId: id }), getTaxonomy({})])
      .then(([graph, tax]) => setLanes({ graph, elements: tax.elements as ElementSummary[] }))
      .catch(() => setLanesFailed(true));
  }, [look, lanes, id, versionId]);

  return (
    <div className="flex h-full flex-col px-6 py-6">
      {/* Back, then the ways to look at it, side by side on the left where they're easy to find. */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={back.go}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {back.name === 'Home' ? 'All processes' : `Back to ${back.name}`}
        </button>
        {p && (
          <div className="flex flex-wrap rounded-xl border border-border bg-card p-1 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            {LOOKS.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setLook(key)}
                aria-pressed={look === key}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  look === key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* The same name, badge and description over every view, so switching views never changes the heading. */}
      {p && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{p.name}</h1>
          {base?.futureFlow ? (
            <div className="flex rounded-lg border border-border bg-card p-0.5 text-xs font-medium">
              {[
                { key: false, label: 'Current' },
                { key: true, label: 'Future' },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={showFuture === o.key}
                  onClick={() => setParam('ver', o.key ? 'future' : null)}
                  className={`rounded-md px-2.5 py-1 transition-colors ${
                    showFuture === o.key ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.live ? 'bg-emerald-50 text-emerald-700' : 'bg-accent text-accent-foreground'}`}>
              {p.live ? 'Current' : 'Future'}
            </span>
          )}
          {(look === 'flow' || look === 'people' || look === 'app') && (
            <span className="ml-auto hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
              <MousePointerClick className="h-3.5 w-3.5" /> Click any step for details
            </span>
          )}
        </div>
      )}
      {p?.description && <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{p.description}</p>}
      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
      <div className="min-h-0 min-w-0 flex-1">
        {failed ? (
          <PageError onRetry={load} />
        ) : !data ? (
          <PageLoading blocks={1} height="h-64" />
        ) : !p || !layout ? (
          <PageEmpty icon={<Search className="h-6 w-6" />} title="That process isn't available" text="It may have been removed. Go back to see all processes." />
        ) : look === 'flow' ? (
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
            <div className="overflow-x-auto">
              <div className="relative" style={{ width: Math.max(layout.width, 600), height: layout.height }}>
                <FlowView
                  p={p}
                  rect={{ x: 0, y: 0, w: layout.width, h: layout.height }}
                  layout={layout}
                  lens={null}
                  names={names}
                  runBy={runBy}
                  onJump={(next) => navigate(`/view/${next}`)}
                  onStepClick={setOpenStepId}
                  hideTitle
                />
              </div>
            </div>
          </section>
        ) : look === 'overview' ? (
          <div className="h-full overflow-y-auto pb-8">
            <ProcessPopup
              variant="page"
              p={p}
              hue={p.department ? data.departments.find((d) => d.name === p.department)?.hue : undefined}
              hours={(() => {
                const mins = p.steps.reduce(
                  (n, s) => n + (s.who?.kind === 'person' && s.who.party !== 'External' && s.stepType !== 'Wait' && !s.subProcessId ? s.minutes ?? 0 : 0),
                  0,
                );
                return p.runsPerMonth && mins ? (mins * p.runsPerMonth) / 60 : null;
              })()}
              names={names}
              runBy={data.processes.filter((x) => x.live && x.runs.some((r) => r.processId === p.id)).map((x) => ({ id: x.id, name: x.name }))}
              canEdit={false}
              onJump={(next) => navigate(`/view/${next}`)}
            />
          </div>
        ) : lanesFailed ? (
          <PageError onRetry={() => setLanesFailed(false)} />
        ) : !lanes ? (
          <PageLoading blocks={1} height="h-64" />
        ) : look === 'watch' ? (
          <WatchLive steps={lanes.graph.steps as ProcessStep[]} connections={lanes.graph.connections} processName={p.name} />
        ) : (
          <section className="relative h-full min-h-[480px] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
            <SwimlaneDiagram
              steps={lanes.graph.steps as ProcessStep[]}
              connections={lanes.graph.connections}
              grouping={look as LaneGrouping}
              elements={lanes.elements}
              onClickStep={(st) => setOpenStepId(st.id)}
              onOpenSubProcess={(next) => navigate(`/view/${next}`)}
              laneOrder={lanes.graph.laneOrder?.[look as LaneGrouping] ?? []}
              viewKey={`${lanes.graph.version?.id ?? id}-${look}`}
            />
          </section>
        )}
      </div>
      {p && openStep && look !== 'overview' && look !== 'watch' && (
        <div className="max-h-[70vh] md:max-h-none">
          <StepPanel
            step={openStep}
            steps={p.steps}
            links={p.links}
            names={names}
            onPick={setOpenStepId}
            onJump={(next) => navigate(`/view/${next}`)}
            onClose={() => setOpenStepId(null)}
          />
        </div>
      )}
      </div>
    </div>
  );
}

/**
 * For a viewer, every link to a process page lands here. A training link
 * (?train=…) opens training on its own; anything else shows the process
 * view only. So the Brain, Roles and Training pages work for viewers without
 * ever opening the editable map.
 */
export function ViewerProcessGate() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // Hooks before any early return.
  const { go: back } = useBack('/', 'Home');
  const train = params.get('train');
  const view = params.get('view');
  const [procs, setProcs] = useState<GetProcessesOutputType['processes'] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!train) return;
    getProcesses({}).then((r) => setProcs(r.processes)).catch(() => setFailed(true));
  }, [train]);

  if (!train) return <Navigate to={`/view/${id}`} replace />;
  if (failed) return <div className="mx-auto max-w-xl px-8 py-16"><PageError /></div>;
  if (!procs) return <div className="px-8 py-8"><PageLoading blocks={1} height="h-64" /></div>;
  const p = procs.find((x) => x.id === id);
  const live = p?.versions.find((v) => v.state === 'Current');
  if (!p || !live) return <Navigate to="/" replace />;
  return (
    <Train
      processName={p.name}
      processDescription={p.description}
      versions={p.versions.filter((v) => v.state === 'Current')}
      initialVersionId={live.id}
      initialRole={train === 'all' ? null : train}
      initialView={view === 'brief' ? 'brief' : view === 'lesson' ? 'lesson' : 'process'}
      onClose={back}
      onOpenStep={() => navigate(`/view/${p.id}`)}
    />
  );
}
