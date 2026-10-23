import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBrain, GetBrainOutputType } from 'zitejs/api';
import {
  ArrowRight, Brain as BrainIcon, GraduationCap, Maximize, Maximize2, Minimize2, Minus, Plus, Search, Workflow, X, Zap,
} from 'lucide-react';
import { flowLayout, FLOW_FOOT, STEP_H, STEP_W, type FlowLayout } from '@/lib/brainFlow';
import { Button } from '@project/components/ui/button';
import { PageEmpty, PageError, PageLoading } from './PageState';
import ElementIcon from './ElementIcon';

type Proc = GetBrainOutputType['processes'][number];
type Who = Proc['people'][number];

// --- Board geometry, in board units. Zoom scales all of it together. ---
const CARD_W = 300;
const CARD_H = 264;
const CARD_GAP = 32;
const FRAME_PAD = 40;
const FRAME_HEAD = 76;
const FRAME_GAP = 120;
const ROW_MAX = 2300;

const Z_MIN = 0.12;
const Z_MAX = 2.5;
/** Below this the cards show just their name, big; above NEAR they list every step. */
const FAR = 0.45;
const NEAR = 1.1;

// The same three colors used for the kind of work everywhere in the app.
const AUTOMATED = 'hsl(152 55% 42%)';
const REVIEW = 'hsl(38 92% 52%)';
const MANUAL = 'hsl(220 9% 62%)';

const HUES = [217, 262, 152, 24, 336, 188, 45];
const hueFor = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface Frame {
  key: string;
  title: string;
  hue: number;
  x: number;
  y: number;
  w: number;
  h: number;
  count: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Lays the board out: one frame per department, closed processes in a tidy
 * grid inside, opened processes underneath as full-width flows, and frames
 * packed left to right in rows. Always the same answer for the same input, so
 * the board doesn't shuffle between visits.
 */
function layoutBoard(procs: Proc[], opened: Set<string>) {
  const byDept = new Map<string, Proc[]>();
  for (const p of procs) {
    const key = p.department || '';
    const list = byDept.get(key);
    if (list) list.push(p);
    else byDept.set(key, [p]);
  }
  const keys = [...byDept.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));

  const frames: Frame[] = [];
  const cards = new Map<string, Rect>();
  const flows = new Map<string, Rect & { layout: FlowLayout }>();
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const key of keys) {
    const list = byDept.get(key)!;
    const closed = list.filter((p) => !opened.has(p.id));
    const open = list
      .filter((p) => opened.has(p.id))
      .map((p) => ({ p, layout: flowLayout(p.steps.map((st) => st.id), p.links) }));

    const cols = closed.length === 0 ? 0 : closed.length <= 2 ? closed.length : closed.length <= 4 ? 2 : 3;
    const gridRows = cols ? Math.ceil(closed.length / cols) : 0;
    const gridW = cols ? cols * CARD_W + (cols - 1) * CARD_GAP : 0;
    const gridH = gridRows ? gridRows * CARD_H + (gridRows - 1) * CARD_GAP : 0;
    const flowsW = Math.max(0, ...open.map((o) => o.layout.width));
    const flowsH = open.reduce((n, o) => n + o.layout.height, 0) + Math.max(0, open.length - 1) * CARD_GAP;
    const innerW = Math.max(gridW, flowsW, CARD_W);
    const w = FRAME_PAD * 2 + innerW;
    const h = FRAME_HEAD + gridH + (gridH && flowsH ? CARD_GAP : 0) + flowsH + FRAME_PAD;

    if (x > 0 && x + w > ROW_MAX) {
      x = 0;
      y += rowH + FRAME_GAP;
      rowH = 0;
    }
    frames.push({ key: key || '~none', title: key || 'No department yet', hue: key ? hueFor(key) : 220, x, y, w, h, count: list.length });
    closed.forEach((p, i) => {
      cards.set(p.id, {
        x: x + FRAME_PAD + (i % cols) * (CARD_W + CARD_GAP),
        y: y + FRAME_HEAD + Math.floor(i / cols) * (CARD_H + CARD_GAP),
        w: CARD_W,
        h: CARD_H,
      });
    });
    let fy = y + FRAME_HEAD + gridH + (gridH ? CARD_GAP : 0);
    for (const o of open) {
      flows.set(o.p.id, { x: x + FRAME_PAD, y: fy, w: o.layout.width, h: o.layout.height, layout: o.layout });
      fy += o.layout.height + CARD_GAP;
    }
    x += w + FRAME_GAP;
    rowH = Math.max(rowH, h);
  }
  const width = Math.max(0, ...frames.map((f) => f.x + f.w));
  const height = Math.max(0, ...frames.map((f) => f.y + f.h));
  /** Where a process sits, closed or opened. */
  const rectOf = (id: string): Rect | null => cards.get(id) ?? flows.get(id) ?? null;
  return { frames, cards, flows, rectOf, width, height };
}

/** A curved arrow from one box to another, leaving and arriving on the sides that face each other. */
function arrowPath(a: Rect, b: Rect) {
  if (b.x >= a.x + a.w) {
    const x1 = a.x + a.w, y1 = a.y + Math.min(a.h / 2, 130), x2 = b.x, y2 = b.y + Math.min(b.h / 2, 130);
    const c = Math.max(60, (x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
  }
  if (b.x + b.w <= a.x) {
    const x1 = a.x, y1 = a.y + Math.min(a.h / 2, 130), x2 = b.x + b.w, y2 = b.y + Math.min(b.h / 2, 130);
    const c = Math.max(60, (x1 - x2) / 2);
    return `M ${x1} ${y1} C ${x1 - c} ${y1}, ${x2 + c} ${y2}, ${x2} ${y2}`;
  }
  const down = b.y > a.y;
  const x1 = a.x + Math.min(a.w / 2, 150), y1 = down ? a.y + a.h : a.y, x2 = b.x + Math.min(b.w / 2, 150), y2 = down ? b.y : b.y + b.h;
  const c = Math.max(50, Math.abs(y2 - y1) / 2) * (down ? 1 : -1);
  return `M ${x1} ${y1} C ${x1} ${y1 + c}, ${x2} ${y2 - c}, ${x2} ${y2}`;
}

function MixBar({ p, thick }: { p: Proc; thick?: boolean }) {
  const total = p.automated + p.review + p.manual;
  const h = thick ? 'h-3' : 'h-1.5';
  if (total === 0) return <div className={`${h} rounded-full bg-muted`} />;
  const part = (n: number, color: string) => n > 0 && <div style={{ width: `${(n / total) * 100}%`, backgroundColor: color }} />;
  return (
    <div className={`flex ${h} gap-0.5 overflow-hidden rounded-full`}>
      {part(p.automated, AUTOMATED)}
      {part(p.review, REVIEW)}
      {part(p.manual, MANUAL)}
    </div>
  );
}

const Icon = ({ w, size }: { w: Who; size: number }) => (
  <ElementIcon name={w.name} image={w.image} icon={w.icon} typeIcon={w.typeIcon} color={w.color} size={size} />
);

/** One process on the board. What it shows depends on how close you are. */
function Card({ p, level, names, onOpenFlow }: {
  p: Proc;
  level: 'far' | 'mid' | 'near';
  names: Map<string, string>;
  /** Lay this process out step by step, right here on the board. */
  onOpenFlow: () => void;
}) {
  if (level === 'far') {
    return (
      <div className="flex h-full flex-col justify-between p-6">
        <p className="text-[26px] font-semibold leading-tight tracking-tight">{p.name}</p>
        <MixBar p={p} thick />
      </div>
    );
  }

  const header = (
    <div className="flex items-start gap-2">
      <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug tracking-tight">{p.name}</p>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          p.live ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
        }`}
      >
        {p.live ? 'Live' : 'Draft'}
      </span>
      {p.steps.length > 0 && (
        <button
          type="button"
          data-ui
          onClick={onOpenFlow}
          title="Open the steps here on the board"
          aria-label={`Open the steps of ${p.name} on the board`}
          className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  if (level === 'near') {
    const shown = p.steps.slice(0, 9);
    return (
      <div className="flex h-full flex-col p-4">
        {header}
        <ol className="mt-2.5 min-h-0 flex-1 space-y-[3px]">
          {shown.map((s, i) => (
            <li key={s.id} className="flex items-center gap-1.5 text-[10.5px] leading-[15px]">
              <span className="w-3.5 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}</span>
              {s.who ? <Icon w={s.who} size={11} /> : <span className="h-[11px] w-[11px]" />}
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
              {s.automated && <Zap className="h-2.5 w-2.5 shrink-0" style={{ color: AUTOMATED }} />}
              {s.stepType === 'Decision' && <span className="h-1.5 w-1.5 shrink-0 rotate-45 border border-amber-500" />}
            </li>
          ))}
        </ol>
        {p.steps.length > shown.length && (
          <p className="text-[10px] text-muted-foreground">and {p.steps.length - shown.length} more steps</p>
        )}
        <div className="mt-2">
          <MixBar p={p} />
        </div>
      </div>
    );
  }

  const runs = [...new Set(p.runs.map((r) => names.get(r.processId)).filter(Boolean))] as string[];
  return (
    <div className="flex h-full flex-col p-5">
      {header}
      <p className="mt-1 text-[11px] text-muted-foreground">
        {plural(p.stepCount, 'step')}
        {p.ownerName ? ` · ${p.ownerName}` : ''}
      </p>
      <div className="mt-4">
        <MixBar p={p} />
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          {p.automated} on its own · {p.review} decided by a person · {p.manual} by hand
        </p>
      </div>
      <div className="mt-auto space-y-2.5">
        {p.people.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {p.people.slice(0, 6).map((w) => (
              <span key={w.id} title={w.name} className="rounded-full border border-border bg-background p-1">
                <Icon w={w} size={13} />
              </span>
            ))}
            {p.people.length > 6 && <span className="text-[10px] text-muted-foreground">+{p.people.length - 6}</span>}
          </div>
        )}
        {p.apps.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {p.apps.slice(0, 8).map((a) => (
              <span key={a.id} title={a.name} className="rounded-md border border-border bg-background p-1">
                <Icon w={a} size={13} />
              </span>
            ))}
            {p.apps.length > 8 && <span className="text-[10px] text-muted-foreground">+{p.apps.length - 8}</span>}
          </div>
        )}
        {runs.length > 0 && (
          <p className="border-t border-border/70 pt-2 text-[11px] text-muted-foreground">
            Runs <span className="font-medium text-foreground">{runs.join(', ')}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/** One process opened up on the board: every step left to right, with its arrows, like a small map. */
function FlowView({ p, rect, layout, onClose, onOpenProcess }: {
  p: Proc;
  rect: Rect;
  layout: FlowLayout;
  onClose: () => void;
  onOpenProcess: () => void;
}) {
  const byId = new Map(p.steps.map((s) => [s.id, s]));
  const marker = `flow-arrow-${p.id}`;
  const bottom = Math.max(0, ...[...layout.pos.values()].map((v) => v.y + STEP_H));
  const chip = (x: number, y: number, label: string) =>
    label ? (
      <g>
        <rect x={x - (label.length * 5.4 + 14) / 2} y={y - 9} width={label.length * 5.4 + 14} height={18} rx={9} fill="hsl(var(--background))" stroke="hsl(var(--border))" />
        <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={500} fill="hsl(var(--muted-foreground))">
          {label}
        </text>
      </g>
    ) : null;

  return (
    <>
      <div className="flex h-16 items-center gap-3 px-7">
        <span className="text-[17px] font-semibold tracking-tight">{p.name}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            p.live ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          {p.live ? 'Live' : 'Draft'}
        </span>
        <span className="text-xs text-muted-foreground">
          {plural(p.stepCount, 'step')}
          {p.ownerName ? ` · ${p.ownerName}` : ''}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            data-ui
            onClick={onOpenProcess}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
          >
            Open process <ArrowRight className="h-3 w-3" />
          </button>
          <button
            type="button"
            data-ui
            onClick={onClose}
            title="Close it back to a card"
            aria-label={`Close ${p.name} back to a card`}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>

      <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={rect.w} height={rect.h} aria-hidden="true">
        <defs>
          <marker id={marker} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M 2 1.5 L 8 5 L 2 8.5" fill="none" stroke="hsl(220 9% 55%)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        {layout.forward.map((e) => {
          const a = layout.pos.get(e.from);
          const b = layout.pos.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + STEP_W, y1 = a.y + STEP_H / 2, x2 = b.x, y2 = b.y + STEP_H / 2;
          const c = Math.max(24, (x2 - x1) / 2);
          return (
            <g key={`${e.from}->${e.to}`}>
              <path d={`M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`} fill="none" stroke="hsl(220 9% 62%)" strokeWidth={1.5} markerEnd={`url(#${marker})`} />
              <circle cx={x1} cy={y1} r={2.5} fill="hsl(220 9% 62%)" />
              {chip((x1 + x2) / 2, (y1 + y2) / 2, e.label)}
            </g>
          );
        })}
        {layout.back.map((e) => {
          const a = layout.pos.get(e.from);
          const b = layout.pos.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + STEP_W / 2, y1 = a.y + STEP_H, x2 = b.x + STEP_W / 2, y2 = b.y + STEP_H;
          const yb = bottom + FLOW_FOOT * 0.55;
          return (
            <g key={`${e.from}->${e.to}`}>
              <path d={`M ${x1} ${y1} C ${x1} ${yb}, ${x2} ${yb}, ${x2} ${y2 + 2}`} fill="none" stroke="hsl(var(--primary) / 0.55)" strokeWidth={1.75} strokeDasharray="6 4" markerEnd={`url(#${marker})`} />
              {chip((x1 + x2) / 2, yb - 6, e.label || 'Goes back')}
            </g>
          );
        })}
      </svg>

      {[...layout.pos].map(([id, at]) => {
        const st = byId.get(id);
        if (!st) return null;
        const decision = st.stepType === 'Decision';
        return (
          <div
            key={id}
            className={`absolute flex flex-col rounded-xl border p-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] ${
              st.automated
                ? 'border-emerald-200 bg-emerald-50/60'
                : decision
                ? 'border-amber-200 bg-amber-50/50'
                : 'border-border bg-background'
            }`}
            style={{ left: at.x, top: at.y, width: STEP_W, height: STEP_H }}
          >
            <span className="flex items-center gap-1.5">
              {st.who && <Icon w={st.who} size={13} />}
              <span className="min-w-0 flex-1 truncate text-[10px] font-semibold">{st.who?.name ?? 'Nobody yet'}</span>
              {st.automated && (
                <span className="inline-flex shrink-0 items-center gap-0.5 text-[9px] font-semibold" style={{ color: AUTOMATED }}>
                  <Zap className="h-2.5 w-2.5" /> Auto
                </span>
              )}
              {decision && <span className="shrink-0 text-[9px] font-semibold text-amber-700">Decision</span>}
              {st.stepType === 'Wait' && <span className="shrink-0 text-[9px] font-semibold text-muted-foreground">Wait</span>}
            </span>
            <span className="mt-1.5 line-clamp-3 text-[12px] font-medium leading-snug">{st.title}</span>
          </div>
        );
      })}
    </>
  );
}

interface View {
  x: number;
  y: number;
  z: number;
}

/**
 * The company brain: a board with every process on it, like a whiteboard you
 * can move around. Departments are frames. Zoom out for the bird's-eye view,
 * zoom in to read each process step by step. Point at an app or a person on the
 * left to see every process they are part of. Click a process for its details.
 */
export default function Brain() {
  const navigate = useNavigate();
  const [procs, setProcs] = useState<Proc[] | null>(null);
  const [failed, setFailed] = useState(false);

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

  // Processes opened up on the board, step by step. The rest stay as cards.
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const board = useMemo(() => layoutBoard(procs ?? [], opened), [procs, opened]);
  const names = useMemo(() => new Map((procs ?? []).map((p) => [p.id, p.name])), [procs]);
  const byId = useMemo(() => new Map((procs ?? []).map((p) => [p.id, p])), [procs]);

  // Every app and person on the board, with the processes they are part of.
  const lenses = useMemo(() => {
    const build = (pick: (p: Proc) => Who[]) => {
      const map = new Map<string, { who: Who; ids: string[] }>();
      for (const p of procs ?? []) {
        for (const w of pick(p)) {
          const cur = map.get(w.id);
          if (cur) cur.ids.push(p.id);
          else map.set(w.id, { who: w, ids: [p.id] });
        }
      }
      return [...map.values()].sort((a, b) => b.ids.length - a.ids.length || a.who.name.localeCompare(b.who.name));
    };
    return { apps: build((p) => p.apps), people: build((p) => p.people) };
  }, [procs]);

  const links = useMemo(() => {
    const out: { from: string; to: string }[] = [];
    for (const p of procs ?? []) for (const r of p.runs) if (byId.has(r.processId)) out.push({ from: p.id, to: r.processId });
    return out;
  }, [procs, byId]);

  // --- Moving around ---
  const stage = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 0.5 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [glide, setGlide] = useState(false);
  const fitted = useRef(false);

  const zoomAt = useCallback((nextZ: number, cx: number, cy: number, animate = false) => {
    const v = viewRef.current;
    const z = Math.min(Z_MAX, Math.max(Z_MIN, nextZ));
    // Keep the point under the cursor where it is.
    const wx = (cx - v.x) / v.z;
    const wy = (cy - v.y) / v.z;
    setGlide(animate);
    setView({ z, x: cx - wx * z, y: cy - wy * z });
  }, []);

  const fit = useCallback(
    (animate = true) => {
      const el = stage.current;
      if (!el || board.width === 0) return;
      const r = el.getBoundingClientRect();
      const pad = 72;
      const z = Math.min(1, Math.max(Z_MIN, Math.min((r.width - pad * 2) / board.width, (r.height - pad * 2) / board.height)));
      setGlide(animate);
      setView({ z, x: (r.width - board.width * z) / 2, y: Math.max(pad, (r.height - board.height * z) / 2) });
    },
    [board],
  );

  /** Glide to one process and zoom in close enough to read its steps. */
  const flyTo = useCallback(
    (id: string) => {
      const el = stage.current;
      const box = board.rectOf(id);
      if (!el || !box) return;
      const r = el.getBoundingClientRect();
      setGlide(true);
      if (board.flows.has(id)) {
        // An opened process: as close as it fits across, never so close the steps are huge.
        const z = Math.min(1, Math.max(0.55, (r.width - 140) / box.w));
        const x = box.w * z < r.width - 80 ? r.width / 2 - (box.x + box.w / 2) * z : 70 - box.x * z;
        setView({ z, x, y: r.height / 2 - (box.y + box.h / 2) * z });
        return;
      }
      const z = Math.max(viewRef.current.z, NEAR + 0.15);
      setView({ z, x: r.width / 2 - (box.x + box.w / 2) * z, y: r.height / 2 - (box.y + box.h / 2) * z });
    },
    [board],
  );

  // Opening or closing changes the layout, so the camera moves once the board has been laid out again.
  const [after, setAfter] = useState<{ fly?: string; fit?: boolean } | null>(null);
  useEffect(() => {
    if (!after) return;
    if (after.fly) flyTo(after.fly);
    else if (after.fit) fit();
    setAfter(null);
  }, [board, after, flyTo, fit]);

  const openFlow = useCallback((id: string) => {
    setOpened((prev) => new Set(prev).add(id));
    setAfter({ fly: id });
  }, []);
  const closeFlow = useCallback((id: string) => {
    setOpened((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);
  const allOpen = !!procs && procs.length > 0 && procs.every((p) => opened.has(p.id) || p.steps.length === 0);
  const toggleAll = () => {
    setOpened(allOpen ? new Set() : new Set((procs ?? []).filter((p) => p.steps.length > 0).map((p) => p.id)));
    setAfter({ fit: true });
  };

  useLayoutEffect(() => {
    if (procs && procs.length && !fitted.current) {
      fitted.current = true;
      fit(false);
    }
  }, [procs, fit]);

  // Trackpads: two fingers move the board, pinch zooms. A mouse wheel zooms.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('[data-ui]')) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40);
      if (e.ctrlKey || e.metaKey || mouseWheel) {
        zoomAt(viewRef.current.z * Math.exp(-e.deltaY * (mouseWheel ? 0.0015 : 0.01)), e.clientX - r.left, e.clientY - r.top);
      } else {
        setGlide(false);
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, procs]);

  // Dragging anywhere on the board moves it. A press that doesn't move is a click.
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean; card: string | null } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [lens, setLens] = useState<{ ids: Set<string>; label: string; pinned: boolean } | null>(null);
  const [tab, setTab] = useState<'apps' | 'people'>('apps');
  const [query, setQuery] = useState('');

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-ui]')) return;
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-card]')?.dataset.card ?? null;
    drag.current = { sx: e.clientX, sy: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y, moved: false, card };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    setGlide(false);
    setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d || d.moved) return;
    setSelected(d.card);
  };

  // Keys: + and - zoom, 0 fits everything, Esc closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = stage.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (e.key === '+' || e.key === '=') zoomAt(viewRef.current.z * 1.25, r.width / 2, r.height / 2, true);
      else if (e.key === '-') zoomAt(viewRef.current.z / 1.25, r.width / 2, r.height / 2, true);
      else if (e.key === '0') fit();
      else if (e.key === 'Escape') {
        setSelected(null);
        setLens(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomAt, fit]);

  // What is lit up: a pinned or hovered app or person, a search, or the process you point at and what it links to.
  const q = query.trim().toLowerCase();
  const focus = useMemo(() => {
    if (lens) return lens.ids;
    if (q) {
      return new Set(
        (procs ?? [])
          .filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.department.toLowerCase().includes(q) ||
              p.steps.some((s) => s.title.toLowerCase().includes(q)) ||
              p.people.some((w) => w.name.toLowerCase().includes(q)) ||
              p.apps.some((a) => a.name.toLowerCase().includes(q)),
          )
          .map((p) => p.id),
      );
    }
    const pointAt = hover ?? selected;
    if (!pointAt) return null;
    const set = new Set([pointAt]);
    for (const l of links) {
      if (l.from === pointAt) set.add(l.to);
      if (l.to === pointAt) set.add(l.from);
    }
    return set;
  }, [lens, q, procs, hover, selected, links]);

  const level: 'far' | 'mid' | 'near' = view.z < FAR ? 'far' : view.z < NEAR ? 'mid' : 'near';
  const sel = selected ? byId.get(selected) ?? null : null;
  const runBy = sel ? (procs ?? []).filter((p) => p.runs.some((r) => r.processId === sel.id)) : [];

  if (failed) return <div className="mx-auto max-w-xl px-8 py-16"><PageError onRetry={load} /></div>;
  if (procs === null) return <div className="mx-auto max-w-5xl px-8 py-8"><PageLoading blocks={2} height="h-64" /></div>;
  if (procs.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-8 py-16">
        <PageEmpty icon={<BrainIcon className="h-6 w-6" />} title="Nothing in the brain yet" text="Map a process and it shows up here." />
      </div>
    );
  }

  const lensList = tab === 'apps' ? lenses.apps : lenses.people;

  return (
    <div
      ref={stage}
      className={`relative h-full select-none overflow-hidden ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{
        backgroundColor: 'hsl(220 20% 97.5%)',
        backgroundImage: 'radial-gradient(circle, hsl(220 14% 82%) 1px, transparent 1.2px)',
        backgroundSize: `${24 * view.z}px ${24 * view.z}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => {
        const card = (e.target as HTMLElement).closest<HTMLElement>('[data-card]')?.dataset.card;
        if (card) navigate(`/process/${card}`);
      }}
    >
      {/* The board itself. One transform moves and zooms everything on it. */}
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: board.width,
          height: board.height,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
          transition: glide ? 'transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)' : undefined,
        }}
      >
        {board.frames.map((f) => (
          <div
            key={f.key}
            className="absolute rounded-[28px] border-2"
            style={{
              left: f.x,
              top: f.y,
              width: f.w,
              height: f.h,
              backgroundColor: `hsl(${f.hue} 80% 97% / 0.85)`,
              borderColor: `hsl(${f.hue} 55% 86%)`,
            }}
          >
            <div className="flex items-baseline gap-3 px-10 pt-6" style={{ color: `hsl(${f.hue} 45% 32%)` }}>
              <span className={`font-semibold tracking-tight ${level === 'far' ? 'text-[44px]' : 'text-[26px]'}`}>{f.title}</span>
              <span className={`${level === 'far' ? 'text-[26px]' : 'text-[15px]'} opacity-70`}>{plural(f.count, 'process')}</span>
            </div>
          </div>
        ))}

        {/* Arrows where one process runs another. */}
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={board.width} height={board.height} aria-hidden="true">
          <defs>
            <marker id="brain-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="12" markerHeight="12" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M 2 1.5 L 8 5 L 2 8.5" fill="none" stroke="hsl(var(--primary))" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          {links.map((l) => {
            const a = board.rectOf(l.from);
            const b = board.rectOf(l.to);
            if (!a || !b) return null;
            const on = !focus || (focus.has(l.from) && focus.has(l.to));
            return (
              <path
                key={`${l.from}->${l.to}`}
                d={arrowPath(a, b)}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={on ? 3 : 2}
                strokeDasharray="10 6"
                opacity={on ? 0.85 : 0.15}
                markerEnd="url(#brain-arrow)"
              />
            );
          })}
        </svg>

        {procs.map((p) => {
          const pos = board.cards.get(p.id);
          if (!pos) return null;
          const dim = !!focus && !focus.has(p.id);
          const isSel = selected === p.id;
          return (
            <div
              key={p.id}
              data-card={p.id}
              role="button"
              tabIndex={0}
              aria-label={p.name}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover((h) => (h === p.id ? null : h))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSelected(p.id);
              }}
              className={`absolute overflow-hidden rounded-2xl border bg-card shadow-[0_1px_3px_rgba(16,24,40,0.06)] transition-[opacity,box-shadow,border-color] duration-200 hover:shadow-[0_10px_30px_rgba(16,24,40,0.12)] ${
                isSel ? 'border-primary ring-4 ring-primary/20' : 'border-border'
              } ${dim ? 'opacity-25' : ''}`}
              style={{ left: pos.x, top: pos.y, width: CARD_W, height: CARD_H }}
            >
              <Card p={p} level={level} names={names} onOpenFlow={() => openFlow(p.id)} />
            </div>
          );
        })}

        {/* Opened processes: every step, left to right. */}
        {procs.map((p) => {
          const f = board.flows.get(p.id);
          if (!f) return null;
          const dim = !!focus && !focus.has(p.id);
          return (
            <div
              key={p.id}
              data-card={p.id}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover((h) => (h === p.id ? null : h))}
              className={`absolute rounded-2xl border bg-card shadow-[0_1px_3px_rgba(16,24,40,0.06)] transition-[opacity,box-shadow,border-color] duration-200 ${
                selected === p.id ? 'border-primary ring-4 ring-primary/20' : 'border-border'
              } ${dim ? 'opacity-25' : ''}`}
              style={{ left: f.x, top: f.y, width: f.w, height: f.h }}
            >
              <FlowView
                p={p}
                rect={f}
                layout={f.layout}
                onClose={() => closeFlow(p.id)}
                onOpenProcess={() => navigate(`/process/${p.id}`)}
              />
            </div>
          );
        })}
      </div>

      {/* Top left: name, search, and the apps and people lens. These stay put while the board moves. */}
      <div data-ui className="absolute left-4 top-4 z-20 flex w-[260px] cursor-default flex-col gap-2">
        <div className="rounded-2xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <BrainIcon className="h-4 w-4 text-primary" /> Company brain
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Drag to move. Pinch or scroll to zoom. Click a process for details, or open its steps right here.
          </p>
          <div className="relative mt-2.5">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLens(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && focus && focus.size) flyTo([...focus][0]);
              }}
              placeholder="Find a process, step, app…"
              className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-2 text-xs outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <button
            type="button"
            onClick={toggleAll}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium transition-colors hover:border-primary/30 hover:text-primary"
          >
            {allOpen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {allOpen ? 'Close every process' : 'Open every process step by step'}
          </button>
        </div>

        <div className="flex max-h-[calc(100vh-15rem)] min-h-0 flex-col rounded-2xl border border-border bg-background/95 shadow-sm backdrop-blur">
          <div className="flex gap-1 p-1.5">
            {(['apps', 'people'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setLens(null);
                }}
                className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                  tab === t ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'apps' ? `Apps (${lenses.apps.length})` : `People (${lenses.people.length})`}
              </button>
            ))}
          </div>
          <p className="px-3 pb-1 text-[10px] text-muted-foreground">
            Point at one to light up every process it is part of. Click to keep it lit.
          </p>
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-1.5">
            {lensList.map(({ who, ids }) => {
              const active = lens?.label === who.name;
              return (
                <li key={who.id}>
                  <button
                    type="button"
                    onMouseEnter={() => {
                      if (!lens?.pinned) setLens({ ids: new Set(ids), label: who.name, pinned: false });
                    }}
                    onMouseLeave={() => {
                      if (!lens?.pinned) setLens(null);
                    }}
                    onClick={() =>
                      setLens(active && lens?.pinned ? null : { ids: new Set(ids), label: who.name, pinned: true })
                    }
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                      active ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                    }`}
                  >
                    <Icon w={who} size={14} />
                    <span className="min-w-0 flex-1 truncate font-medium">{who.name}</span>
                    <span className="tabular-nums text-muted-foreground">{ids.length}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* A pinned lens says so, with a way out. */}
      {lens?.pinned && (
        <div data-ui className="absolute left-1/2 top-4 z-20 -translate-x-1/2 cursor-default rounded-full border border-primary/30 bg-background px-3 py-1.5 text-xs shadow-sm">
          Showing processes with <b>{lens.label}</b> ({lens.ids.size})
          <button type="button" onClick={() => setLens(null)} className="ml-2 text-muted-foreground hover:text-foreground">
            Clear
          </button>
        </div>
      )}

      {/* Right: the process you clicked. */}
      {sel && (
        <aside
          data-ui
          className="absolute bottom-4 right-4 top-4 z-20 flex w-[340px] cursor-default flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
        >
          <div className="flex items-start gap-2 border-b border-border p-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {sel.department || 'No department'}
              </p>
              <h2 className="mt-0.5 text-lg font-semibold leading-snug tracking-tight">{sel.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                <span className={sel.live ? 'font-medium text-emerald-700' : 'font-medium text-amber-700'}>
                  {sel.live ? 'Live' : 'Draft'}
                </span>
                {' · '}
                {plural(sel.stepCount, 'step')}
                {sel.ownerName ? ` · Owned by ${sel.ownerName}` : ''}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setSelected(null)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            {sel.description && <p className="text-sm leading-relaxed text-muted-foreground">{sel.description}</p>}

            <section>
              <MixBar p={sel} />
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                {[
                  [sel.automated, 'on its own', AUTOMATED],
                  [sel.review, 'a person decides', REVIEW],
                  [sel.manual, 'by hand', MANUAL],
                ].map(([n, label, color]) => (
                  <div key={label as string} className="rounded-xl bg-muted/50 px-2 py-2">
                    <p className="text-lg font-semibold tabular-nums" style={{ color: color as string }}>{n as number}</p>
                    <p className="text-[10px] text-muted-foreground">{label as string}</p>
                  </div>
                ))}
              </div>
            </section>

            {sel.people.length > 0 && (
              <section>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">People</p>
                <div className="flex flex-wrap gap-1.5">
                  {sel.people.map((w) => (
                    <span key={w.id} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs">
                      <Icon w={w} size={13} /> {w.name}
                    </span>
                  ))}
                </div>
              </section>
            )}
            {sel.apps.length > 0 && (
              <section>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Runs on</p>
                <div className="flex flex-wrap gap-1.5">
                  {sel.apps.map((a) => (
                    <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs">
                      <Icon w={a} size={13} /> {a.name}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {(sel.runs.length > 0 || runBy.length > 0) && (
              <section className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Connected processes</p>
                {[...new Set(sel.runs.map((r) => r.processId))].map((id) => (
                  <button key={id} type="button" onClick={() => { setSelected(id); flyTo(id); }} className="flex w-full items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-left text-xs hover:bg-muted">
                    <Workflow className="h-3.5 w-3.5 text-primary" />
                    <span className="flex-1">Runs <b>{names.get(id)}</b></span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                ))}
                {runBy.map((p) => (
                  <button key={p.id} type="button" onClick={() => { setSelected(p.id); flyTo(p.id); }} className="flex w-full items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-left text-xs hover:bg-muted">
                    <Workflow className="h-3.5 w-3.5 text-primary" />
                    <span className="flex-1">Run by <b>{p.name}</b></span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                ))}
              </section>
            )}

            <section>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Steps</p>
              <ol className="space-y-1">
                {sel.steps.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}</span>
                    {s.who ? <Icon w={s.who} size={13} /> : <span className="h-[13px] w-[13px]" />}
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    {s.automated && <Zap className="h-3 w-3 shrink-0" style={{ color: AUTOMATED }} />}
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border p-3">
            {sel.steps.length > 0 && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => (opened.has(sel.id) ? (closeFlow(sel.id), setAfter({ fly: sel.id })) : openFlow(sel.id))}
              >
                {opened.has(sel.id) ? <Minimize2 className="mr-1.5 h-4 w-4" /> : <Maximize2 className="mr-1.5 h-4 w-4" />}
                {opened.has(sel.id) ? 'Close the steps on the board' : 'Show the steps on the board'}
              </Button>
            )}
            <Button className="flex-1" onClick={() => navigate(`/process/${sel.id}`)}>
              Open process
            </Button>
            {sel.live && sel.stepCount > 0 && (
              <Button variant="outline" onClick={() => navigate(`/process/${sel.id}?train=all&view=process`)}>
                <GraduationCap className="mr-1.5 h-4 w-4" /> Train
              </Button>
            )}
          </div>
        </aside>
      )}

      {/* Bottom: a key for the colors, and the zoom controls. */}
      <div data-ui className="absolute bottom-4 left-4 z-20 flex cursor-default flex-wrap gap-x-4 gap-y-1 rounded-full border border-border bg-background/95 px-4 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
        {[[AUTOMATED, 'Runs on its own'], [REVIEW, 'A person decides'], [MANUAL, 'Done by hand']].map(([c, l]) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c }} /> {l}
          </span>
        ))}
        {links.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-primary" /> Runs another process
          </span>
        )}
      </div>
      <div
        data-ui
        className={`absolute bottom-4 z-20 flex cursor-default items-center gap-0.5 rounded-full border border-border bg-background/95 p-1 shadow-md backdrop-blur ${
          sel ? 'right-[364px]' : 'right-4'
        }`}
      >
        {(() => {
          const center = () => {
            const r = stage.current?.getBoundingClientRect();
            return r ? [r.width / 2, r.height / 2] : [0, 0];
          };
          const btn = 'flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground';
          return (
            <>
              <button type="button" className={btn} aria-label="Zoom out" title="Zoom out (-)" onClick={() => { const [cx, cy] = center(); zoomAt(view.z / 1.25, cx, cy, true); }}>
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(view.z * 100)}%</span>
              <button type="button" className={btn} aria-label="Zoom in" title="Zoom in (+)" onClick={() => { const [cx, cy] = center(); zoomAt(view.z * 1.25, cx, cy, true); }}>
                <Plus className="h-3.5 w-3.5" />
              </button>
              <span className="mx-0.5 h-4 w-px bg-border" />
              <button type="button" className={btn} aria-label="Fit everything" title="Fit everything (0)" onClick={() => fit()}>
                <Maximize className="h-3.5 w-3.5" />
              </button>
            </>
          );
        })()}
      </div>
    </div>
  );
}
