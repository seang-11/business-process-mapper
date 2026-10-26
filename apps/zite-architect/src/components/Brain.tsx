import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { getBrain, setDepartmentLead, GetBrainOutputType } from 'zitejs/api';
import {
  ArrowRight, Brain as BrainIcon, ChevronDown, Crown, Eye, GraduationCap, HelpCircle, ListChecks, Maximize, Maximize2, Minimize2, Minus, Plus,
  Search, Workflow, X, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { flowLayout, FLOW_FOOT, STEP_GAP_X, STEP_H, STEP_W, type FlowLayout } from '@/lib/brainFlow';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@project/components/ui/command';
import { useMe } from '@/lib/me';
import { PageEmpty, PageError, PageLoading } from './PageState';
import ElementIcon from './ElementIcon';

type Data = GetBrainOutputType;
type Proc = Data['processes'][number];
type Step = Proc['steps'][number];
type Who = Proc['people'][number];

// --- Board geometry, in board units. Zoom scales all of it together. ---
const CARD_W = 300;
const CARD_H = 264;
const CARD_GAP = 32;
const FRAME_PAD = 40;
const FRAME_HEAD = 96;
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

const HUES = [217, 262, 152, 24, 336, 188, 45, 4, 280, 200];
const hueFor = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
};

const PLURALS: Record<string, string> = { process: 'processes', person: 'people' };
const plural = (n: number, word: string) => `${n} ${n === 1 ? word : PLURALS[word] ?? `${word}s`}`;
const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

const TOUR_KEY = 'bpm_brain_tour_v1';

interface Frame {
  key: string;
  /** The department's name, or '' for processes without one. */
  dept: string;
  title: string;
  hue: number;
  x: number;
  y: number;
  w: number;
  h: number;
  ids: string[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An app or a person in the spotlight. */
interface Lens {
  kind: 'app' | 'person';
  who: Who;
  /** The processes they are part of. */
  ids: Set<string>;
  /** Clicked rather than just pointed at, so it stays on. */
  pinned: boolean;
}

/** Does this step involve whoever is in the spotlight? */
const stepMatches = (lens: Lens, s: Step) =>
  s.who?.id === lens.who.id || (lens.kind === 'app' && s.useIds.includes(lens.who.id));

/** A step someone on the team spends time on: not an app, a client, a wait, or another process. */
const isTeamStep = (s: Step) =>
  s.who?.kind === 'person' && s.who.party !== 'External' && s.stepType !== 'Wait' && !s.subProcessId;
/** Minutes to hours a month for one process, or null until it has runs and some minutes. */
const hoursFrom = (minutes: number, p: Proc) => (p.runsPerMonth && minutes ? (minutes * p.runsPerMonth) / 60 : null);
const hoursOf = (p: Proc) => hoursFrom(p.steps.reduce((n, s) => n + (isTeamStep(s) ? s.minutes ?? 0 : 0), 0), p);
const fmtHrs = (h: number) => `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10} hrs`;

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
    const innerW = Math.max(gridW, flowsW, CARD_W * 2 + CARD_GAP);
    const w = FRAME_PAD * 2 + innerW;
    const h = FRAME_HEAD + gridH + (gridH && flowsH ? CARD_GAP : 0) + flowsH + FRAME_PAD;

    if (x > 0 && x + w > ROW_MAX) {
      x = 0;
      y += rowH + FRAME_GAP;
      rowH = 0;
    }
    frames.push({
      key: key || '~none',
      dept: key,
      title: key || 'No department yet',
      hue: key ? hueFor(key) : 220,
      x, y, w, h,
      ids: list.map((p) => p.id),
    });
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

function MixBar({ a, r, m, thick }: { a: number; r: number; m: number; thick?: boolean }) {
  const total = a + r + m;
  const h = thick ? 'h-3' : 'h-1.5';
  if (total === 0) return <div className={`${h} rounded-full bg-muted`} />;
  const part = (n: number, color: string) => n > 0 && <div style={{ width: `${(n / total) * 100}%`, backgroundColor: color }} />;
  return (
    <div className={`flex ${h} gap-0.5 overflow-hidden rounded-full`}>
      {part(a, AUTOMATED)}
      {part(r, REVIEW)}
      {part(m, MANUAL)}
    </div>
  );
}

/**
 * People get a colored initials avatar, the same color everywhere on the board,
 * so you can follow one person across processes. Apps keep their logo.
 */
function Icon({ w, size }: { w: Who; size: number }) {
  if (w.kind !== 'person') {
    return <ElementIcon name={w.name} image={w.image} icon={w.icon} typeIcon={w.typeIcon} color={w.color} size={size} />;
  }
  if (w.image) {
    return <img src={w.image} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size + 4, height: size + 4 }} />;
  }
  const hue = hueFor(w.name);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none"
      style={{
        width: size + 4,
        height: size + 4,
        fontSize: Math.max(7, Math.round((size + 4) * 0.42)),
        backgroundColor: `hsl(${hue} 85% 92%)`,
        color: `hsl(${hue} 55% 36%)`,
      }}
    >
      {initialsOf(w.name)}
    </span>
  );
}

/** One process on the board. What it shows depends on how close you are, and who is in the spotlight. */
function Card({ p, level, names, lens, onOpenFlow }: {
  p: Proc;
  level: 'far' | 'mid' | 'near';
  names: Map<string, string>;
  lens: Lens | null;
  /** Lay this process out step by step, right here on the board. */
  onOpenFlow: () => void;
}) {
  const matched = lens && lens.ids.has(p.id) ? p.steps.filter((s) => stepMatches(lens, s)).length : 0;

  if (level === 'far') {
    return (
      <div className="flex h-full flex-col justify-between p-6">
        <p className="text-[26px] font-semibold leading-tight tracking-tight">{p.name}</p>
        {matched > 0 && (
          <p className="text-[20px] font-semibold text-primary">{plural(matched, 'step')} with {lens!.who.name}</p>
        )}
        <MixBar a={p.automated} r={p.review} m={p.manual} thick />
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
          {shown.map((s, i) => {
            const on = lens ? stepMatches(lens, s) : true;
            return (
              <li
                key={s.id}
                className={`flex items-center gap-1.5 rounded px-1 text-[10.5px] leading-[15px] transition-opacity ${
                  lens && on ? 'bg-primary/10 font-medium text-primary' : ''
                } ${lens && !on ? 'opacity-35' : ''}`}
              >
                <span className="w-3.5 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}</span>
                {s.who ? <Icon w={s.who} size={11} /> : <span className="h-[11px] w-[11px]" />}
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                {s.subProcessId && <Workflow className="h-2.5 w-2.5 shrink-0 text-indigo-600" />}
                {s.automated && <Zap className="h-2.5 w-2.5 shrink-0" style={{ color: AUTOMATED }} />}
                {s.stepType === 'Decision' && <span className="h-1.5 w-1.5 shrink-0 rotate-45 border border-amber-500" />}
              </li>
            );
          })}
        </ol>
        {p.steps.length > shown.length && (
          <p className="text-[10px] text-muted-foreground">and {p.steps.length - shown.length} more steps</p>
        )}
        <div className="mt-2">
          <MixBar a={p.automated} r={p.review} m={p.manual} />
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
      {matched > 0 ? (
        <p className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
          <Icon w={lens!.who} size={11} /> {plural(matched, 'step')} of {p.steps.length}
        </p>
      ) : null}
      <div className="mt-4">
        <MixBar a={p.automated} r={p.review} m={p.manual} />
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          {p.automated} on its own · {p.review} decided by a person · {p.manual} by hand
        </p>
      </div>
      <div className="mt-auto space-y-2.5">
        {p.people.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {p.people.slice(0, 7).map((w) => (
              <span key={w.id} title={w.name}>
                <Icon w={w} size={16} />
              </span>
            ))}
            {p.people.length > 7 && <span className="text-[10px] text-muted-foreground">+{p.people.length - 7}</span>}
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

const KEY_OPEN = 'bpm_brain_key_open';

/**
 * What everything on the board means, drawn the way it looks on the board:
 * the step cards, the lines between them, and the bar on each process card.
 */
function BrainKey({ showsSteps }: { showsSteps: boolean }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(KEY_OPEN) !== '0';
    } catch {
      return true;
    }
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(KEY_OPEN, o ? '0' : '1');
      } catch {
        // Not remembered; it still works for this visit.
      }
      return !o;
    });
  };
  const card = (cls: string, extra?: React.ReactNode, style?: React.CSSProperties) => (
    <span className={`relative inline-flex h-4 w-6 shrink-0 items-center justify-center rounded-[4px] border ${cls}`} style={style}>
      {extra}
    </span>
  );
  return (
    <div className="shrink-0 rounded-2xl border border-border bg-background/95 shadow-sm backdrop-blur">
      <button type="button" onClick={toggle} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <span className="flex-1 text-xs font-semibold">Key</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-border px-3 pb-3 pt-2.5 text-[11px]">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {showsSteps ? 'Steps' : 'Steps, when opened'}
            </p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
              <span className="flex items-center gap-1.5">{card('border-border bg-background')} By a person</span>
              <span className="flex items-center gap-1.5">{card('border-amber-200 bg-amber-50')} A decision</span>
              <span className="flex items-center gap-1.5">
                {card('border-emerald-200 bg-emerald-50', <Zap className="h-2.5 w-2.5" style={{ color: AUTOMATED }} />)} Runs on its own
              </span>
              <span className="flex items-center gap-1.5">
                {card('border-indigo-300 bg-indigo-50', null, { boxShadow: '2px 2px 0 -1px white, 2px 2px 0 0 hsl(239 60% 82%)' })} Runs a process
              </span>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lines</p>
            <div className="space-y-1.5">
              <span className="flex items-center gap-1.5">
                <svg width="24" height="8" aria-hidden="true">
                  <path d="M1 4 H20" stroke="hsl(220 9% 62%)" strokeWidth="1.5" />
                  <path d="M17 1.5 L21 4 L17 6.5" fill="none" stroke="hsl(220 9% 62%)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                What happens next
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-flex h-4 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[8px] text-muted-foreground">Yes</span>
                The answer to a decision
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-6 shrink-0 border-t-2 border-dashed border-primary/60" />
                Goes back, or runs another process
              </span>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Process cards</p>
            <span className="flex h-1.5 w-full overflow-hidden rounded-full">
              <span className="w-1/3" style={{ backgroundColor: AUTOMATED }} />
              <span className="w-1/4" style={{ backgroundColor: REVIEW }} />
              <span className="flex-1" style={{ backgroundColor: MANUAL }} />
            </span>
            <span className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>On its own</span>
              <span>A person decides</span>
              <span>By hand</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The extra details of one step, shown while you point at it: a slim note tucked
 * right under the card, as wide as the card, so it covers as little of the
 * arrows around it as possible. Who and what are already on the card, so it
 * only adds what isn't: the note, the apps, what it makes, and the checklist.
 */
function StepDetails({ st, box, names }: { st: Step; box: DOMRect; names: Map<string, string> }) {
  const sub = st.subProcessId ? names.get(st.subProcessId) : null;
  const apps = st.uses;
  if (!st.description && !sub && apps.length === 0 && st.produces.length === 0 && st.checklist.length === 0 && !st.minutes) {
    return null;
  }
  const W = Math.min(320, Math.max(220, box.width));
  const left = Math.min(Math.max(8, box.left), window.innerWidth - W - 8);
  const below = box.bottom + 4 + 160 < window.innerHeight;
  return createPortal(
    <div
      className="pointer-events-none fixed z-[80] space-y-1.5 rounded-lg border border-border bg-popover px-2.5 py-2 text-[11px] leading-snug shadow-lg"
      style={{
        left,
        width: W,
        top: below ? box.bottom + 4 : box.top - 4,
        transform: below ? undefined : 'translateY(-100%)',
      }}
    >
      {st.description && <p className="line-clamp-3 text-muted-foreground">{st.description}</p>}
      {sub && (
        <p className="inline-flex items-center gap-1 font-medium text-indigo-700">
          <Workflow className="h-3 w-3" /> Runs the {sub} process
        </p>
      )}
      {apps.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {apps.map((u) => (
            <span key={u.id} className="inline-flex items-center gap-1 font-medium">
              <Icon w={u} size={11} /> {u.name}
            </span>
          ))}
        </p>
      )}
      {(st.produces.length > 0 || st.checklist.length > 0 || !!st.minutes) && (
        <p className="text-muted-foreground">
          {[
            st.minutes ? `About ${st.minutes} min` : '',
            st.checklist.length ? plural(st.checklist.length, 'checklist item') : '',
            st.produces.length ? `Makes ${st.produces.join(', ')}` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </div>,
    document.body,
  );
}

/** One process opened up on the board: every step left to right, with its arrows, like a small map. */
function FlowView({ p, rect, layout, lens, names, runBy, onJump, onClose, onOpenProcess, extra }: {
  p: Proc;
  rect: Rect;
  layout: FlowLayout;
  lens: Lens | null;
  names: Map<string, string>;
  /** The processes that run this one, by name. */
  runBy: string[];
  /** Go to another process, from a sub-process step. */
  onJump: (processId: string) => void;
  /** Leave out to hide the close button, as in the department view. */
  onClose?: () => void;
  onOpenProcess: () => void;
  /** Extra buttons in the header, such as Train. */
  extra?: React.ReactNode;
}) {
  const byId = new Map(p.steps.map((s) => [s.id, s]));
  const marker = `flow-arrow-${p.id}`;
  const markerHi = `flow-arrow-hi-${p.id}`;
  const bottom = Math.max(0, ...[...layout.pos.values()].map((v) => v.y + STEP_H));
  const [hoverStep, setHoverStep] = useState<{ id: string; box: DOMRect } | null>(null);
  // Zooming, dragging or scrolling moves the step out from under the pointer without a mouse-leave,
  // which left the panel stuck on the old step. Any of them closes it; pointing again reopens it.
  useEffect(() => {
    if (!hoverStep) return;
    const close = () => setHoverStep(null);
    window.addEventListener('wheel', close, { passive: true });
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('wheel', close);
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [hoverStep]);
  const reduceMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const lit = (e: { from: string; to: string }) => !!hoverStep && (e.from === hoverStep.id || e.to === hoverStep.id);
  // The steps an arrow from the hovered step touches stay bright; the rest of the process steps back.
  const near = new Set<string>();
  if (hoverStep) {
    near.add(hoverStep.id);
    for (const e of [...layout.forward, ...layout.back]) {
      if (e.from === hoverStep.id) near.add(e.to);
      if (e.to === hoverStep.id) near.add(e.from);
    }
  }

  // Labels never grow wider than the gap between two cards; the full text shows on hover.
  const maxChars = Math.floor((STEP_GAP_X - 16 - 14) / 5.4);
  const chip = (x: number, y: number, label: string, on: boolean) => {
    if (!label) return null;
    const text = label.length > maxChars ? `${label.slice(0, maxChars - 1).trimEnd()}…` : label;
    const w = text.length * 5.4 + 14;
    return (
      <g style={{ pointerEvents: 'auto' }}>
        <title>{label}</title>
        <rect
          x={x - w / 2} y={y - 9} width={w} height={18} rx={9}
          fill="hsl(var(--background))" stroke={on ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
        />
        <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={500} fill={on ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'}>
          {text}
        </text>
      </g>
    );
  };
  // Where an arrow's label sits: in the gap just before the card it points to, on the curve,
  // so it never lands on a card it passes over.
  const chipAt = (x1: number, y1: number, x2: number, y2: number, c: number) => {
    const tx = x2 - STEP_GAP_X / 2;
    if (tx <= x1) return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
    const bx = (t: number) => (1 - t) ** 3 * x1 + 3 * (1 - t) ** 2 * t * (x1 + c) + 3 * (1 - t) * t ** 2 * (x2 - c) + t ** 3 * x2;
    let lo = 0, hi = 1;
    for (let i = 0; i < 20; i++) {
      const m = (lo + hi) / 2;
      if (bx(m) < tx) lo = m; else hi = m;
    }
    const t = (lo + hi) / 2;
    return { x: tx, y: (1 - t) ** 3 * y1 + 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3 * y2 };
  };
  const dot = (d: string, on: boolean) =>
    on && !reduceMotion ? (
      <circle r={3.5} fill="hsl(var(--primary))">
        <animateMotion path={d} dur="1.6s" repeatCount="indefinite" />
      </circle>
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
          {hoursOf(p) !== null ? ` · ${fmtHrs(hoursOf(p)!)}/mo` : ''}
        </span>
        {runBy.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
            <Workflow className="h-3 w-3" /> Part of {runBy.join(', ')}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            data-ui
            onClick={onOpenProcess}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
          >
            Open process <ArrowRight className="h-3 w-3" />
          </button>
          {extra}
          {onClose && (
            <button
              type="button"
              data-ui
              onClick={onClose}
              title="Close it back to a card"
              aria-label={`Close ${p.name} back to a card`}
              className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>

      <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" style={{ pointerEvents: 'none' }} width={rect.w} height={rect.h} aria-hidden="true">
        <defs>
          <marker id={marker} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M 2 1.5 L 8 5 L 2 8.5" fill="none" stroke="hsl(220 9% 55%)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          </marker>
          <marker id={markerHi} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="10" markerHeight="10" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M 2 1.5 L 8 5 L 2 8.5" fill="none" stroke="hsl(var(--primary))" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        {layout.forward.map((e) => {
          const a = layout.pos.get(e.from);
          const b = layout.pos.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + STEP_W, y1 = a.y + STEP_H / 2, x2 = b.x, y2 = b.y + STEP_H / 2;
          const c = Math.max(24, (x2 - x1) / 2);
          const d = `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
          const on = lit(e);
          return (
            <g key={`${e.from}->${e.to}`} opacity={hoverStep && !on ? 0.35 : 1}>
              <path d={d} fill="none" stroke={on ? 'hsl(var(--primary))' : 'hsl(220 9% 62%)'} strokeWidth={on ? 2.25 : 1.5} markerEnd={`url(#${on ? markerHi : marker})`} />
              <circle cx={x1} cy={y1} r={2.5} fill={on ? 'hsl(var(--primary))' : 'hsl(220 9% 62%)'} />
              {dot(d, on)}
            </g>
          );
        })}
        {layout.back.map((e) => {
          const a = layout.pos.get(e.from);
          const b = layout.pos.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + STEP_W / 2, y1 = a.y + STEP_H, x2 = b.x + STEP_W / 2, y2 = b.y + STEP_H;
          const yb = bottom + FLOW_FOOT * 0.55;
          const d = `M ${x1} ${y1} C ${x1} ${yb}, ${x2} ${yb}, ${x2} ${y2 + 2}`;
          const on = lit(e);
          return (
            <g key={`${e.from}->${e.to}`} opacity={hoverStep && !on ? 0.35 : 1}>
              <path
                d={d} fill="none"
                stroke={on ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.55)'}
                strokeWidth={on ? 2.25 : 1.75}
                strokeDasharray={on ? undefined : '6 4'}
                markerEnd={`url(#${on ? markerHi : marker})`}
              />
              {dot(d, on)}
            </g>
          );
        })}
      </svg>

      {[...layout.pos].map(([id, at]) => {
        const st = byId.get(id);
        if (!st) return null;
        const decision = st.stepType === 'Decision';
        const sub = st.subProcessId ? names.get(st.subProcessId) ?? null : null;
        const on = lens ? stepMatches(lens, st) : true;
        const faded = (lens && !on) || (hoverStep && !near.has(id));
        return (
          <div
            key={id}
            onMouseEnter={(e) => setHoverStep({ id, box: e.currentTarget.getBoundingClientRect() })}
            onMouseLeave={() => setHoverStep((h) => (h?.id === id ? null : h))}
            className={`absolute flex flex-col rounded-xl border p-2.5 transition-[opacity,box-shadow] duration-200 ${
              hoverStep?.id === id ? 'ring-2 ring-primary' : ''
            } ${
              lens && on
                ? 'border-primary bg-primary/[0.06] ring-2 ring-primary/30'
                : sub
                ? 'border-indigo-300 bg-indigo-50'
                : st.automated
                ? 'border-emerald-200 bg-emerald-50/60'
                : decision
                ? 'border-amber-200 bg-amber-50/50'
                : 'border-border bg-background'
            } ${faded ? 'opacity-35' : ''}`}
            style={{
              left: at.x,
              top: at.y,
              width: STEP_W,
              height: STEP_H,
              // A sub-process step looks like a stack of cards: there is a whole process behind it.
              boxShadow: sub
                ? '5px 5px 0 -1px hsl(var(--card)), 5px 5px 0 0 hsl(239 60% 82%), 10px 10px 0 -1px hsl(var(--card)), 10px 10px 0 0 hsl(239 60% 88%)'
                : '0 1px 2px rgba(16,24,40,0.05)',
            }}
          >
            <span className="flex items-center gap-1.5">
              {st.who && <Icon w={st.who} size={13} />}
              <span className="min-w-0 flex-1 truncate text-[10px] font-semibold">{st.who?.name ?? 'Nobody yet'}</span>
              {sub && (
                <span className="inline-flex shrink-0 items-center gap-0.5 text-[9px] font-semibold text-indigo-700">
                  <Workflow className="h-2.5 w-2.5" /> Sub-process
                </span>
              )}
              {!sub && st.automated && (
                <span className="inline-flex shrink-0 items-center gap-0.5 text-[9px] font-semibold" style={{ color: AUTOMATED }}>
                  <Zap className="h-2.5 w-2.5" /> Auto
                </span>
              )}
              {decision && <span className="shrink-0 text-[9px] font-semibold text-amber-700">Decision</span>}
              {st.stepType === 'Wait' && <span className="shrink-0 text-[9px] font-semibold text-muted-foreground">Wait</span>}
            </span>
            <span className="mt-1 line-clamp-2 text-[12px] font-medium leading-snug">{st.title}</span>
            <span className="mt-auto flex items-center gap-1">
              {sub ? (
                <button
                  type="button"
                  data-ui
                  onClick={() => onJump(st.subProcessId!)}
                  className="inline-flex max-w-full cursor-pointer items-center gap-1 truncate rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-white"
                >
                  Runs {sub} <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                </button>
              ) : (
                <>
                  {st.uses.slice(0, 4).map((u) => (
                    <span key={u.id} title={u.name}>
                      <Icon w={u} size={11} />
                    </span>
                  ))}
                  {st.uses.length > 4 && <span className="text-[9px] text-muted-foreground">+{st.uses.length - 4}</span>}
                  {st.checklist.length > 0 && (
                    <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
                      <ListChecks className="h-3 w-3" /> {st.checklist.length}
                    </span>
                  )}
                </>
              )}
            </span>
          </div>
        );
      })}

      {/* Arrow labels sit above the cards so a card can never cover one. */}
      <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={rect.w} height={rect.h} aria-hidden="true">
        {layout.forward.map((e) => {
          const a = layout.pos.get(e.from);
          const b = layout.pos.get(e.to);
          if (!a || !b || !e.label) return null;
          const x1 = a.x + STEP_W, y1 = a.y + STEP_H / 2, x2 = b.x, y2 = b.y + STEP_H / 2;
          const at = chipAt(x1, y1, x2, y2, Math.max(24, (x2 - x1) / 2));
          const on = lit(e);
          return (
            <g key={`${e.from}->${e.to}`} opacity={hoverStep && !on ? 0.35 : 1}>
              {chip(at.x, at.y, e.label, on)}
            </g>
          );
        })}
        {layout.back.map((e) => {
          const a = layout.pos.get(e.from);
          const b = layout.pos.get(e.to);
          if (!a || !b) return null;
          const on = lit(e);
          return (
            <g key={`${e.from}->${e.to}`} opacity={hoverStep && !on ? 0.35 : 1}>
              {chip((a.x + b.x + STEP_W) / 2, bottom + FLOW_FOOT * 0.55 - 6, e.label || 'Goes back', on)}
            </g>
          );
        })}
      </svg>

      {hoverStep && byId.get(hoverStep.id) && <StepDetails st={byId.get(hoverStep.id)!} box={hoverStep.box} names={names} />}
    </>
  );
}

// --- A department, opened ---

/**
 * What a department adds up to, worked out from its maps: hours, who does the
 * most, where work comes in, and a few plain sentences that say how it runs.
 */
function deptInsight(title: string, procs: Proc[]) {
  const roles = new Map<string, { who: Who; steps: number; hours: number }>();
  const appSteps = new Map<string, number>();
  const appNames = new Map<string, string>();
  const starters = new Map<string, Who>();
  const outside = new Map<string, Who>();
  const ready: { id: string; title: string; apps: string[]; hours: number | null }[] = [];
  let hours = 0;
  let steps = 0;
  let automated = 0;

  for (const p of procs) {
    hours += hoursOf(p) ?? 0;
    const hasIncoming = new Set(p.links.map((l) => l.to));
    for (const st of p.steps) {
      if (st.stepType !== 'Wait') steps += 1;
      if (st.automated) automated += 1;
      for (const u of st.uses) {
        if (u.kind !== 'app') continue;
        appSteps.set(u.id, (appSteps.get(u.id) ?? 0) + 1);
        appNames.set(u.id, u.name);
      }
      if (st.who?.kind === 'app') appSteps.set(st.who.id, (appSteps.get(st.who.id) ?? 0) + 1);
      if (st.who && !hasIncoming.has(st.id)) starters.set(st.who.id, st.who);
      if (st.who?.kind === 'person' && st.who.party === 'External') outside.set(st.who.id, st.who);
      if (!isTeamStep(st)) continue;
      const h = hoursFrom(st.minutes ?? 0, p) ?? 0;
      const role = roles.get(st.who!.id) ?? { who: st.who!, steps: 0, hours: 0 };
      role.steps += 1;
      role.hours += h;
      roles.set(st.who!.id, role);
      const apps = st.uses.filter((u) => u.kind === 'app');
      if (st.stepType === 'Task' && apps.length >= 2) {
        ready.push({ id: st.id, title: st.title, apps: apps.map((u) => u.name), hours: st.minutes ? h : null });
      }
    }
  }

  const busiest = [...roles.values()].sort((x, y) => y.hours - x.hours || y.steps - x.steps)[0] ?? null;
  const topApps = [...appSteps.entries()]
    .filter(([id]) => appNames.has(id))
    .sort((x, y) => y[1] - x[1])
    .slice(0, 3)
    .map(([id]) => appNames.get(id)!);
  const list = (names: string[]) =>
    names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  // "the Finance Lead", but a named person is just their name.
  const nameOf = (w: Who) => (w.humanKind === 'Individual' ? w.name : `the ${w.name}`);
  const the = (ws: Who[]) => list(ws.map(nameOf));

  const parts = [
    `${title} runs ${plural(procs.length, 'process')}${hours > 0 ? ` and takes about ${fmtHrs(hours)} of people time a month` : ''}.`,
  ];
  const startWho = [...starters.values()].filter((w) => !outside.has(w.id));
  if (startWho.length) parts.push(`Work starts with ${the(startWho)}.`);
  if (busiest) {
    const who = nameOf(busiest.who);
    parts.push(`${who[0].toUpperCase()}${who.slice(1)} does the most${topApps.length ? `, mostly in ${list(topApps)}` : ''}.`);
  }
  if (outside.size) parts.push(`It also involves ${the([...outside.values()])}.`);
  parts.push(automated === 0 ? 'Nothing runs on its own yet.' : `Apps do ${automated} of ${steps} steps on their own.`);

  return {
    story: parts.join(' '),
    hours,
    roles,
    appSteps,
    busiest,
    ready: ready.sort((x, y) => (y.hours ?? -1) - (x.hours ?? -1) || y.apps.length - x.apps.length).slice(0, 3),
  };
}

/**
 * One department at full size: its summary and lead on top, then every process
 * in it laid out left to right at a readable size, one under the other. Wide
 * processes scroll sideways. Back returns to the board exactly as it was.
 */
function DeptView({ title, hue, procs, lead, canEdit, lens, names, runByOf, onJump, onBack, onSetLead, onOpenProcess, onTrain }: {
  title: string;
  hue: number;
  procs: Proc[];
  lead: Who | null;
  canEdit: boolean;
  lens: Lens | null;
  names: Map<string, string>;
  runByOf: Map<string, string[]>;
  onJump: (processId: string) => void;
  onBack: () => void;
  onSetLead: (() => void) | null;
  onOpenProcess: (id: string) => void;
  onTrain: (id: string) => void;
}) {
  const flows = useMemo(() => procs.map((p) => ({ p, layout: flowLayout(p.steps.map((s) => s.id), p.links) })), [procs]);
  const people = [...new Map(procs.flatMap((p) => p.people).map((w) => [w.id, w])).values()];
  const apps = [...new Map(procs.flatMap((p) => p.apps).map((a) => [a.id, a])).values()];
  const a = procs.reduce((n, p) => n + p.automated, 0);
  const r = procs.reduce((n, p) => n + p.review, 0);
  const m = procs.reduce((n, p) => n + p.manual, 0);
  const color = `hsl(${hue} 45% 30%)`;

  // A role or app chip lights up its steps here: pointing shows them, clicking keeps them lit.
  // The board's own spotlight still shows when nothing here is picked.
  const [hoverWho, setHoverWho] = useState<{ kind: Lens['kind']; who: Who } | null>(null);
  const [pinnedWho, setPinnedWho] = useState<{ kind: Lens['kind']; who: Who } | null>(null);
  const picked = hoverWho ?? pinnedWho;
  const localLens: Lens | null = picked
    ? (() => {
        const l: Lens = { ...picked, ids: new Set(), pinned: !hoverWho };
        for (const p of procs) if (p.steps.some((st) => stepMatches(l, st))) l.ids.add(p.id);
        return l;
      })()
    : null;
  const shownLens = localLens ?? lens;
  const chipProps = (kind: Lens['kind'], who: Who) => ({
    onMouseEnter: () => setHoverWho({ kind, who }),
    onMouseLeave: () => setHoverWho(null),
    onClick: () => setPinnedWho((cur) => (cur?.who.id === who.id ? null : { kind, who })),
  });

  const insight = useMemo(() => deptInsight(title, procs), [title, procs]);

  return (
    <div data-ui className="absolute inset-0 z-30 flex cursor-default flex-col bg-[hsl(220_20%_97.5%)]">
      <header
        className="shrink-0 border-b border-border px-8 pb-5 pt-5"
        style={{ background: `linear-gradient(180deg, hsl(${hue} 80% 95%), hsl(${hue} 80% 97% / 0.4))` }}
      >
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 text-sm font-medium text-muted-foreground hover:bg-white/70 hover:text-foreground"
        >
          <ArrowRight className="h-4 w-4 rotate-180" /> Back to the board
        </button>
        <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h2 className="text-3xl font-semibold tracking-tight" style={{ color }}>{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {plural(procs.length, 'process')} · {plural(people.length, 'person')} · {plural(apps.length, 'app')}
              {a + r + m > 0 ? ` · ${Math.round((a / (a + r + m)) * 100)}% automated` : ''}
            </p>
          </div>
          {(lead || (canEdit && onSetLead)) && (
            <button
              type="button"
              disabled={!canEdit || !onSetLead}
              onClick={() => onSetLead?.()}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium enabled:hover:bg-muted"
            >
              <Crown className="h-4 w-4" style={{ color }} />
              {lead ? (
                <>
                  <Icon w={lead} size={16} /> {lead.name}
                  <span className="text-xs font-normal text-muted-foreground">leads it</span>
                </>
              ) : (
                'Set a lead'
              )}
            </button>
          )}
          <div className="ml-auto w-64">
            <MixBar a={a} r={r} m={m} />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {a} on their own · {r} decided by a person · {m} by hand
            </p>
          </div>
        </div>
        {(people.length > 0 || apps.length > 0) && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {people.map((w) => {
                const on = picked?.who.id === w.id;
                const role = insight.roles.get(w.id);
                return (
                  <button
                    key={w.id}
                    type="button"
                    {...chipProps('person', w)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                      on ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:border-primary/40'
                    } ${pinnedWho?.who.id === w.id ? 'ring-2 ring-primary/25' : ''}`}
                  >
                    <Icon w={w} size={13} /> {w.name}
                    {on && role && (
                      <span className="text-[11px] opacity-80">
                        · {plural(role.steps, 'step')}
                        {role.hours > 0 ? ` · ${fmtHrs(role.hours)}/mo` : ''}
                      </span>
                    )}
                  </button>
                );
              })}
              {apps.length > 0 && <span className="mx-1 h-4 w-px bg-border" />}
              {apps.map((ap) => {
                const on = picked?.who.id === ap.id;
                return (
                  <button
                    key={ap.id}
                    type="button"
                    aria-label={ap.name}
                    {...chipProps('app', ap)}
                    className={`group relative rounded-md border p-1 transition-colors ${
                      on ? 'border-primary bg-primary/10' : 'border-border bg-background hover:border-primary/40'
                    } ${pinnedWho?.who.id === ap.id ? 'ring-2 ring-primary/25' : ''}`}
                  >
                    <Icon w={ap} size={14} />
                    <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background shadow-md group-hover:block">
                      {ap.name}
                      {insight.appSteps.get(ap.id) ? ` · ${plural(insight.appSteps.get(ap.id)!, 'step')}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {pinnedWho ? `Showing ${pinnedWho.who.name}'s steps. Click it again to clear.` : 'Point at a role or app to light up its steps. Click to keep them lit.'}
            </p>
          </>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-8 py-6">
        <section className="rounded-2xl border border-border bg-card px-7 py-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
          <p className="text-sm font-semibold">How {title} works</p>
          <p className="mt-1.5 max-w-4xl text-sm leading-relaxed text-muted-foreground">{insight.story}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-muted/50 px-4 py-3">
              <p className="text-[11px] text-muted-foreground">People hours a month</p>
              <p className="mt-0.5 text-xl font-semibold tracking-tight">{insight.hours > 0 ? fmtHrs(insight.hours) : '—'}</p>
            </div>
            <div className="rounded-xl bg-muted/50 px-4 py-3">
              <p className="text-[11px] text-muted-foreground">Busiest role</p>
              <p className="mt-1 truncate text-sm font-semibold">
                {insight.busiest
                  ? `${insight.busiest.who.name} · ${insight.busiest.hours > 0 ? fmtHrs(insight.busiest.hours) : plural(insight.busiest.steps, 'step')}`
                  : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-muted/50 px-4 py-3">
              <p className="text-[11px] text-muted-foreground">Done by apps</p>
              <p className="mt-0.5 text-xl font-semibold tracking-tight">
                {a} <span className="text-sm font-normal text-muted-foreground">of {a + r + m} steps</span>
              </p>
            </div>
          </div>
          {insight.ready.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ready to automate here</p>
              <ol className="mt-1.5 space-y-1">
                {insight.ready.map((st, i) => (
                  <li key={st.id} className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="w-4 text-muted-foreground">{i + 1}.</span>
                    <span className="font-medium">{st.title}</span>
                    <span className="text-xs text-muted-foreground">
                      · {st.apps.join(' → ')}
                      {st.hours !== null ? ` · ${fmtHrs(st.hours)}/mo` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        {flows.map(({ p, layout }) => (
          <section key={p.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
            {p.steps.length === 0 ? (
              <div className="flex items-center gap-3 px-7 py-5">
                <span className="text-[17px] font-semibold tracking-tight">{p.name}</span>
                <span className="text-xs text-muted-foreground">No steps yet</span>
                <Button size="sm" variant="outline" className="ml-auto h-8" onClick={() => onOpenProcess(p.id)}>
                  Open process
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="relative" style={{ width: Math.max(layout.width, 600), height: layout.height }}>
                  <FlowView
                    p={p}
                    rect={{ x: 0, y: 0, w: layout.width, h: layout.height }}
                    layout={layout}
                    lens={shownLens && shownLens.ids.has(p.id) ? shownLens : null}
                    names={names}
                    runBy={runByOf.get(p.id) ?? []}
                    onJump={onJump}
                    onOpenProcess={() => onOpenProcess(p.id)}
                    extra={
                      p.live ? (
                        <button
                          type="button"
                          onClick={() => onTrain(p.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
                        >
                          <GraduationCap className="h-3 w-3" /> Train
                        </button>
                      ) : null
                    }
                  />
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

// --- The tour ---

interface TourStep {
  /** What to point at. Nothing means the middle of the screen. */
  anchor: string | null;
  title: string;
  text: string;
}

const TOUR: TourStep[] = [
  {
    anchor: null,
    title: 'Welcome to the company brain',
    text: 'Every process in the business, on one board. Drag to move around. Pinch, scroll, or use the zoom buttons to get closer.',
  },
  {
    anchor: '[data-tour="dept"]',
    title: 'Departments',
    text: 'Each colored frame is a department. Click Open next to its name to see every process inside it, step by step, at full size.',
  },
  {
    anchor: '[data-tour="view"]',
    title: 'Cards or every step',
    text: 'Switch the whole board between cards and every process laid out step by step.',
  },
  {
    anchor: '[data-tour="card"]',
    title: 'Processes',
    text: 'Each card is a process. Zoom in to read its steps. Click it for details, or use the expand icon to lay its steps out right here.',
  },
  {
    anchor: '[data-tour="lens"]',
    title: 'Roles and apps',
    text: 'Click a role or an app to spotlight every step it is part of, and open its profile on the right.',
  },
];

/** A few tips pointing at the real controls. Shown on the first visit, and from the ? button. */
function Tour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);
  const step = TOUR[i];

  useLayoutEffect(() => {
    const place = () => setBox(step.anchor ? document.querySelector(step.anchor)?.getBoundingClientRect() ?? null : null);
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [step]);

  const last = i === TOUR.length - 1;
  const W = 300;
  let left = window.innerWidth / 2 - W / 2;
  let top = window.innerHeight / 2 - 90;
  if (box) {
    const right = box.right + 16;
    left = right + W < window.innerWidth - 16 ? right : Math.max(16, box.left - W - 16);
    if (left < 16 || (box.left - W - 16 < 16 && right + W >= window.innerWidth - 16)) {
      left = Math.min(Math.max(16, box.left), window.innerWidth - W - 16);
      top = Math.min(box.bottom + 14, window.innerHeight - 200);
    } else {
      top = Math.min(Math.max(16, box.top), window.innerHeight - 200);
    }
  }

  return (
    <div data-ui className="fixed inset-0 z-[70] cursor-default">
      {box ? (
        <div
          className="pointer-events-none absolute rounded-2xl ring-2 ring-primary transition-all duration-300"
          style={{
            left: box.left - 6,
            top: box.top - 6,
            width: box.width + 12,
            height: box.height + 12,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.45)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-900/45" />
      )}
      <div
        role="dialog"
        aria-label={step.title}
        className="absolute rounded-2xl border border-border bg-background p-4 shadow-2xl"
        style={{ left, top, width: W }}
      >
        <p className="text-[11px] font-medium text-primary">
          Tip {i + 1} of {TOUR.length}
        </p>
        <p className="mt-0.5 text-sm font-semibold">{step.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={onDone} className="text-xs text-muted-foreground hover:text-foreground">
            Skip
          </button>
          <span className="ml-auto" />
          {i > 0 && (
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setI(i - 1)}>
              Back
            </Button>
          )}
          <Button size="sm" className="h-8" autoFocus onClick={() => (last ? onDone() : setI(i + 1))}>
            {last ? 'Got it' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface View {
  x: number;
  y: number;
  z: number;
}

/**
 * The company brain: a board with every process on it, like a whiteboard you
 * can move around. Departments are frames; click one to open everything in it.
 * Zoom out for the bird's-eye view, zoom in to read each process step by step.
 * Click an app or a person on the left to spotlight every step they touch.
 */
export default function Brain() {
  const navigate = useNavigate();
  const { canEdit } = useMe();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    setData(null);
    getBrain({})
      .then(setData)
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const procs = data?.processes ?? null;
  const names = useMemo(() => new Map((procs ?? []).map((p) => [p.id, p.name])), [procs]);
  const byId = useMemo(() => new Map((procs ?? []).map((p) => [p.id, p])), [procs]);
  const leads = useMemo(() => new Map((data?.departments ?? []).map((d) => [d.name, d.lead])), [data]);

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
  const appById = useMemo(() => new Map(lenses.apps.map((l) => [l.who.id, l.who])), [lenses]);

  // --- Spotlight ---
  const [lens, setLens] = useState<Lens | null>(null);
  /** Hide everything that isn't in the spotlight. */
  const [onlyLens, setOnlyLens] = useState(false);
  const [tab, setTab] = useState<'apps' | 'people'>('people');
  const pinned = lens?.pinned ? lens : null;

  // Processes opened up on the board, step by step. The rest stay as cards.
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const boardProcs = useMemo(
    () => (pinned && onlyLens ? (procs ?? []).filter((p) => pinned.ids.has(p.id)) : procs ?? []),
    [procs, pinned, onlyLens],
  );
  const board = useMemo(() => layoutBoard(boardProcs, opened), [boardProcs, opened]);

  const links = useMemo(() => {
    const shown = new Set(boardProcs.map((p) => p.id));
    const out: { from: string; to: string }[] = [];
    for (const p of boardProcs) for (const r of p.runs) if (shown.has(r.processId)) out.push({ from: p.id, to: r.processId });
    return out;
  }, [boardProcs]);

  // Lets earlier callbacks close the department view, which is declared further down.
  const setDeptOpenRef = useRef<((v: string | null) => void) | null>(null);

  /** Which processes run each one, by name. */
  const runByOf = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of procs ?? []) {
      for (const id of new Set(p.runs.map((r) => r.processId))) m.set(id, [...(m.get(id) ?? []), p.name]);
    }
    return m;
  }, [procs]);

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

  /** Glide so this box fills the screen, but never closer than full size. */
  const frameBox = useCallback((box: Rect, maxZ = 1) => {
    const el = stage.current;
    if (!el || box.w === 0) return;
    const r = el.getBoundingClientRect();
    const pad = 72;
    // On a wide screen, keep clear of the panel on the left so nothing starts underneath it.
    const left = r.width > 900 ? 296 : pad;
    const z = Math.min(maxZ, Math.max(Z_MIN, Math.min((r.width - left - pad) / box.w, (r.height - pad * 2) / box.h)));
    setGlide(true);
    setView({ z, x: left + (r.width - left - pad - box.w * z) / 2 - box.x * z, y: Math.max(pad, (r.height - box.h * z) / 2) - box.y * z });
  }, []);

  const fit = useCallback(
    (animate = true) => {
      frameBox({ x: 0, y: 0, w: board.width, h: board.height });
      if (!animate) setGlide(false);
    },
    [board, frameBox],
  );

  /** Glide to one process and zoom in close enough to read it. */
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
  const [after, setAfter] = useState<{ fly?: string; frame?: string; fit?: boolean; start?: boolean } | null>(null);
  useEffect(() => {
    if (!after) return;
    if (after.fly) flyTo(after.fly);
    else if (after.frame) {
      const f = board.frames.find((x) => x.key === after.frame);
      if (f) frameBox(f);
    } else if (after.start) {
      // Every step, opened: start at the top left at a size where each step can be read and pointed at.
      // Fitting the whole company would make every step a speck.
      const el = stage.current;
      const f = board.frames[0];
      if (el && f) {
        const r = el.getBoundingClientRect();
        const left = r.width > 900 ? 296 : 24;
        const z = 0.5;
        setGlide(true);
        setView({ z, x: left - f.x * z, y: 72 - f.y * z });
      }
    } else if (after.fit) fit();
    setAfter(null);
  }, [board, after, flyTo, fit, frameBox]);

  const openFlow = useCallback((id: string) => {
    setOpened((prev) => new Set(prev).add(id));
    setAfter({ fly: id });
  }, []);
  /** From a sub-process step to the process it runs: open that one on the board and glide to it. */
  const jumpTo = useCallback(
    (id: string) => {
      setDeptOpenRef.current?.(null);
      setOpened((prev) => new Set(prev).add(id));
      setAfter({ fly: id });
    },
    [],
  );
  const closeFlow = useCallback((id: string) => {
    setOpened((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);
  const openable = (ids: string[]) => ids.filter((id) => (byId.get(id)?.steps.length ?? 0) > 0);
  const allOpen = boardProcs.length > 0 && openable(boardProcs.map((p) => p.id)).every((id) => opened.has(id));
  const toggleAll = () => {
    setOpened(allOpen ? new Set() : new Set(openable(boardProcs.map((p) => p.id))));
    setAfter(allOpen ? { fit: true } : { start: true });
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
  const [query, setQuery] = useState('');
  // The department opened at full size, by its frame key.
  const [deptOpen, setDeptOpen] = useState<string | null>(null);
  setDeptOpenRef.current = setDeptOpen;

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

  const clearLens = useCallback(() => {
    setLens(null);
    setOnlyLens(false);
  }, []);
  const pinLens = (kind: 'app' | 'person', who: Who, ids: string[]) => {
    if (pinned?.who.id === who.id) {
      clearLens();
      if (onlyLens) setAfter({ fit: true });
      return;
    }
    setLens({ kind, who, ids: new Set(ids), pinned: true });
    // Their profile opens on the right; the process panel steps aside.
    setSelected(null);
    if (onlyLens) setAfter({ fit: true });
  };

  // --- The tour: on the first visit, and from the ? button ---
  const [touring, setTouring] = useState(false);
  useEffect(() => {
    if (!procs || procs.length === 0) return;
    try {
      if (!localStorage.getItem(TOUR_KEY)) setTouring(true);
    } catch {
      /* no storage: just skip the tour */
    }
  }, [procs]);
  const endTour = () => {
    setTouring(false);
    try {
      localStorage.setItem(TOUR_KEY, '1');
    } catch {
      /* it may show again next time */
    }
  };

  // Keys: + and - zoom, 0 fits everything, Esc closes the panel and the spotlight.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey || touring) return;
      const el = stage.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (e.key === '+' || e.key === '=') zoomAt(viewRef.current.z * 1.25, r.width / 2, r.height / 2, true);
      else if (e.key === '-') zoomAt(viewRef.current.z / 1.25, r.width / 2, r.height / 2, true);
      else if (e.key === '0') fit();
      else if (e.key === 'Escape') {
        if (deptOpen !== null) setDeptOpen(null);
        else {
          setSelected(null);
          clearLens();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomAt, fit, clearLens, touring, deptOpen]);

  // What is lit up: the spotlight, a search, or the process you point at and what it links to.
  const q = query.trim().toLowerCase();
  const focus = useMemo(() => {
    if (lens) return lens.ids;
    if (q) {
      return new Set(
        boardProcs
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
  }, [lens, q, boardProcs, hover, selected, links]);

  // The spotlight in numbers: every step the app or person is part of.
  const spot = useMemo(() => {
    if (!pinned || !procs) return null;
    let steps = 0;
    let auto = 0;
    let hand = 0;
    let decide = 0;
    const depts = new Set<string>();
    const apps = new Map<string, Who>();
    const people = new Map<string, Who>();
    const perProcess: { p: Proc; n: number }[] = [];
    for (const p of procs) {
      if (!pinned.ids.has(p.id)) continue;
      const mine = p.steps.filter((s) => stepMatches(pinned, s));
      if (!mine.length) continue;
      perProcess.push({ p, n: mine.length });
      if (p.department) depts.add(p.department);
      for (const s of mine) {
        steps += 1;
        if (s.automated) auto += 1;
        else if (s.stepType === 'Decision') decide += 1;
        else if (s.stepType !== 'Wait') hand += 1;
        for (const u of s.useIds) {
          const a = appById.get(u);
          if (a && a.id !== pinned.who.id) apps.set(a.id, a);
        }
        // For an app: the people who work in it, and any app doing the step it is used in.
        if (s.who && s.who.id !== pinned.who.id) {
          if (s.who.kind === 'person') people.set(s.who.id, s.who);
          else if (s.who.kind === 'app') apps.set(s.who.id, s.who);
        }
      }
    }
    return {
      steps, auto, hand, decide,
      depts: [...depts].sort(),
      apps: [...apps.values()].sort((a, b) => a.name.localeCompare(b.name)),
      people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)),
      perProcess,
    };
  }, [pinned, procs, appById]);

  // --- Department leads ---
  const [leadFor, setLeadFor] = useState<string | null>(null);
  const chooseLead = async (dept: string, leadId: string | null) => {
    setLeadFor(null);
    try {
      await setDepartmentLead({ department: dept, leadId });
      const lead = leadId ? data?.people.find((w) => w.id === leadId) ?? null : null;
      setData((d) =>
        d
          ? { ...d, departments: [...d.departments.filter((x) => x.name !== dept), { name: dept, lead }] }
          : d,
      );
      toast.success(lead ? `${lead.name} now leads ${dept}` : `${dept} has no lead`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the lead.');
    }
  };

  const level: 'far' | 'mid' | 'near' = view.z < FAR ? 'far' : view.z < NEAR ? 'mid' : 'near';
  const sel = selected ? byId.get(selected) ?? null : null;
  const runBy = sel ? (procs ?? []).filter((p) => p.runs.some((r) => r.processId === sel.id)) : [];
  const profile = !sel ? pinned : null;
  // Only the profile sits on the right; the process pop-up covers the middle.
  const panelOpen = !!profile;

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
  const firstCardId = boardProcs.find((p) => board.cards.has(p.id))?.id;

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
        if ((e.target as HTMLElement).closest('[data-ui]')) return;
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
          transition: glide ? 'transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1)' : undefined,
        }}
      >
        {/* Department frames, behind everything. Their headers are drawn on top further down. */}
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
          />
        ))}

        {/* Arrows where one process runs another. */}
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" style={{ pointerEvents: 'none' }} width={board.width} height={board.height} aria-hidden="true">
          <defs>
            <marker id="brain-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="12" markerHeight="12" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M 2 1.5 L 8 5 L 2 8.5" fill="none" stroke="hsl(var(--primary))" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          {links.map((l) => {
            let a = board.rectOf(l.from);
            const b = board.rectOf(l.to);
            if (!a || !b) return null;
            // From an opened process, the arrow starts at the step that runs the other process.
            const flow = board.flows.get(l.from);
            const subStep = flow ? byId.get(l.from)?.steps.find((st) => st.subProcessId === l.to) : null;
            const at = subStep ? flow!.layout.pos.get(subStep.id) : null;
            if (flow && at) a = { x: flow.x + at.x, y: flow.y + at.y, w: STEP_W, h: STEP_H };
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

        {boardProcs.map((p) => {
          const pos = board.cards.get(p.id);
          if (!pos) return null;
          const dim = !!focus && !focus.has(p.id);
          const isSel = selected === p.id;
          return (
            <div
              key={p.id}
              data-card={p.id}
              data-tour={p.id === firstCardId ? 'card' : undefined}
              role="button"
              tabIndex={0}
              aria-label={p.name}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover((h) => (h === p.id ? null : h))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSelected(p.id);
              }}
              className={`absolute overflow-hidden rounded-2xl border bg-card shadow-[0_1px_3px_rgba(16,24,40,0.06)] transition-[opacity,box-shadow,border-color] duration-200 hover:shadow-[0_10px_30px_rgba(16,24,40,0.12)] ${
                isSel ? 'border-primary ring-4 ring-primary/20' : pinned && pinned.ids.has(p.id) ? 'border-primary/50' : 'border-border'
              } ${dim ? 'opacity-25' : ''}`}
              style={{ left: pos.x, top: pos.y, width: CARD_W, height: CARD_H }}
            >
              <Card p={p} level={level} names={names} lens={lens} onOpenFlow={() => openFlow(p.id)} />
            </div>
          );
        })}

        {/* Opened processes: every step, left to right. */}
        {boardProcs.map((p) => {
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
                lens={lens && lens.ids.has(p.id) ? lens : null}
                names={names}
                runBy={runByOf.get(p.id) ?? []}
                onJump={jumpTo}
                onClose={() => closeFlow(p.id)}
                onOpenProcess={() => navigate(`/process/${p.id}`)}
              />
            </div>
          );
        })}

        {/* Department headers: on top of everything on the board, so Open and the lead are always clickable. */}
        {board.frames.map((f, fi) => {
          const members = f.ids.map((id) => byId.get(id)!).filter(Boolean);
          const people = new Set(members.flatMap((p) => p.people.map((w) => w.id))).size;
          const apps = new Set(members.flatMap((p) => p.apps.map((a) => a.id))).size;
          const a = members.reduce((n, p) => n + p.automated, 0);
          const work = members.reduce((n, p) => n + p.automated + p.review + p.manual, 0);
          const lead = f.dept ? leads.get(f.dept) ?? null : null;
          const big = level === 'far';
          const color = `hsl(${f.hue} 45% 32%)`;
          return (
            <div
              key={f.key}
              className="absolute z-10 flex items-start gap-4 px-10 pt-6"
              style={{ left: f.x, top: f.y, width: f.w, color }}
            >
                <button
                  type="button"
                  data-ui
                  data-tour={fi === 0 ? 'dept' : undefined}
                  onClick={() => setDeptOpen(f.key)}
                  title="Open this department and see every process step by step"
                  className="group min-w-0 cursor-pointer rounded-xl px-2 py-1 -ml-2 text-left transition-colors hover:bg-white/70"
                >
                  <span className="flex items-center gap-3">
                    <span className={`font-semibold tracking-tight ${big ? 'text-[44px]' : 'text-[26px]'}`}>{f.title}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border bg-white/90 font-semibold shadow-sm transition-colors group-hover:bg-white ${
                        big ? 'px-4 py-1.5 text-[22px]' : 'px-2.5 py-0.5 text-[12px]'
                      }`}
                      style={{ borderColor: `hsl(${f.hue} 55% 80%)` }}
                    >
                      Open <ArrowRight className={big ? 'h-6 w-6' : 'h-3.5 w-3.5'} />
                    </span>
                  </span>
                  {/* Zoomed far out there is no room for it under the big name: it would spill onto the cards. */}
                  {!big && (
                    <span className="mt-0.5 block truncate whitespace-nowrap text-[13px] opacity-75">
                      {plural(f.ids.length, 'process')} · {plural(people, 'person')} · {plural(apps, 'app')}
                      {work > 0 ? ` · ${Math.round((a / work) * 100)}% automated` : ''}
                    </span>
                  )}
                </button>
                {f.dept && (lead || canEdit) && (
                  <button
                    type="button"
                    data-ui
                    disabled={!canEdit}
                    onClick={() => setLeadFor(f.dept)}
                    className={`ml-auto mt-2 inline-flex shrink-0 items-center gap-2 rounded-full border bg-white/80 px-3 py-1.5 font-medium transition-colors ${
                      big ? 'text-[22px]' : 'text-[13px]'
                    } ${canEdit ? 'cursor-pointer hover:bg-white' : 'cursor-default'}`}
                    style={{ borderColor: `hsl(${f.hue} 55% 86%)` }}
                  >
                    <Crown className={big ? 'h-6 w-6' : 'h-3.5 w-3.5'} />
                    {lead ? (
                      <>
                        <Icon w={lead} size={big ? 26 : 15} /> {lead.name}
                      </>
                    ) : (
                      'Set a lead'
                    )}
                  </button>
                )}
            </div>
          );
        })}

      </div>

      {/* Top left: name, search, and the apps and people list. These stay put while the board moves. */}
      <div data-ui className="absolute left-4 top-4 z-20 flex max-h-[calc(100%-2rem)] w-[264px] cursor-default flex-col gap-2">
        <div className="rounded-2xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
          <div className="flex items-center gap-2">
            <BrainIcon className="h-4 w-4 text-primary" />
            <p className="flex-1 text-sm font-semibold">Company brain</p>
            <button
              type="button"
              onClick={() => setTouring(true)}
              title="How to use this page"
              aria-label="How to use this page"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
          <div className="relative mt-2.5">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                clearLens();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && focus && focus.size) flyTo([...focus][0]);
              }}
              placeholder="Find a process, step, app…"
              className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-2 text-xs outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </div>

        <BrainKey showsSteps={opened.size > 0} />

        <div data-tour="lens" className="flex min-h-0 flex-col rounded-2xl border border-border bg-background/95 shadow-sm backdrop-blur">
          <div className="flex gap-1 p-1.5">
            {(['people', 'apps'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  clearLens();
                }}
                className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                  tab === t ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'apps' ? `Apps (${lenses.apps.length})` : `Roles (${lenses.people.length})`}
              </button>
            ))}
          </div>
          <p className="px-3 pb-1 text-[10px] text-muted-foreground">
            {tab === 'apps'
              ? 'Click an app to spotlight its steps and see its profile.'
              : 'Click a role to spotlight its steps and see its profile.'}
          </p>
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-1.5">
            {lensList.map(({ who, ids }) => {
              const active = pinned?.who.id === who.id;
              const kind = tab === 'apps' ? 'app' : 'person';
              return (
                <li key={who.id}>
                  <button
                    type="button"
                    onMouseEnter={() => {
                      if (!pinned) setLens({ kind, who, ids: new Set(ids), pinned: false });
                    }}
                    onMouseLeave={() => {
                      if (!pinned) setLens(null);
                    }}
                    onClick={() => pinLens(kind, who, ids)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                      active ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                    }`}
                  >
                    <Icon w={who} size={tab === 'people' ? 16 : 14} />
                    <span className="min-w-0 flex-1 truncate font-medium">{who.name}</span>
                    <span className="tabular-nums text-muted-foreground">{ids.length}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* How the board shows processes: as cards, or every step laid out. */}
      <div
        data-ui
        data-tour="view"
        className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 cursor-default items-center gap-1 rounded-full border border-border bg-background/95 p-1 shadow-md backdrop-blur"
      >
        {[
          { on: !allOpen, label: 'Cards', Icon: Minimize2, act: () => allOpen && toggleAll() },
          { on: allOpen, label: 'Every step', Icon: Maximize2, act: () => !allOpen && toggleAll() },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={b.act}
            aria-pressed={b.on}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              b.on ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <b.Icon className="h-3.5 w-3.5" /> {b.label}
          </button>
        ))}
      </div>

      {/* The spotlight, in one line, with a way to hide everything else. */}
      {pinned && spot && (
        <div
          data-ui
          className="absolute left-1/2 top-[68px] z-20 flex max-w-[min(680px,calc(100%-640px))] -translate-x-1/2 cursor-default flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-primary/30 bg-background px-4 py-2.5 text-xs shadow-md"
        >
          <span className="inline-flex items-center gap-2 font-semibold">
            <Icon w={pinned.who} size={16} /> {pinned.who.name}
          </span>
          <span className="text-muted-foreground">
            {plural(spot.steps, 'step')} in {plural(spot.perProcess.length, 'process')}
            {pinned.kind === 'app'
              ? ` · ${spot.auto} on its own · ${spot.hand} done by hand in it`
              : ` · ${spot.hand} by hand · ${plural(spot.decide, 'decision')}`}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setOnlyLens((o) => !o);
                setAfter({ fit: true });
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 font-medium hover:bg-muted"
            >
              <Eye className="h-3.5 w-3.5" /> {onlyLens ? 'Show everything' : 'Show only these'}
            </button>
            <button
              type="button"
              onClick={() => {
                const wasOnly = onlyLens;
                clearLens();
                if (wasOnly) setAfter({ fit: true });
              }}
              className="rounded-lg px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Clear
            </button>
          </span>
        </div>
      )}

      {/* Right: the profile of the app or person in the spotlight. */}
      {profile && spot && (() => {
        const isApp = profile.kind === 'app';
        const hue = isApp ? 217 : hueFor(profile.who.name);
        const tiles: [number, string][] = isApp
          ? [[spot.steps, 'steps'], [spot.auto, 'on its own'], [spot.hand, 'by hand in it']]
          : [[spot.steps, 'steps'], [spot.hand, 'by hand'], [spot.decide, 'decisions']];
        return (
          <aside
            data-ui
            className="absolute bottom-4 right-4 top-4 z-20 flex w-[340px] cursor-default flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
          >
            <div
              className="relative px-5 pb-5 pt-6"
              style={{ background: `linear-gradient(180deg, hsl(${hue} 85% 95%), transparent)` }}
            >
              <button
                type="button"
                aria-label="Close"
                onClick={clearLens}
                className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-white/60 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              {isApp ? (
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background shadow-sm">
                  <Icon w={profile.who} size={30} />
                </span>
              ) : (
                <Icon w={profile.who} size={52} />
              )}
              <h2 className="mt-3 text-lg font-semibold leading-snug tracking-tight">{profile.who.name}</h2>
              <p className="text-xs text-muted-foreground">{isApp ? 'App' : profile.who.typeName || 'Person'}</p>
              {spot.depts.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {spot.depts.map((d) => (
                    <span
                      key={d}
                      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                      style={{ backgroundColor: `hsl(${hueFor(d)} 80% 93%)`, color: `hsl(${hueFor(d)} 45% 32%)` }}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5">
              <section className="grid grid-cols-3 gap-2 text-center">
                {tiles.map(([n, label]) => (
                  <div key={label} className="rounded-xl bg-muted/50 px-2 py-2.5">
                    <p className="text-xl font-semibold tabular-nums">{n}</p>
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </section>
              <section>
                {isApp ? <MixBar a={spot.auto} r={spot.decide} m={spot.hand} /> : <MixBar a={0} r={spot.decide} m={spot.hand} />}
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {isApp
                    ? spot.hand > 0
                      ? `${plural(spot.hand, 'step')} still done by hand in ${profile.who.name}. Those could be the next to automate.`
                      : `Everything in ${profile.who.name} runs on its own or is a decision.`
                    : spot.hand > 0
                    ? `${plural(spot.hand, 'step')} done by hand. Those are the first place to look for time to win back.`
                    : 'No hand work in their steps.'}
                </p>
              </section>

              {isApp && spot.people.length > 0 && (
                <section>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Roles that use it</p>
                  <div className="flex flex-wrap gap-1.5">
                    {spot.people.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => {
                          setTab('people');
                          pinLens('person', w, lenses.people.find((l) => l.who.id === w.id)?.ids ?? []);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs hover:border-primary/40 hover:bg-primary/5"
                      >
                        <Icon w={w} size={13} /> {w.name}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {spot.apps.length > 0 && (
                <section>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {isApp ? 'Works alongside' : 'Works in'}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {spot.apps.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setTab('apps');
                          pinLens('app', a, lenses.apps.find((l) => l.who.id === a.id)?.ids ?? []);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs hover:border-primary/40 hover:bg-primary/5"
                      >
                        <Icon w={a} size={13} /> {a.name}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {isApp ? 'Processes that use it' : 'Their processes'}
                </p>
                <ul className="space-y-1.5">
                  {spot.perProcess.map(({ p, n }) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => (board.flows.has(p.id) ? flyTo(p.id) : openFlow(p.id))}
                        className="flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-left text-xs transition-colors hover:border-primary/30 hover:bg-muted/40"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{p.name}</span>
                          <span className="text-muted-foreground">
                            {n} of {p.steps.length} steps{p.department ? ` · ${p.department}` : ''}
                          </span>
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </aside>
        );
      })()}

      {/* The process you clicked, in a pop-up in the middle of the screen. Clicking outside closes it. */}
      {sel && (
        <div
          data-ui
          className="absolute inset-0 z-40 flex cursor-default items-center justify-center bg-foreground/20 p-6 backdrop-blur-[2px]"
          onClick={(e) => e.target === e.currentTarget && setSelected(null)}
        >
        <aside
          role="dialog"
          aria-label={sel.name}
          className="flex max-h-full w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
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
              <MixBar a={sel.automated} r={sel.review} m={sel.manual} />
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
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => {
                        setSelected(null);
                        setTab('people');
                        pinLens('person', w, lenses.people.find((l) => l.who.id === w.id)?.ids ?? [sel.id]);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs hover:border-primary/40 hover:bg-primary/5"
                    >
                      <Icon w={w} size={13} /> {w.name}
                    </button>
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
                onClick={() => {
                  setSelected(null);
                  if (opened.has(sel.id)) {
                    closeFlow(sel.id);
                    setAfter({ fly: sel.id });
                  } else openFlow(sel.id);
                }}
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
        </div>
      )}

      {/* Bottom right: the zoom controls. */}
      <div
        data-ui
        className={`absolute bottom-4 z-20 flex cursor-default items-center gap-0.5 rounded-full border border-border bg-background/95 p-1 shadow-md backdrop-blur ${
          panelOpen ? 'right-[364px]' : 'right-4'
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
              <button type="button" className={btn} aria-label="How to use this page" title="How to use this page" onClick={() => setTouring(true)}>
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </>
          );
        })()}
      </div>

      {deptOpen !== null && (() => {
        const dept = deptOpen === '~none' ? '' : deptOpen;
        const members = (procs ?? []).filter((p) => (p.department || '') === dept);
        return (
          <DeptView
            title={dept || 'No department yet'}
            hue={dept ? hueFor(dept) : 220}
            procs={members}
            lead={dept ? leads.get(dept) ?? null : null}
            canEdit={canEdit}
            lens={lens}
            names={names}
            runByOf={runByOf}
            onJump={jumpTo}
            onBack={() => setDeptOpen(null)}
            onSetLead={dept ? () => setLeadFor(dept) : null}
            onOpenProcess={(id) => navigate(`/process/${id}`)}
            onTrain={(id) => navigate(`/process/${id}?train=all&view=process`)}
          />
        );
      })()}

      {/* Choosing who leads a department. */}
      {leadFor && data && (
        <Dialog open onOpenChange={(o) => !o && setLeadFor(null)}>
          <DialogContent className="max-w-sm p-0" data-ui>
            <DialogHeader className="px-5 pt-5">
              <DialogTitle className="text-base">Who leads {leadFor}?</DialogTitle>
              <DialogDescription>They show on the department frame.</DialogDescription>
            </DialogHeader>
            <Command className="border-t border-border">
              <CommandInput placeholder="Search people and roles…" />
              <CommandList className="max-h-72 p-1">
                <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">Nobody matches.</CommandEmpty>
                {leads.get(leadFor) && (
                  <CommandItem value="no lead clear remove" onSelect={() => chooseLead(leadFor, null)} className="text-muted-foreground">
                    <X className="mr-2 h-4 w-4" /> No lead
                  </CommandItem>
                )}
                {data.people.map((w) => (
                  <CommandItem key={w.id} value={`${w.name} ${w.id}`} onSelect={() => chooseLead(leadFor, w.id)}>
                    <span className="mr-2">
                      <Icon w={w} size={16} />
                    </span>
                    <span className="flex-1">{w.name}</span>
                    <span className="text-[11px] text-muted-foreground">{w.typeName}</span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </DialogContent>
        </Dialog>
      )}

      {touring && <Tour onDone={endTour} />}
    </div>
  );
}
