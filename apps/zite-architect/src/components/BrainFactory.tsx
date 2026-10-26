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

/** World units: the gap between stations, between lines, and a station's size. */
const STEP_X = 120;
const LINE_Y = 140;
const LEAD = 40;
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

  const lines: Line[] = useMemo(
    () =>
      [...procs]
        .filter((p) => p.steps.length > 0)
        .sort((a, b) => (a.department || '~').localeCompare(b.department || '~') || a.name.localeCompare(b.name))
        .map((p) => ({ p, hue: p.department ? hues.get(p.department) ?? 220 : 220, nodes: lineFor(p) })),
    [procs, hues],
  );

  const reduceMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const cam = useRef({ zoom: 1, px: 0, py: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const mouse = useRef({ x: -1, y: -1 });
  const hits = useRef<Hit[]>([]);
  const [hover, setHover] = useState<Hit | null>(null);
  const hoverRef = useRef<Hit | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.current.zoom = Math.max(0.5, Math.min(3, cam.current.zoom * Math.exp(-e.deltaY * 0.0015)));
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
    const reach = maxLen + depth;
    const fit = Math.min((size.w - 120) / (reach * 0.87), (size.h - 230) / (reach * 0.5 + 80));
    const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const t = reduceMotion ? 0 : now - start;
      const { zoom, px, py } = cam.current;
      const s = fit * zoom;
      const ox = size.w / 2 - ((maxLen - depth) / 2) * 0.87 * s + px;
      const oy = size.h / 2 + 30 - (reach / 2) * 0.5 * s + py;
      const iso = (x: number, y: number, z: number) => ({ x: ox + (x - y) * 0.87 * s, y: oy + (x + y) * 0.5 * s - z * s });
      const cube = (x: number, y: number, z: number, w: number, d: number, h: number, top: string, left: string, right: string) => {
        const a = iso(x, y, z + h), b = iso(x + w, y, z + h), c = iso(x + w, y + d, z + h), e = iso(x, y + d, z + h);
        const f = iso(x + w, y + d, z), g = iso(x, y + d, z), k = iso(x + w, y, z);
        ctx.fillStyle = left;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(c.x, c.y); ctx.lineTo(f.x, f.y); ctx.lineTo(g.x, g.y); ctx.fill();
        ctx.fillStyle = right;
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(f.x, f.y); ctx.lineTo(k.x, k.y); ctx.fill();
        ctx.fillStyle = top;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(e.x, e.y); ctx.fill();
      };

      ctx.fillStyle = '#0d1220';
      ctx.fillRect(0, 0, size.w, size.h);
      // The floor's tiles.
      ctx.strokeStyle = 'rgba(120,140,190,0.07)';
      ctx.lineWidth = 1;
      for (let gx = -1; gx <= Math.ceil(maxLen / 80) + 1; gx++) {
        const a = iso(gx * 80, -60, 0), b = iso(gx * 80, depth + 20, 0);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      for (let gy = -1; gy <= Math.ceil((depth + 80) / 80); gy++) {
        const a = iso(-80, gy * 80 - 60, 0), b = iso(maxLen + 40, gy * 80 - 60, 0);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }

      const found: Hit[] = [];
      const fontPx = Math.max(10, Math.min(13, 11 * zoom));
      lines.forEach((line, li) => {
        const y = li * LINE_Y;
        const len = LEAD * 2 + line.nodes.length * STEP_X;
        // The belt, with its slats sliding along.
        cube(0, y + 22, 0, len, 26, 4, '#2a3247', '#1b2133', '#222a3d');
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2;
        for (let i = 0; i < len / 30; i++) {
          const xx = (i * 30 + t * 0.04) % len;
          const a = iso(xx, y + 35, 4.5), b = iso(Math.min(len, xx + 10), y + 35, 4.5);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        // The process's name at the head of its line, in its department's color.
        const lb = iso(-14, y + 35, 0);
        ctx.fillStyle = hsl(line.hue, 70, 72);
        ctx.font = `600 ${fontPx}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(line.p.name, lb.x - 4, lb.y + 4);

        line.nodes.forEach((node, ni) => {
          const x = LEAD + ni * STEP_X;
          if (node.kind === 'pile') {
            for (let k = 0; k < node.size; k++) {
              const col = k % 3;
              const row = Math.floor(k / 3);
              cube(x + col * 16 - 6, y + 22 + ((k * 7) % 3) * 6, 4 + row * 14, 13, 13, 13, '#F0997B', '#993C1D', '#D85A30');
            }
            const tp = iso(x + 14, y + 30, 4 + Math.ceil(node.size / 3) * 14 + 14);
            ctx.fillStyle = `rgba(226,75,74,${0.45 + 0.3 * Math.sin(t / 300)})`;
            ctx.beginPath(); ctx.arc(tp.x, tp.y, 7, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '700 10px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('!', tp.x, tp.y + 3.5);
            const hb = iso(x + 12, y + 30, 26);
            found.push({ x: hb.x, y: hb.y, r: 30 * Math.max(0.7, zoom), line, node });
            return;
          }
          const robot = node.kind === 'robot';
          const outside = node.who?.party === 'External';
          const hue = robot ? 160 : node.who ? hueFor(node.who.name) : 220;
          const sat = outside ? 15 : robot ? 55 : 45;
          cube(x, y, 4, 58, 20, robot ? 34 : 28, hsl(hue, sat, robot ? 45 : 52), hsl(hue, sat, robot ? 26 : 30), hsl(hue, sat, robot ? 34 : 38));
          if (robot) {
            const base = iso(x + 29, y + 10, 38);
            const ang = Math.sin(t / 260 + ni) * 0.9;
            const ex = base.x + Math.cos(ang - 1.2) * 22 * zoom;
            const ey = base.y + Math.sin(ang - 1.2) * 22 * zoom;
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
              const hp = iso(x + 12 + k * 16, y - 6, 30 + Math.abs(Math.sin(t / 400 + k + ni)) * 4);
              ctx.fillStyle = hsl(hue, outside ? 20 : 70, 75);
              ctx.beginPath(); ctx.arc(hp.x, hp.y, 4.5 * Math.max(0.8, zoom * 0.9), 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = hsl(hue, outside ? 15 : 50, 40);
              ctx.fillRect(hp.x - 3.5, hp.y + 5, 7, 8);
            }
          }
          const name = node.who?.name ?? 'Nobody yet';
          const lp = iso(x + 29, y + 24, robot ? 52 : 46);
          ctx.fillStyle = robot ? '#9FE1CB' : outside ? '#b9c0cf' : '#ffffff';
          ctx.font = `500 ${fontPx - 1}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(name.length > 18 ? `${name.slice(0, 17)}…` : name, lp.x, lp.y);
          const hb = iso(x + 29, y + 10, 20);
          found.push({ x: hb.x, y: hb.y, r: 34 * Math.max(0.7, zoom), line, node });
        });

        // Jobs riding the belt; they vanish into a pile and come out the other side.
        for (let k = 0; k < 3; k++) {
          const u = ((t / 5200 + k / 3 + li * 0.17) % 1 + 1) % 1;
          const xx = u * len;
          const inPile = line.nodes.some((n, ni) => n.kind === 'pile' && Math.abs(LEAD + ni * STEP_X - xx) < 16);
          if (!inPile) cube(xx, y + 29, 5, 11, 11, 11, '#FAC775', '#854F0B', '#BA7517');
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
        className="absolute left-4 top-4 z-[210] w-56 cursor-default rounded-xl border border-white/10 bg-slate-950/75 p-3 text-xs text-white/80 shadow-xl backdrop-blur"
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
      </div>

      {card}

      <p className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/80 backdrop-blur">
        Drag to move · Scroll to zoom · Point at a station or pile · Click to open the process
      </p>
    </div>
  );
}
