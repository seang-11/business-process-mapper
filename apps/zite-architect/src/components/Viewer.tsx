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
import { AppWindow, ArrowLeft, ArrowRight, FileText, Search, Users, Workflow } from 'lucide-react';
import { flowLayout } from '@/lib/brainFlow';
import { useMe } from '@/lib/me';
import { FlowView, MixBar } from './Brain';
import { PageEmpty, PageError, PageLoading } from './PageState';
import { hueFor } from './RoleAvatar';
import Train from './Train';
import SwimlaneDiagram, { type LaneGrouping } from './SwimlaneDiagram';
import ProcessTimeline from './ProcessTimeline';
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
  const { me } = useMe();
  const { data, failed, load } = useBrain();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const live = data.processes.filter((p) => p.live && p.stepCount > 0 && (!q || p.name.toLowerCase().includes(q)));
    const byDept = new Map<string, typeof live>();
    for (const p of live) {
      const key = p.department || '';
      byDept.set(key, [...(byDept.get(key) ?? []), p]);
    }
    return [...byDept.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  }, [data, query]);

  const first = me?.firstName?.trim();
  return (
    <div className="mx-auto max-w-[760px] px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{first ? `How we work, ${first}` : 'How we work'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pick a process to see every step.</p>
        </div>
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a process"
            className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>

      <div className="mt-6">
        {failed ? (
          <PageError onRetry={load} />
        ) : !data ? (
          <PageLoading blocks={3} height="h-16" />
        ) : groups.length === 0 ? (
          query ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No process matches that.</p>
          ) : (
            <PageEmpty icon={<Search className="h-6 w-6" />} title="Nothing to see yet" text="Processes show up here once they go live." />
          )
        ) : (
          groups.map(([dept, procs]) => (
            <section key={dept || '~'} className="mb-5">
              <p className="mb-1 flex items-center gap-1.5 px-3 text-xs font-medium text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dept ? `hsl(${hueFor(dept)} 60% 55%)` : 'hsl(var(--muted-foreground))' }} />
                {dept || 'Other'}
              </p>
              <ul>
                {procs.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/view/${p.id}`)}
                      className="group grid w-full grid-cols-[minmax(0,1fr)_auto_96px_16px] items-center gap-4 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-card hover:shadow-[0_1px_3px_rgba(16,24,40,0.06)]"
                    >
                      <span className="truncate text-sm font-medium">{p.name}</span>
                      <span className="hidden text-xs text-muted-foreground sm:block">
                        {p.stepCount} steps{p.ownerName ? ` · ${p.ownerName}` : ''}
                      </span>
                      <MixBar a={p.automated} r={p.review} m={p.manual} />
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
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

type Look = 'flow' | LaneGrouping | 'overview';
const LOOKS: { key: Look; label: string; Icon: typeof Workflow }[] = [
  { key: 'flow', label: 'Steps', Icon: Workflow },
  { key: 'people', label: 'Swim lanes by person', Icon: Users },
  { key: 'app', label: 'Swim lanes by app', Icon: AppWindow },
  { key: 'overview', label: 'Overview', Icon: FileText },
];

/**
 * One process, view only. It opens the way the Brain shows it: every step left
 * to right with its arrows. A switch at the top shows the same live process as
 * swim lanes, one lane per person or per app.
 */
export function ViewerProcess() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const asked = params.get('lanes');
  const look: Look = asked === 'people' || asked === 'app' || asked === 'overview' ? asked : 'flow';
  const setLook = (next: Look) => setParams(next === 'flow' ? {} : { lanes: next }, { replace: true });
  const { data, failed, load } = useBrain();
  const p = data?.processes.find((x) => x.id === id && x.live) ?? null;
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
  }, [id]);
  useEffect(() => {
    if (look === 'flow' || lanes || !id) return;
    setLanesFailed(false);
    Promise.all([getProcessGraph({ processId: id }), getTaxonomy({})])
      .then(([graph, tax]) => setLanes({ graph, elements: tax.elements as ElementSummary[] }))
      .catch(() => setLanesFailed(true));
  }, [look, lanes, id]);

  return (
    <div className="flex h-full flex-col px-6 py-6">
      {/* Back, then the ways to look at it, side by side on the left where they're easy to find. */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All processes
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
      {p && look !== 'flow' && (
        <h1 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
          {p.name}
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Live</span>
        </h1>
      )}
      {p?.description && <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{p.description}</p>}
      <div className="mt-4 min-h-0 flex-1">
        {failed ? (
          <PageError onRetry={load} />
        ) : !data ? (
          <PageLoading blocks={1} height="h-64" />
        ) : !p || !layout ? (
          <PageEmpty icon={<Search className="h-6 w-6" />} title="That process isn't available" text="It may not be live yet. Go back to see the ones that are." />
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
                />
              </div>
            </div>
          </section>
        ) : lanesFailed ? (
          <PageError onRetry={() => setLanesFailed(false)} />
        ) : !lanes ? (
          <PageLoading blocks={1} height="h-64" />
        ) : look === 'overview' ? (
          <section className="h-full min-h-[480px] overflow-hidden rounded-2xl border border-border shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
            <ProcessTimeline steps={lanes.graph.steps as ProcessStep[]} connections={lanes.graph.connections} />
          </section>
        ) : (
          <section className="relative h-full min-h-[480px] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
            <SwimlaneDiagram
              steps={lanes.graph.steps as ProcessStep[]}
              connections={lanes.graph.connections}
              grouping={look as LaneGrouping}
              elements={lanes.elements}
              onClickStep={() => {}}
              onOpenSubProcess={(next) => navigate(`/view/${next}`)}
              laneOrder={lanes.graph.laneOrder?.[look as LaneGrouping] ?? []}
              viewKey={`${lanes.graph.version?.id ?? id}-${look}`}
            />
          </section>
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
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
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
