import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBrain, GetBrainOutputType } from 'zitejs/api';
import { Brain as BrainIcon, Search } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import { PageEmpty, PageError, PageLoading } from './PageState';
import ElementIcon from './ElementIcon';

type Proc = GetBrainOutputType['processes'][number];
type Who = Proc['people'][number];

type GroupBy = 'department' | 'owner' | 'person' | 'app';
const MODES: { key: GroupBy; label: string }[] = [
  { key: 'department', label: 'Department' },
  { key: 'owner', label: 'Owner' },
  { key: 'person', label: 'Person' },
  { key: 'app', label: 'App' },
];

// The same three colors as the Overview page.
const AUTOMATED = 'hsl(152 55% 42%)';
const REVIEW = 'hsl(38 92% 52%)';
const MANUAL = 'hsl(220 9% 62%)';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface Group {
  key: string;
  title: string;
  who: Who | null;
  procs: Proc[];
}

/** Processes sorted into the sections of the chosen grouping. */
function groupsFor(procs: Proc[], by: GroupBy): Group[] {
  const map = new Map<string, Group>();
  const put = (key: string, title: string, who: Who | null, p: Proc) => {
    const g = map.get(key);
    if (g) g.procs.push(p);
    else map.set(key, { key, title, who, procs: [p] });
  };
  for (const p of procs) {
    if (by === 'department') put(p.department || '~none', p.department || 'No department yet', null, p);
    else if (by === 'owner') put(p.ownerName || '~none', p.ownerName || 'No owner yet', null, p);
    else if (by === 'person') for (const w of p.people) put(w.id, w.name, w, p);
    else for (const a of p.apps) put(a.id, a.name, a, p);
  }
  // Named groups first, A to Z. "Nothing yet" comes last. People and apps with the most processes first.
  return [...map.values()].sort((a, b) => {
    const none = (g: Group) => (g.key === '~none' ? 1 : 0);
    if (none(a) !== none(b)) return none(a) - none(b);
    if (by === 'person' || by === 'app') return b.procs.length - a.procs.length || a.title.localeCompare(b.title);
    return a.title.localeCompare(b.title);
  });
}

function MixBar({ p }: { p: Proc }) {
  const total = p.automated + p.review + p.manual;
  if (total === 0) return <div className="h-1.5 rounded-full bg-muted" />;
  const part = (n: number, color: string) => n > 0 && <div style={{ width: `${(n / total) * 100}%`, backgroundColor: color }} />;
  return (
    <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" title={`${p.automated} automated, ${p.review} review, ${p.manual} by hand`}>
      {part(p.automated, AUTOMATED)}
      {part(p.review, REVIEW)}
      {part(p.manual, MANUAL)}
    </div>
  );
}

function Card({ p, names, setRef, dim, lit, onHover, onOpen }: {
  p: Proc;
  names: Map<string, string>;
  setRef: (el: HTMLButtonElement | null) => void;
  dim: boolean;
  lit: boolean;
  onHover: (id: string | null) => void;
  onOpen: () => void;
}) {
  const runs = [...new Set(p.runs.map((r) => names.get(r.processId)).filter(Boolean))] as string[];
  return (
    <button
      type="button"
      ref={setRef}
      data-card={p.id}
      onClick={onOpen}
      onMouseEnter={() => onHover(p.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(p.id)}
      onBlur={() => onHover(null)}
      className={`group relative flex min-w-0 flex-col rounded-2xl border bg-card p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)] ${
        lit ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/30'
      } ${dim ? 'opacity-40' : ''}`}
    >
      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{p.name}</span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            p.live ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          {p.live ? 'Live' : 'Draft'}
        </span>
      </span>
      <span className="mt-0.5 text-[11px] text-muted-foreground">
        {plural(p.stepCount, 'step')}
        {p.ownerName ? ` · ${p.ownerName}` : ''}
      </span>
      <span className="mt-3 block">
        <MixBar p={p} />
      </span>
      <span className="mt-3 flex items-center justify-between gap-2">
        <span className="flex -space-x-1.5">
          {p.people.slice(0, 4).map((w) => (
            <span key={w.id} title={w.name} className="rounded-full bg-background p-0.5 ring-2 ring-card">
              <ElementIcon name={w.name} image={w.image} icon={w.icon} typeIcon={w.typeIcon} color={w.color} size={14} />
            </span>
          ))}
          {p.people.length > 4 && <span className="pl-2 text-[10px] text-muted-foreground">+{p.people.length - 4}</span>}
        </span>
        <span className="flex items-center gap-1">
          {p.apps.slice(0, 5).map((a) => (
            <span key={a.id} title={a.name} className="rounded-md border border-border bg-background p-0.5">
              <ElementIcon name={a.name} image={a.image} icon={a.icon} typeIcon={a.typeIcon} color={a.color} size={13} />
            </span>
          ))}
          {p.apps.length > 5 && <span className="text-[10px] text-muted-foreground">+{p.apps.length - 5}</span>}
        </span>
      </span>
      {runs.length > 0 && (
        <span className="mt-3 border-t border-border/70 pt-2 text-[11px] text-muted-foreground">
          Runs <span className="font-medium text-foreground">{runs.join(', ')}</span>
        </span>
      )}
    </button>
  );
}

interface Line {
  id: string;
  from: string;
  to: string;
  path: string;
}

/**
 * The company brain: every process on one page, in sections by department,
 * owner, person or app. Where one process runs another through a sub-process
 * step, an arrow joins them, so you can see how the pieces of the business
 * connect. Point at a process to light up what it runs and what runs it.
 */
export default function Brain() {
  const navigate = useNavigate();
  const [procs, setProcs] = useState<Proc[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [by, setBy] = useState<GroupBy>('department');
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  const load = useCallback(() => {
    setFailed(false);
    setProcs(null);
    getBrain({})
      .then((r) => setProcs(r.processes))
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const names = useMemo(() => new Map((procs ?? []).map((p) => [p.id, p.name])), [procs]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return procs ?? [];
    return (procs ?? []).filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.department.toLowerCase().includes(q) ||
        p.ownerName.toLowerCase().includes(q) ||
        p.people.some((w) => w.name.toLowerCase().includes(q)) ||
        p.apps.some((a) => a.name.toLowerCase().includes(q)),
    );
  }, [procs, query]);
  const groups = useMemo(() => groupsFor(visible, by), [visible, by]);

  // Who is linked to whom, for lighting up neighbours on hover.
  const links = useMemo(() => {
    const out: { from: string; to: string }[] = [];
    for (const p of visible) for (const r of p.runs) if (visible.some((v) => v.id === r.processId)) out.push({ from: p.id, to: r.processId });
    return out;
  }, [visible]);
  const neighbours = useMemo(() => {
    const set = new Set<string>();
    if (!hover) return set;
    set.add(hover);
    for (const l of links) {
      if (l.from === hover) set.add(l.to);
      if (l.to === hover) set.add(l.from);
    }
    return set;
  }, [hover, links]);

  // Arrows are only drawn when each process appears once, as in the department and owner views.
  const drawLines = by === 'department' || by === 'owner';
  const wrap = useRef<HTMLDivElement | null>(null);
  const cardEls = useRef<Map<string, HTMLButtonElement>>(new Map());

  const measure = useCallback(() => {
    const root = wrap.current;
    if (!root || !drawLines) {
      setLines([]);
      return;
    }
    const base = root.getBoundingClientRect();
    const rect = (id: string) => {
      const el = cardEls.current.get(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
    };
    const next: Line[] = [];
    for (const l of links) {
      const a = rect(l.from);
      const b = rect(l.to);
      if (!a || !b) continue;
      let x1: number, y1: number, x2: number, y2: number, path: string;
      if (b.x > a.x + a.w + 12) {
        // Target sits to the right: leave from the right edge, arrive at the left edge.
        x1 = a.x + a.w; y1 = a.y + a.h / 2; x2 = b.x; y2 = b.y + b.h / 2;
        const c = Math.max(40, (x2 - x1) / 2);
        path = `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
      } else if (b.x + b.w < a.x - 12) {
        x1 = a.x; y1 = a.y + a.h / 2; x2 = b.x + b.w; y2 = b.y + b.h / 2;
        const c = Math.max(40, (x1 - x2) / 2);
        path = `M ${x1} ${y1} C ${x1 - c} ${y1}, ${x2 + c} ${y2}, ${x2} ${y2}`;
      } else if (b.y > a.y) {
        x1 = a.x + a.w / 2; y1 = a.y + a.h; x2 = b.x + b.w / 2; y2 = b.y;
        const c = Math.max(30, (y2 - y1) / 2);
        path = `M ${x1} ${y1} C ${x1} ${y1 + c}, ${x2} ${y2 - c}, ${x2} ${y2}`;
      } else {
        x1 = a.x + a.w / 2; y1 = a.y; x2 = b.x + b.w / 2; y2 = b.y + b.h;
        const c = Math.max(30, (y1 - y2) / 2);
        path = `M ${x1} ${y1} C ${x1} ${y1 - c}, ${x2} ${y2 + c}, ${x2} ${y2}`;
      }
      next.push({ id: `${l.from}->${l.to}`, from: l.from, to: l.to, path });
    }
    setLines(next);
  }, [links, drawLines]);

  useLayoutEffect(() => {
    measure();
  }, [measure, groups]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    const ro = typeof ResizeObserver !== 'undefined' && wrap.current ? new ResizeObserver(measure) : null;
    if (ro && wrap.current) ro.observe(wrap.current);
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [measure]);

  return (
    <div className="mx-auto max-w-[1300px] px-8 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Company brain</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Every process in one place. Arrows show one process running another. Point at a process to see what it
            connects to.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the brain…" className="h-9 pl-8 text-sm" />
          </div>
          <div className="flex rounded-lg bg-muted p-0.5 text-sm" role="tablist" aria-label="Group by">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={by === m.key}
                onClick={() => setBy(m.key)}
                className={`rounded-md px-3 py-1.5 font-medium transition-all ${
                  by === m.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {failed ? (
        <div className="mt-8"><PageError onRetry={load} /></div>
      ) : procs === null ? (
        <div className="mt-8"><PageLoading blocks={2} height="h-44" /></div>
      ) : procs.length === 0 ? (
        <div className="mt-8">
          <PageEmpty icon={<BrainIcon className="h-6 w-6" />} title="Nothing in the brain yet" text="Map a process and it shows up here." />
        </div>
      ) : groups.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">Nothing matches that search.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
            {[[AUTOMATED, 'Runs on its own'], [REVIEW, 'A person decides'], [MANUAL, 'Done by hand']].map(([c, l]) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c }} /> {l}
              </span>
            ))}
            {by === 'department' && procs.every((p) => !p.department) && (
              <span className="text-amber-700">Set a department on each process to group them here.</span>
            )}
          </div>

          <div ref={wrap} className="relative mt-5">
            {drawLines && (
              <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible" aria-hidden="true">
                <defs>
                  <marker id="brain-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 2 1.5 L 8 5 L 2 8.5" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                  </marker>
                  <marker id="brain-arrow-hi" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="10" markerHeight="10" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 2 1.5 L 8 5 L 2 8.5" fill="none" stroke="hsl(var(--primary))" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                  </marker>
                </defs>
                {lines.map((l) => {
                  const on = hover === l.from || hover === l.to;
                  return (
                    <path
                      key={l.id}
                      d={l.path}
                      fill="none"
                      stroke={on ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.45)'}
                      strokeWidth={on ? 2.25 : 1.5}
                      strokeLinecap="round"
                      opacity={hover && !on ? 0.15 : 1}
                      markerEnd={on ? 'url(#brain-arrow-hi)' : 'url(#brain-arrow)'}
                      className="transition-opacity duration-200"
                    />
                  );
                })}
              </svg>
            )}

            <div className="relative z-10 space-y-8">
              {groups.map((g) => (
                <section key={g.key}>
                  <div className="mb-3 flex items-center gap-2.5">
                    {g.who && (
                      <ElementIcon name={g.who.name} image={g.who.image} icon={g.who.icon} typeIcon={g.who.typeIcon} color={g.who.color} size={18} />
                    )}
                    <h2 className="text-sm font-semibold">{g.title}</h2>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">{g.procs.length}</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                    {g.procs.map((p) => (
                      <Card
                        key={`${g.key}-${p.id}`}
                        p={p}
                        names={names}
                        setRef={(el) => {
                          if (el) cardEls.current.set(p.id, el);
                          else cardEls.current.delete(p.id);
                        }}
                        dim={!!hover && !neighbours.has(p.id)}
                        lit={hover === p.id}
                        onHover={setHover}
                        onOpen={() => navigate(`/process/${p.id}`)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
