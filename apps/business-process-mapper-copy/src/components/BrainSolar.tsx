import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import PlanetArt, { PLANET_LABEL, planetTypes } from './PlanetArt';
import type { GlobeDept, GlobeHandoff } from './BrainGlobe';

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const WARP_MS = 1500;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const warpAt = (k: number) => ease(Math.max(0, Math.min(1, (k - 0.2) / 0.8)));

const STARS = Array.from({ length: 140 }, (_, i) => ({
  a: (((i * 2654435761) % 1000) / 1000) * TAU,
  z: (((i * 40503) % 997) / 997) * 0.95 + 0.05,
  big: i % 9 === 0,
}));
const NEAR = Array.from({ length: 45 }, (_, i) => ({
  x: ((i * 7919) % 1000) / 1000,
  y: ((i * 104729) % 997) / 997,
  r: 1 + ((i * 31) % 10) / 10,
}));
const NEBULAE = [
  { x: 20, y: 28, r: 46, h: 265 },
  { x: 80, y: 70, r: 52, h: 200 },
  { x: 66, y: 16, r: 34, h: 320 },
  { x: 28, y: 82, r: 38, h: 185 },
];

const fmtHrs = (h: number) => (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10);

/**
 * The company as a solar system: the company itself is the sun in the middle,
 * with its logo, name and website, and each department is a planet on its own
 * orbit, its processes circling as moons. Nothing hides behind anything, so
 * every planet is always there to point at. Drag to turn and tilt, scroll to
 * zoom, click a planet to dive into its department.
 */
export default function BrainSolar({
  depts,
  handoffs,
  company,
  onSaveCompany,
  onOpen,
  onOpenProcess,
  returnFrom,
}: {
  depts: GlobeDept[];
  handoffs: GlobeHandoff[];
  company: { name: string; website: string };
  /** Admins only: set the company in the sun. */
  onSaveCompany?: (name: string, website: string) => Promise<void>;
  onOpen: (name: string) => void;
  onOpenProcess: (id: string) => void;
  returnFrom?: { name: string; n: number } | null;
}) {
  const box = useRef<HTMLDivElement>(null);
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

  const types = useMemo(() => planetTypes(depts.map((d) => d.name)), [depts]);
  const reduceMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  /** rot: the system's turn. tilt: how far you look down on it. warp: 0 at rest, 1 inside a department. */
  const view = useRef({ rot: 0, tilt: 0.62, zoom: 1, t: 0, mt: 0, warp: 0, travel: 0, target: null as string | null, home: 1 });
  const [, setFrame] = useState(0);
  const drag = useRef<{ x: number; y: number; rot: number; tilt: number } | null>(null);
  const flight = useRef<{ start: number; name: string; dir: 1 | -1; from: number; to: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(64, now - last));
      last = now;
      const v = view.current;
      const f = flight.current;
      if (f) {
        const k = Math.min(1, (now - f.start) / WARP_MS);
        v.zoom = f.from + (f.to - f.from) * ease(k);
        v.warp = f.dir === 1 ? warpAt(k) : warpAt(1 - k);
        if (k >= 1) {
          flight.current = null;
          if (f.dir === 1) {
            v.warp = 1;
            openRef.current(f.name);
          } else {
            v.warp = 0;
            v.target = null;
          }
        }
      }
      v.t += dt;
      // Planets keep circling unless you're pointing at something, so it's easy to click.
      if (!hoverRef.current && !drag.current && !reduceMotion && v.warp === 0) v.mt += dt;
      v.travel += dt * v.warp * 0.0011;
      setFrame((n) => (n + 1) % 1_000_000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = view.current;
      if (flight.current || v.warp > 0) return;
      v.zoom = Math.max(0.6, Math.min(1.8, v.zoom * Math.exp(-e.deltaY * 0.0015)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const flyTo = (name: string) => {
    const v = view.current;
    v.target = name;
    setHover(null);
    if (reduceMotion) {
      openRef.current(name);
      return;
    }
    v.home = v.zoom;
    flight.current = { start: performance.now(), name, dir: 1, from: v.zoom, to: v.zoom * 1.15 };
  };

  // Back from a department: the same dive in reverse.
  useEffect(() => {
    if (!returnFrom) return;
    const v = view.current;
    if (reduceMotion || v.warp === 0) {
      v.warp = 0;
      v.zoom = v.home;
      v.target = null;
      return;
    }
    v.target = returnFrom.name;
    flight.current = { start: performance.now(), name: returnFrom.name, dir: -1, from: v.zoom, to: v.home };
  }, [returnFrom, reduceMotion]);

  const { rot, tilt, zoom, t, mt, warp, travel, target } = view.current;
  const warping = warp > 0;
  const cx = size.w / 2;
  const cy = size.h / 2 + 10;
  const diag = Math.hypot(size.w, size.h);
  const squash = Math.sin(tilt);
  const outer = Math.min(size.w * 0.44, (size.h * 0.44) / Math.max(0.35, squash)) * zoom;
  const inner = outer * 0.34;
  const n = depts.length;
  const sunSize = Math.min(size.w, size.h) * 0.16 * zoom;
  const planetSize = Math.min(size.w, size.h) * 0.065 * Math.max(0.8, zoom);

  // Where each planet is on screen this frame.
  const planets = depts.map((d, i) => {
    const r = n === 1 ? (inner + outer) / 2 : inner + ((outer - inner) * i) / (n - 1);
    const speed = 1 / (1 + i * 0.35);
    const a = i * GOLDEN * 2 + (mt / 26000) * speed + rot;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const depth = z / outer; // -1 far, +1 near
    return { d, i, r, sx: cx + x, sy: cy + z * squash, depth, s: 1 + depth * 0.18 * Math.cos(tilt) };
  });
  const at = new Map(planets.map((p) => [p.d.name, p]));
  const hoverDept = hover && !hover.startsWith('moon:') ? (hover === '~' ? '' : hover) : null;

  return (
    <div
      ref={box}
      data-ui
      className="absolute inset-0 z-10 cursor-grab select-none overflow-hidden active:cursor-grabbing"
      style={{ background: 'radial-gradient(ellipse at 50% 50%, hsl(228 45% 12%) 0%, hsl(230 50% 6%) 60%, hsl(232 55% 3%) 100%)' }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, rot: view.current.rot, tilt: view.current.tilt };
      }}
      onPointerMove={(e) => {
        const g = drag.current;
        if (!g || flight.current) return;
        view.current.rot = g.rot + (e.clientX - g.x) * 0.006;
        view.current.tilt = Math.max(0.2, Math.min(1.35, g.tilt + (e.clientY - g.y) * 0.004));
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      {/* Far stars, streaking past in a dive. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        {STARS.map((st, i) => {
          const far = diag / 2;
          const z = (((st.z - travel) % 1) + 1) % 1 || 1;
          const r = Math.min(far * 1.2, (far * 0.06) / Math.max(0.05, z));
          const r0 = r * (1 - 0.55 * warp);
          const tw = warping ? 0.5 + 0.5 * (1 - z) : reduceMotion ? 0.5 : 0.35 + 0.35 * Math.sin(t / 900 + i);
          return (
            <line
              key={i}
              x1={cx + Math.cos(st.a) * r0}
              y1={cy + Math.sin(st.a) * r0}
              x2={cx + Math.cos(st.a) * r}
              y2={cy + Math.sin(st.a) * r}
              stroke={warping ? 'hsl(215 100% 90%)' : 'white'}
              strokeWidth={(st.big ? 2.6 : 1.6) * (1 + warp * 0.8)}
              strokeLinecap="round"
              opacity={tw}
            />
          );
        })}
      </svg>

      {/* Nebula clouds and a nearer star layer that slides as you turn. */}
      <div className="pointer-events-none absolute inset-0" style={{ opacity: 1 - warp }} aria-hidden="true">
        {NEBULAE.map((nb, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `calc(${nb.x}% + ${Math.sin(t / 9000 + i) * 18 - rot * 14}px)`,
              top: `calc(${nb.y}% + ${Math.cos(t / 11000 + i) * 14 + tilt * 12}px)`,
              width: `${nb.r}vmin`,
              height: `${nb.r * 0.7}vmin`,
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(ellipse at center, hsl(${nb.h} 80% 55% / 0.2), hsl(${nb.h} 80% 45% / 0.07) 45%, transparent 70%)`,
              filter: 'blur(8px)',
            }}
          />
        ))}
        <svg className="absolute inset-0 h-full w-full">
          {NEAR.map((st, i) => {
            const x = (((st.x * size.w - rot * 90) % size.w) + size.w) % size.w;
            const y = (((st.y * size.h + tilt * 60) % size.h) + size.h) % size.h;
            return <circle key={i} cx={x} cy={y} r={st.r} fill="white" opacity={0.75} />;
          })}
        </svg>
      </div>

      {/* Orbits, and handoff lines for the planet you point at. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" opacity={Math.max(0, 1 - warp * 2)}>
        {planets.map((p) => {
          const lit = hoverDept === p.d.name;
          return (
            <ellipse
              key={p.d.name || '~'}
              cx={cx}
              cy={cy}
              rx={p.r}
              ry={p.r * squash}
              fill="none"
              stroke={lit ? `hsl(${p.d.hue} 90% 70%)` : 'hsl(220 80% 80%)'}
              strokeOpacity={lit ? 0.75 : 0.13}
              strokeWidth={lit ? 1.5 : 1}
            />
          );
        })}
        {hoverDept !== null &&
          handoffs
            .filter((h) => h.from === hoverDept || h.to === hoverDept)
            .map((h) => {
              const a = at.get(h.from);
              const b = at.get(h.to);
              if (!a || !b) return null;
              const mx = (a.sx + b.sx) / 2;
              const my = Math.min(a.sy, b.sy) - 70;
              const id = `sh-${(h.from + h.to).replace(/[^a-zA-Z0-9]/g, '')}`;
              const u = ((t / 2000) % 1 + 1) % 1;
              const px = (1 - u) * (1 - u) * a.sx + 2 * (1 - u) * u * mx + u * u * b.sx;
              const py = (1 - u) * (1 - u) * a.sy + 2 * (1 - u) * u * my + u * u * b.sy;
              return (
                <g key={`${h.from}>${h.to}`}>
                  <defs>
                    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy}>
                      <stop offset="0%" stopColor={`hsl(${a.d.hue} 90% 65%)`} />
                      <stop offset="100%" stopColor={`hsl(${b.d.hue} 90% 65%)`} />
                    </linearGradient>
                  </defs>
                  <path d={`M${a.sx},${a.sy} Q${mx},${my} ${b.sx},${b.sy}`} fill="none" stroke={`url(#${id})`} strokeWidth={2.2} strokeOpacity={0.9} />
                  {!reduceMotion && <circle cx={px} cy={py} r={4} fill="white" opacity={0.95} />}
                </g>
              );
            })}
      </svg>

      {/* The sun: the company itself. */}
      <Sun
        company={company}
        size={sunSize}
        x={cx}
        y={cy}
        warp={warp}
        onSave={onSaveCompany}
      />

      {/* Planets, nearest on top. */}
      {planets.map(({ d, sx: px, sy: py, depth, s }) => {
        const key = d.name || '~';
        const on = hover === key && !warping;
        const isTarget = warping && target === d.name;
        const plain = planetSize * s;
        const fill = (diag * 1.15) / plain;
        const sz = isTarget ? plain * (1 + Math.pow(warp, 2.2) * (fill - 1)) : plain;
        const sx = isTarget ? px + (cx - px) * warp : cx + (px - cx) * (1 + warp * 3);
        const sy = isTarget ? py + (cy - py) * warp : cy + (py - cy) * (1 + warp * 3);
        const type = types.get(d.name) ?? 'rocky';
        return (
          <div
            key={key}
            className="absolute"
            style={{
              left: sx,
              top: sy,
              zIndex: isTarget ? 250 : on ? 220 : 100 + Math.round(depth * 50),
              opacity: isTarget ? 1 : 1 - warp,
              pointerEvents: warping ? 'none' : undefined,
            }}
          >
            {!warping &&
              d.processes.map((p, i) => {
                const a = (reduceMotion ? 0 : mt / 2600) + (i / d.processes.length) * TAU;
                const orbit = sz * 1.05;
                const mx = Math.cos(a) * orbit;
                const my = Math.sin(a) * orbit * 0.42;
                const behind = Math.sin(a) < 0;
                const ms = (6 + Math.min(6, p.stepCount / 4)) * s;
                const moonKey = `moon:${p.id}`;
                const lit = hover === moonKey;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-label={`Open ${p.name}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onOpenProcess(p.id)}
                    onMouseEnter={() => setHover(moonKey)}
                    onMouseLeave={() => setHover((h) => (h === moonKey ? null : h))}
                    className="absolute flex cursor-pointer items-center justify-center rounded-full"
                    style={{ left: mx - 9, top: my - 9, width: 18, height: 18, zIndex: lit ? 5 : behind ? -1 : 2 }}
                  >
                    <span
                      className="block rounded-full transition-transform duration-150"
                      style={{
                        width: ms,
                        height: ms,
                        transform: `scale(${lit ? 1.6 : 1})`,
                        background: `radial-gradient(circle at 35% 30%, hsl(${d.hue} 60% 92%), hsl(${d.hue} 40% 62%) 70%, hsl(${d.hue} 40% 35%))`,
                        boxShadow: `0 0 ${lit ? 12 : 6}px hsl(${d.hue} 90% 70% / ${lit ? 1 : 0.7})`,
                      }}
                    />
                    {lit && (
                      <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-sky-300/40 bg-slate-950/85 px-2 py-1 text-[11px] text-white shadow-lg backdrop-blur">
                        {p.name} <span className="text-sky-300">· click to open</span>
                      </span>
                    )}
                  </button>
                );
              })}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => !flight.current && flyTo(d.name)}
              onMouseEnter={() => setHover(key)}
              onMouseLeave={() => setHover((h) => (h === key ? null : h))}
              aria-label={`Open ${d.name || 'Other processes'}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full transition-transform duration-200"
              style={{
                width: sz,
                height: sz,
                transform: `translate(-50%, -50%) scale(${on ? 1.15 : 1})`,
                transition: warping ? 'none' : undefined,
                boxShadow: isTarget
                  ? `0 0 ${40 + 120 * warp}px ${20 * warp}px hsl(${d.hue} 95% 65% / 0.8)`
                  : `0 0 ${on ? 30 : 16}px ${on ? 4 : 1}px hsl(${d.hue} 90% 62% / ${on ? 0.85 : 0.45})`,
              }}
            >
              <PlanetArt type={type} hue={d.hue} id={`s-${key.replace(/[^a-zA-Z0-9]/g, '')}`} spin={reduceMotion ? 0 : t / 400 + key.length * 17} />
            </button>
            {!warping && (
              <div
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center"
                style={{ top: sz / 2 + (type === 'ringed' ? 16 : 10) }}
              >
                <p className="text-sm font-semibold text-white drop-shadow">{d.name || 'Other'}</p>
              </div>
            )}
          </div>
        );
      })}

      {/* The hologram card for the planet you point at. */}
      {(() => {
        const h = !warping && hoverDept !== null ? at.get(hoverDept) : undefined;
        if (!h) return null;
        const d = h.d;
        const sends = handoffs.filter((x) => x.from === d.name);
        const gets = handoffs.filter((x) => x.to === d.name);
        const right = h.sx < size.w - 300;
        return (
          <div
            className="pointer-events-none absolute z-[300] w-60 rounded-xl border border-sky-300/45 bg-slate-950/75 px-4 py-3 text-xs text-white/85 shadow-[0_0_30px_rgba(56,189,248,0.25)] backdrop-blur-md duration-200 animate-in fade-in-0 zoom-in-95"
            style={{ left: right ? h.sx + planetSize : h.sx - planetSize - 240, top: h.sy - 70 }}
          >
            <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/80 to-transparent" />
            <p className="text-sm font-semibold" style={{ color: `hsl(${d.hue} 90% 75%)` }}>
              {d.name || 'Other processes'}
            </p>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-sky-200/60">{PLANET_LABEL[types.get(d.name) ?? 'rocky']}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {d.lead && (
                <>
                  <dt className="text-white/50">Lead</dt>
                  <dd>{d.lead}</dd>
                </>
              )}
              <dt className="text-white/50">Processes</dt>
              <dd>{d.processes.length}</dd>
              {d.hours !== null && (
                <>
                  <dt className="text-white/50">People time</dt>
                  <dd>{fmtHrs(d.hours)} hrs a month</dd>
                </>
              )}
              {sends.length > 0 && (
                <>
                  <dt className="text-white/50">Hands to</dt>
                  <dd>{sends.map((x) => x.to || 'Other').join(', ')}</dd>
                </>
              )}
              {gets.length > 0 && (
                <>
                  <dt className="text-white/50">Gets from</dt>
                  <dd>{gets.map((x) => x.from || 'Other').join(', ')}</dd>
                </>
              )}
            </dl>
            <p className="mt-2 font-medium text-sky-300">Click to fly in</p>
          </div>
        );
      })()}

      {/* Every department in a list: point to find it, click to dive in. */}
      <div
        className="absolute left-4 top-4 z-[310] w-48 rounded-xl border border-white/10 bg-slate-950/60 p-2 backdrop-blur"
        style={{ opacity: warping ? 0 : 1, pointerEvents: warping ? 'none' : undefined }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-white/45">Departments</p>
        {depts.map((d, i) => {
          const key = d.name || '~';
          return (
            <button
              key={key}
              type="button"
              onClick={() => !flight.current && flyTo(d.name)}
              onMouseEnter={() => setHover(key)}
              onMouseLeave={() => setHover((h) => (h === key ? null : h))}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs text-white/85 transition-colors ${
                hover === key ? 'bg-white/10' : 'hover:bg-white/10'
              }`}
            >
              <span className="relative h-4 w-4 shrink-0">
                <PlanetArt type={types.get(d.name) ?? 'rocky'} hue={d.hue} id={`sl${i}`} />
              </span>
              <span className="min-w-0 flex-1 truncate">{d.name || 'Other'}</span>
              <span className="tabular-nums text-white/40">{d.processes.length}</span>
            </button>
          );
        })}
      </div>

      {warp > 0.82 && <div className="pointer-events-none absolute inset-0 z-[400] bg-white" style={{ opacity: Math.min(1, (warp - 0.82) / 0.18) }} />}

      <p style={{ opacity: warping ? 0 : 1 }} className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/80 backdrop-blur">
        Drag to turn and tilt · Scroll to zoom · Point at a planet for details · Click to fly in
      </p>
    </div>
  );
}

/** The company's own sun: its logo (pulled from its website), name and website. */
function Sun({ company, size, x, y, warp, onSave }: {
  company: { name: string; website: string };
  size: number;
  x: number;
  y: number;
  warp: number;
  onSave?: (name: string, website: string) => Promise<void>;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => setLogoFailed(false), [company.website]);
  const name = company.name || 'Your company';
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  const logo = company.website && !logoFailed ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(company.website)}&sz=256` : null;
  const s = size * (1 - warp * 0.4);
  return (
    <div
      className="absolute"
      style={{ left: x, top: y, zIndex: 100, opacity: 1 - warp, transform: `scale(${1 + warp * 2})`, pointerEvents: warp > 0 ? 'none' : undefined }}
    >
      {/* The sun's glow. */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          left: -s * 1.6,
          top: -s * 1.6,
          width: s * 3.2,
          height: s * 3.2,
          background: 'radial-gradient(circle, hsl(40 100% 75% / 0.55), hsl(30 100% 60% / 0.18) 40%, transparent 70%)',
        }}
      />
      <div
        className="absolute flex items-center justify-center rounded-full"
        style={{
          left: -s / 2,
          top: -s / 2,
          width: s,
          height: s,
          background: 'radial-gradient(circle at 35% 30%, hsl(45 100% 92%), hsl(38 100% 65%) 60%, hsl(28 100% 52%))',
          boxShadow: '0 0 60px 12px hsl(38 100% 60% / 0.55)',
        }}
      >
        <div className="flex items-center justify-center overflow-hidden rounded-full bg-white shadow-inner" style={{ width: s * 0.66, height: s * 0.66 }}>
          {logo ? (
            <img src={logo} alt="" className="h-[70%] w-[70%] object-contain" onError={() => setLogoFailed(true)} />
          ) : (
            <span className="font-bold text-slate-800" style={{ fontSize: s * 0.22 }}>
              {initials}
            </span>
          )}
        </div>
      </div>
      <div
        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center"
        style={{ top: s / 2 + 12 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="text-base font-semibold text-amber-50 drop-shadow">{name}</p>
        {company.website && (
          <a
            href={`https://${company.website}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-amber-100/70 hover:text-amber-50 hover:underline"
          >
            {company.website}
          </a>
        )}
        {onSave && <CompanyEditor company={company} onSave={onSave} />}
      </div>
    </div>
  );
}

/** For admins: set the company's name and website, once. */
function CompanyEditor({ company, onSave }: { company: { name: string; website: string }; onSave: (name: string, website: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(company.name);
  const [website, setWebsite] = useState(company.website);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setName(company.name);
      setWebsite(company.website);
    }
  }, [open, company]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mx-auto mt-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-amber-100/60 hover:bg-white/10 hover:text-amber-50"
        >
          <Pencil className="h-3 w-3" /> {company.name || company.website ? 'Edit company' : 'Add your company'}
        </button>
      </PopoverTrigger>
      <PopoverContent data-ui className="w-72 space-y-3" onPointerDown={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold">Your company</p>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="co-name">Name</label>
          <Input id="co-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prospect Automations" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="co-web">Website (the logo comes from here)</label>
          <Input id="co-web" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="prospectautomations.com" />
        </div>
        <Button
          size="sm"
          className="w-full"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(name, website);
              setOpen(false);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
