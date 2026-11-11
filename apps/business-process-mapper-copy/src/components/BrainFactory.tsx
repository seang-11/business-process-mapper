import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GetBrainOutputType } from 'zitejs/api';
import { hueFor } from './RoleAvatar';

type Proc = GetBrainOutputType['processes'][number];
type Step = Proc['steps'][number];
type Who = Proc['people'][number];

/** One spot along a production line: people at work, an app doing it on its own, or work piling up. */
type Node =
  | { kind: 'station'; who: Who | null; steps: Step[] }
  | { kind: 'robot'; who: Who; steps: Step[] }
  | { kind: 'pile'; size: number; reason: 'wait' | 'outside'; title: string; who: Who | null };

interface Line {
  p: Proc;
  hue: number;
  nodes: Node[];
}

/** World units: the gap between stations, between lines, and room at the head of each line. */
const STEP_X = 150;
const LINE_Y = 190;
const LEAD = 30;
/** The belt runs across the middle of each line's lane; stations sit on it. */
const BELT_Y = 40;
const BELT_D = 34;
/** How far a step back into the floor shifts things left and up: a view from the front, a little above and to the right. */
const SLANT = 0.3;
const RISE = 0.75;
/** Piles by step type: a wait step stacks higher than waiting on someone outside the team. */
const PILE_WAIT = 7;
const PILE_OUTSIDE = 4;

/** Work in the order it flows, as stations, robots and piles. */
function lineFor(p: Proc): Node[] {
  const out: Node[] = [];
  for (const s of p.steps) {
    if (s.stepType === 'Wait') {
      out.push({ kind: 'pile', size: PILE_WAIT, reason: 'wait', title: s.title, who: s.who });
      continue;
    }
    const last = out[out.length - 1];
    const key = s.who?.id ?? '~';
    if (last && last.kind !== 'pile' && (last.who?.id ?? '~') === key) {
      last.steps.push(s);
      continue;
    }
    if (s.who?.kind === 'app') {
      out.push({ kind: 'robot', who: s.who, steps: [s] });
      continue;
    }
    // Handing work to someone outside the team: it sits and waits for them.
    if (s.who?.party === 'External') out.push({ kind: 'pile', size: PILE_OUTSIDE, reason: 'outside', title: s.title, who: s.who });
    out.push({ kind: 'station', who: s.who, steps: [s] });
  }
  return out;
}

interface Hit {
  x: number;
  y: number;
  r: number;
  line: Line;
  node: Node;
}

/**
 * The company as a factory floor: every process a production line, every
 * role a workstation along it, apps as robot arms that work on their own, and
 * boxes of work riding the belts. Work piles up where it waits, on a wait step
 * or on someone outside the team, so the bottlenecks stand out. Scroll to zoom,
 * drag to move around, click a station to open its process.
 */
export default function BrainFactory({ procs, hues, onOpenProcess }: {
  procs: Proc[];
  /** Each department's color. */
  hues: Map<string, number>;
  onOpenProcess: (id: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 1000, h: 700 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const cam = useRef({ zoom: 1, px: 0, py: 0 });
  /** One department's lines, or every line. */
  const [dept, setDept] = useState<string | null>(null);
  const depts = useMemo(
    () => [...new Set(procs.filter((p) => p.steps.length > 0).map((p) => p.department || ''))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b))),
    [procs],
  );
  const lines: Line[] = useMemo(
    () =>
      [...procs]
        .filter((p) => p.steps.length > 0 && (dept === null || (p.department || '') === dept))
        .sort((a, b) => (a.department || '~').localeCompare(b.department || '~') || a.name.localeCompare(b.name))
        .map((p) => ({ p, hue: p.department ? hues.get(p.department) ?? 220 : 220, nodes: lineFor(p) })),
    [procs, hues, dept],
  );
  // A new set of lines starts back at the top.
  useEffect(() => {
    cam.current.px = 0;
    cam.current.py = 0;
  }, [dept]);

  const reduceMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const mouse = useRef({ x: -1, y: -1 });
  const hits = useRef<Hit[]>([]);
  const [hover, setHover] = useState<Hit | null>(null);
  const hoverRef = useRef<Hit | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // Scroll to move through the lines; pinch (or hold Ctrl) to zoom.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) cam.current.zoom = Math.max(0.5, Math.min(2.5, cam.current.zoom * Math.exp(-e.deltaY * 0.01)));
      else {
        cam.current.px -= e.deltaX;
        cam.current.py -= e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // One loop draws the floor: belts moving, robot arms swinging, boxes riding along.
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.w * dpr;
    cv.height = size.h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const maxLen = Math.max(1, ...lines.map((l) => LEAD * 2 + l.nodes.length * STEP_X));
    const depth = lines.length * LINE_Y;
    /** Room on the left for each line's name card. */
    const HEAD_PX = 210;
    // Fit the longest line between the name cards and the legend, but never so small the labels crowd; longer lines scroll sideways.
    const fit = Math.min(1.2, Math.max(0.85, (size.w - HEAD_PX - 300) / (maxLen + LINE_Y * SLANT)));
    const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
    const pill = (text: string, x: number, y: number, fg: string, bg: string, px: number, weight = 500) => {
      ctx.font = `${weight} ${px}px Inter, system-ui, sans-serif`;
      const w = ctx.measureText(text).width + 12;
      const h = px + 8;
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 0.5);
      ctx.textBaseline = 'alphabetic';
    };
    const short = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const t = reduceMotion ? 0 : now - start;
      const { zoom, px, py } = cam.current;
      const s = fit * zoom;
      const ox = HEAD_PX + 30 + px;
      const oy = 150 + py;
      // Lines stack straight down the screen; within a line, nearer is a little right and down, so each reads left to right like a row.
      const iso = (x: number, y: number, z: number) => ({ x: ox + (x + (y % LINE_Y) * SLANT) * s, y: oy + (Math.floor(y / LINE_Y) * LINE_Y * RISE + (y % LINE_Y) * RISE * 0.6) * s - z * s });
      const cube = (x: number, y: number, z: number, w: number, d: number, h: number, top: string, front: string, side: string) => {
        const a = iso(x, y, z + h), b = iso(x + w, y, z + h), c = iso(x + w, y + d, z + h), e = iso(x, y + d, z + h);
        const f = iso(x + w, y + d, z), g = iso(x, y + d, z), k = iso(x + w, y, z);
        ctx.fillStyle = front;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(c.x, c.y); ctx.lineTo(f.x, f.y); ctx.lineTo(g.x, g.y); ctx.fill();
        ctx.fillStyle = side;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(f.x, f.y); ctx.lineTo(k.x, k.y); ctx.fill();
        ctx.fillStyle = top;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(e.x, e.y); ctx.fill();
      };

      ctx.fillStyle = '#0d1220';
      ctx.fillRect(0, 0, size.w, size.h);

      const found: Hit[] = [];
      const labelPx = Math.round(Math.max(10, Math.min(13, 12 * zoom)));
      lines.forEach((line, li) => {
        const y = li * LINE_Y;
        const len = LEAD * 2 + line.nodes.length * STEP_X;
        // Each line's own lane on the floor, so lines never run into each other.
        const l0 = iso(-10, y + 8, 0), l1 = iso(len + 10, y + 8, 0), l2 = iso(len + 10, y + BELT_Y + BELT_D + 46, 0), l3 = iso(-10, y + BELT_Y + BELT_D + 46, 0);
        if (l2.y < -40 || l0.y > size.h + 120) return;
        ctx.fillStyle = hsl(line.hue, 30, 14, 0.55);
        ctx.strokeStyle = hsl(line.hue, 50, 45, 0.35);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(l0.x, l0.y); ctx.lineTo(l1.x, l1.y); ctx.lineTo(l2.x, l2.y); ctx.lineTo(l3.x, l3.y); ctx.closePath(); ctx.fill(); ctx.stroke();

        // The belt, with its slats sliding along and an arrow showing which way work goes.
        cube(0, y + BELT_Y, 0, len, BELT_D, 5, '#2b3349', '#1a2032', '#20283b');
        ctx.strokeStyle = 'rgba(255,255,255,0.13)';
        ctx.lineWidth = 2;
        for (let i = 0; i < len / 34; i++) {
          const xx = (i * 34 + t * 0.04) % len;
          const a1 = iso(xx, y + BELT_Y + BELT_D / 2, 5.5), b1 = iso(Math.min(len, xx + 12), y + BELT_Y + BELT_D / 2, 5.5);
          ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y); ctx.stroke();
        }
        const endA = iso(len + 4, y + BELT_Y + BELT_D / 2, 3);
        ctx.fillStyle = hsl(line.hue, 70, 65, 0.8);
        ctx.beginPath(); ctx.moveTo(endA.x + 12, endA.y); ctx.lineTo(endA.x, endA.y - 7); ctx.lineTo(endA.x, endA.y + 7); ctx.fill();

        // The line's name card at its head.
        const head = iso(-14, y + BELT_Y + BELT_D / 2, 0);
        ctx.font = `600 ${labelPx + 1}px Inter, system-ui, sans-serif`;
        const nameW = Math.min(HEAD_PX - 30, ctx.measureText(line.p.name).width + 26);
        ctx.fillStyle = 'rgba(15,22,42,0.92)';
        ctx.strokeStyle = hsl(line.hue, 60, 55, 0.6);
        ctx.beginPath(); ctx.roundRect(head.x - nameW - 8, head.y - 15, nameW, 30, 8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = hsl(line.hue, 70, 60);
        ctx.beginPath(); ctx.arc(head.x - nameW + 4, head.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#eef2fb';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(short(line.p.name, 24), head.x - nameW + 14, head.y + 0.5);
        ctx.textBaseline = 'alphabetic';
        found.push({ x: head.x - nameW / 2 - 8, y: head.y, r: nameW / 2, line, node: { kind: 'station', who: null, steps: [] } });

        line.nodes.forEach((node, ni) => {
          const x = LEAD + ni * STEP_X + 20;
          const front = iso(x + 32, y + BELT_Y + BELT_D + 22, 0);
          if (node.kind === 'pile') {
            for (let k = 0; k < node.size; k++) {
              const col = k % 3;
              const row = Math.floor(k / 3);
              cube(x + 10 + col * 15, y + BELT_Y + 4 + (k % 2) * 10, 5 + row * 13, 12, 12, 12, '#F0997B', '#993C1D', '#D85A30');
            }
            const tp = iso(x + 32, y + BELT_Y + 10, 5 + Math.ceil(node.size / 3) * 13 + 16);
            ctx.fillStyle = `rgba(226,75,74,${0.5 + 0.3 * Math.sin(t / 300)})`;
            ctx.beginPath(); ctx.arc(tp.x, tp.y, 8, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '700 11px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('!', tp.x, tp.y + 4);
            pill(node.reason === 'wait' ? 'Waiting' : 'Waiting on them', front.x, front.y, '#ffd2cf', 'rgba(120,30,30,0.75)', labelPx - 1);
            const hb = iso(x + 32, y + BELT_Y + 12, 20);
            found.push({ x: hb.x, y: hb.y, r: 34 * Math.max(0.7, zoom), line, node });
            return;
          }
          const robot = node.kind === 'robot';
          const outside = node.who?.party === 'External';
          const hue = robot ? 160 : node.who ? hueFor(node.who.name) : 220;
          const sat = outside ? 12 : robot ? 55 : 48;
          cube(x, y + BELT_Y - 4, 5, 64, BELT_D + 8, robot ? 36 : 30, hsl(hue, sat, robot ? 46 : 54), hsl(hue, sat, robot ? 30 : 34), hsl(hue, sat, robot ? 24 : 27));
          if (robot) {
            const base = iso(x + 32, y + BELT_Y + BELT_D / 2, 41);
            const ang = Math.sin(t / 260 + ni) * 0.9;
            const reach = 24 * s;
            const ex = base.x + Math.cos(ang - 1.3) * reach;
            const ey = base.y + Math.sin(ang - 1.3) * reach;
            ctx.strokeStyle = '#9FE1CB';
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(ex, ey); ctx.stroke();
            ctx.fillStyle = '#E1F5EE';
            ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill();
          } else {
            // A worker for each step done here, up to three, bobbing as they work.
            const workers = Math.min(3, node.steps.length);
            for (let k = 0; k < workers; k++) {
              const hp = iso(x + 14 + k * 18, y + BELT_Y + BELT_D / 2, 38 + Math.abs(Math.sin(t / 400 + k + ni)) * 4);
              ctx.fillStyle = hsl(hue, outside ? 15 : 70, 78);
              ctx.beginPath(); ctx.arc(hp.x, hp.y, 4.5, 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = hsl(hue, outside ? 12 : 50, 42);
              ctx.fillRect(hp.x - 3.5, hp.y + 5, 7, 8);
            }
          }
          const name = short(node.who?.name ?? 'Nobody yet', 17);
          pill(
            name,
            front.x,
            front.y,
            robot ? '#bff0de' : outside ? '#c8cdd8' : '#ffffff',
            robot ? 'rgba(16,80,60,0.8)' : `hsla(${hue},${outside ? 10 : 45}%,22%,0.9)`,
            labelPx - 1,
          );
          const hb = iso(x + 32, y + BELT_Y + BELT_D / 2, 20);
          found.push({ x: hb.x, y: hb.y, r: 38 * Math.max(0.7, zoom), line, node });
        });

        // Jobs riding the belt; they vanish into a pile and come out the other side.
        for (let k = 0; k < 3; k++) {
          const u = ((t / 6000 + k / 3 + li * 0.17) % 1 + 1) % 1;
          const xx = u * len;
          const blocked = line.nodes.some((n, ni) => Math.abs(LEAD + ni * STEP_X + 20 + 32 - xx) < 40);
          if (!blocked) cube(xx, y + BELT_Y + BELT_D / 2 - 6, 5, 12, 12, 12, '#FAC775', '#854F0B', '#BA7517');
        }
      });
      hits.current = found;

      // What's under the pointer.
      const m = mouse.current;
      let h: Hit | null = null;
      for (const k of found) if (Math.hypot(m.x - k.x, m.y - k.y) < k.r) h = k;
      if (h?.node !== hoverRef.current?.node) {
        hoverRef.current = h;
        setHover(h);
      } else if (h && hoverRef.current && (Math.abs(h.x - hoverRef.current.x) > 2 || Math.abs(h.y - hoverRef.current.y) > 2)) {
        hoverRef.current = h;
        setHover(h);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [lines, size, reduceMotion]);

  const card = hover && (() => {
    const { node, line } = hover;
    const right = hover.x < size.w - 280;
    const style = { left: right ? hover.x + 34 : hover.x - 274, top: Math.max(70, hover.y - 70) };
    const shell = 'pointer-events-none absolute z-[200] w-60 rounded-xl border bg-slate-950/90 px-4 py-3 text-xs text-white/85 shadow-xl backdrop-blur';
    // The line's name card: what the whole line is.
    if (node.kind === 'station' && node.steps.length === 0) {
      const people = line.nodes.filter((n) => n.kind === 'station').length;
      const robots = line.nodes.filter((n) => n.kind === 'robot').length;
      const piles = line.nodes.filter((n) => n.kind === 'pile').length;
      return (
        <div className={`${shell} border-sky-300/45`} style={style}>
          <p className="text-sm font-semibold" style={{ color: `hsl(${line.hue} 80% 72%)` }}>{line.p.name}</p>
          <p className="mb-1.5 text-[11px] text-white/50">{line.p.department || 'No department'}</p>
          <p>
            {line.p.steps.length} steps · {people} {people === 1 ? 'station' : 'stations'} · {robots} {robots === 1 ? 'robot' : 'robots'} ·{' '}
            {piles} {piles === 1 ? 'pile' : 'piles'}
          </p>
          <p className="mt-2 font-medium text-sky-300">Click to open this process</p>
        </div>
      );
    }
    if (node.kind === 'pile') {
      return (
        <div className={`${shell} border-red-300/40`} style={style}>
          <p className="text-sm font-semibold text-red-300">
            {node.reason === 'wait' ? 'Work waits here' : `Waiting on ${node.who?.name ?? 'someone outside'}`}
          </p>
          <p className="mb-1.5 text-[11px] text-white/50">{line.p.name}</p>
          <p>{node.reason === 'wait' ? node.title : `Next: ${node.title}`}</p>
          <p className="mt-2 font-medium text-amber-300">
            {node.reason === 'wait' ? 'Fix it with a reminder or an automation.' : 'Fix it with an automatic nudge or a deadline.'}
          </p>
        </div>
      );
    }
    const robot = node.kind === 'robot';
    const outside = node.who?.party === 'External';
    return (
      <div className={`${shell} ${robot ? 'border-emerald-300/40' : 'border-sky-300/45'}`} style={style}>
        <p className="text-sm font-semibold" style={{ color: robot ? '#9FE1CB' : `hsl(${node.who ? hueFor(node.who.name) : 220} 85% 75%)` }}>
          {node.who?.name ?? 'Nobody yet'}
          {robot ? ' (app)' : outside ? ' (outside)' : ''}
        </p>
        <p className="mb-1.5 text-[11px] text-white/50">{line.p.name}</p>
        <ul className="space-y-0.5">
          {node.steps.slice(0, 4).map((s) => (
            <li key={s.id}>· {s.title}</li>
          ))}
          {node.steps.length > 4 && <li className="text-white/50">and {node.steps.length - 4} more</li>}
        </ul>
        <p className={`mt-2 font-medium ${robot ? 'text-emerald-300' : 'text-sky-300'}`}>
          {robot ? 'Runs on its own, no people time' : 'Click to open this process'}
        </p>
      </div>
    );
  })();

  return (
    <div
      ref={box}
      data-ui
      className="absolute inset-0 z-10 cursor-grab select-none overflow-hidden bg-[#0d1220] active:cursor-grabbing"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, px: cam.current.px, py: cam.current.py, moved: false };
      }}
      onPointerMove={(e) => {
        const r = box.current?.getBoundingClientRect();
        if (r) mouse.current = { x: e.clientX - r.left, y: e.clientY - r.top };
        const g = drag.current;
        if (!g) return;
        if (Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 3) g.moved = true;
        cam.current.px = g.px + (e.clientX - g.x);
        cam.current.py = g.py + (e.clientY - g.y);
      }}
      onPointerUp={() => {
        const g = drag.current;
        drag.current = null;
        if (g && !g.moved && hoverRef.current) onOpenProcess(hoverRef.current.line.p.id);
      }}
      onPointerLeave={() => {
        mouse.current = { x: -1, y: -1 };
      }}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" style={{ cursor: hover ? 'pointer' : undefined }} />

      {/* How to read it. */}
      <div
        className="absolute right-4 top-4 z-[210] max-h-[calc(100%-5rem)] w-60 cursor-default overflow-y-auto rounded-xl border border-white/10 bg-slate-950/80 p-3 text-xs text-white/80 shadow-xl backdrop-blur"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/45">How to read it</p>
        <ul className="space-y-1.5">
          <li className="flex items-center gap-2.5"><span className="h-2.5 w-4 rounded-sm bg-[#3b5b9a]" /> Station = a role doing steps</li>
          <li className="flex items-center gap-2.5"><span className="h-2.5 w-4 rounded-sm bg-[#1D9E75]" /> Robot = an app does it on its own</li>
          <li className="flex items-center gap-2.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#EF9F27]" /> Box = a job moving through</li>
          <li className="flex items-center gap-2.5"><span className="h-2.5 w-4 rounded-sm bg-[#E24B4A]" /> Pile = work waiting</li>
        </ul>
        <p className="mt-2.5 text-[11px] leading-relaxed text-white/45">
          Tall piles are wait steps. Short piles are work waiting on someone outside the team.
        </p>

        <p className="mb-1.5 mt-4 text-[11px] font-medium uppercase tracking-wider text-white/45">Show</p>
        <div className="flex flex-wrap gap-1.5">
          {[null, ...depts].map((d) => {
            const on = dept === d;
            const hue = d ? hues.get(d) ?? 220 : null;
            return (
              <button
                key={d ?? '~all'}
                type="button"
                onClick={() => setDept(d)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  on ? 'border-white/40 bg-white/15 text-white' : 'border-white/10 text-white/65 hover:bg-white/10 hover:text-white'
                }`}
              >
                {hue !== null && <span className="h-2 w-2 rounded-full" style={{ background: `hsl(${hue} 70% 58%)` }} />}
                {d === null ? 'All lines' : d || 'No department'}
              </button>
            );
          })}
        </div>
      </div>

      {card}

      <p className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/80 backdrop-blur">
        Scroll or drag to move · Pinch to zoom · Point at anything for details · Click to open the process
      </p>
    </div>
  );
}
