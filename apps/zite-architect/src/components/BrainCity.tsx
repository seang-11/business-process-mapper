import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';

export interface CityProc {
  id: string;
  name: string;
  department: string;
  hue: number;
  /** People hours a month today, or null with no estimate. */
  hours: number | null;
  /** Share of steps apps do today, 0 to 100. */
  autoPct: number;
  /** The same once the newest future version is live, or null when there isn't one. */
  future: { hours: number | null; autoPct: number } | null;
}

/** Building footprint, gap between buildings, and the street between neighborhoods, in city units. */
const FOOT = 44;
const LOT = 74;
const STREET = 70;
const MAX_H = 300;
const FLOOR = 18;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const fmt = (h: number) => (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10);
/** A steady pseudo-random number per window, so the same windows stay lit. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

interface Placed {
  p: CityProc;
  x: number;
  z: number;
}

/**
 * The company as a city at night: every process is a tower in its department's
 * neighborhood. Height is the people hours it takes a month, lit windows are the
 * share apps already do, and a red beacon marks the three biggest drains. Slide
 * from Today to Future and the towers shrink as the future versions take hours
 * away. Drag to turn, scroll to zoom, click a tower to open its process.
 */
export default function BrainCity({ procs, onOpenProcess, onOpenDept }: {
  procs: CityProc[];
  onOpenProcess: (id: string) => void;
  onOpenDept: (name: string) => void;
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

  const [cam, setCam] = useState({ yaw: 0.65, pitch: 0.62, zoom: 1 });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  // 0 is today, 1 is once every future version is live. Clicking a side glides there.
  const [mix, setMix] = useState(0);
  const anim = useRef(0);
  const glide = (to: number) => {
    cancelAnimationFrame(anim.current);
    const from = mix;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 1200);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      setMix(from + (to - from) * e);
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCam((c) => ({ ...c, zoom: Math.max(0.5, Math.min(2.4, c.zoom * Math.exp(-e.deltaY * 0.0015))) }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Neighborhoods in a grid, each a little grid of towers; the whole city centred on the origin.
  const { placed, hoods } = useMemo(() => {
    const byDept = new Map<string, CityProc[]>();
    for (const p of procs) byDept.set(p.department, [...(byDept.get(p.department) ?? []), p]);
    const depts = [...byDept.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
    const perRow = Math.ceil(Math.sqrt(depts.length));
    const cols = (n: number) => Math.max(1, Math.ceil(Math.sqrt(n)));
    const blockW = Math.max(...depts.map((d) => cols(byDept.get(d)!.length))) * LOT;
    const out: Placed[] = [];
    const hoodList: { name: string; hue: number; x0: number; z0: number; x1: number; z1: number }[] = [];
    depts.forEach((d, i) => {
      const list = [...byDept.get(d)!].sort((a, b) => (b.hours ?? 0) - (a.hours ?? 0));
      const c = cols(list.length);
      const bx = (i % perRow) * (blockW + STREET);
      const bz = Math.floor(i / perRow) * (blockW + STREET);
      list.forEach((p, j) => out.push({ p, x: bx + (j % c) * LOT + LOT / 2, z: bz + Math.floor(j / c) * LOT + LOT / 2 }));
      hoodList.push({ name: d, hue: list[0]?.hue ?? 220, x0: bx, z0: bz, x1: bx + blockW, z1: bz + Math.ceil(list.length / c) * LOT });
    });
    const mx = (Math.max(...hoodList.map((h) => h.x1)) + Math.min(...hoodList.map((h) => h.x0))) / 2;
    const mz = (Math.max(...hoodList.map((h) => h.z1)) + Math.min(...hoodList.map((h) => h.z0))) / 2;
    return {
      placed: out.map((o) => ({ ...o, x: o.x - mx, z: o.z - mz })),
      hoods: hoodList.map((h) => ({ ...h, x0: h.x0 - mx, x1: h.x1 - mx, z0: h.z0 - mz, z1: h.z1 - mz })),
    };
  }, [procs]);

  const span = Math.max(1, ...hoods.map((h) => Math.max(Math.abs(h.x0), Math.abs(h.x1), Math.abs(h.z0), Math.abs(h.z1))));
  const maxHours = Math.max(1, ...procs.map((p) => p.hours ?? 0));
  const hoursAt = (p: CityProc) => (p.hours === null ? null : lerp(p.hours, p.future?.hours ?? p.hours, mix));
  const autoAt = (p: CityProc) => lerp(p.autoPct, p.future?.autoPct ?? p.autoPct, mix);
  const top3 = new Set([...procs].sort((a, b) => (b.hours ?? 0) - (a.hours ?? 0)).slice(0, 3).filter((p) => p.hours).map((p) => p.id));
  const total = procs.reduce((n, p) => n + (p.hours ?? 0), 0);
  const totalFuture = procs.reduce((n, p) => n + (p.future?.hours ?? p.hours ?? 0), 0);
  const nowTotal = lerp(total, totalFuture, mix);
  const hasFuture = procs.some((p) => p.future);

  // An orthographic camera: turn round the up axis, then look down at the pitch.
  const { yaw, pitch, zoom } = cam;
  const k = (Math.min(size.w, size.h) / (span * 2.6)) * zoom;
  const cx = size.w / 2;
  const cy = size.h / 2 + 70 * zoom;
  const sy = Math.sin(pitch);
  const cyw = Math.cos(pitch);
  const proj = (x: number, y: number, z: number) => {
    const x1 = x * Math.cos(yaw) - z * Math.sin(yaw);
    const z1 = x * Math.sin(yaw) + z * Math.cos(yaw);
    return { x: cx + x1 * k, y: cy + (z1 * sy - y * cyw) * k, d: z1 };
  };
  const pts = (list: { x: number; y: number }[]) => list.map((q) => `${q.x},${q.y}`).join(' ');
  // Which way each side faces after turning, so only the sides towards you are drawn.
  const facing = (nx: number, nz: number) => nx * Math.sin(yaw) + nz * Math.cos(yaw) > 0.01;

  const order = [...placed].sort((a, b) => proj(a.x, 0, a.z).d - proj(b.x, 0, b.z).d);
  const hovered = hover ? placed.find((o) => o.p.id === hover) : undefined;

  return (
    <div
      ref={box}
      data-ui
      className="absolute inset-0 z-10 cursor-grab select-none overflow-hidden active:cursor-grabbing"
      style={{ background: 'linear-gradient(180deg, hsl(232 55% 6%) 0%, hsl(228 50% 11%) 55%, hsl(260 40% 16%) 100%)' }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch, moved: false };
      }}
      onPointerMove={(e) => {
        const g = drag.current;
        if (!g) return;
        if (Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 3) g.moved = true;
        setCam((c) => ({
          ...c,
          yaw: g.yaw + (e.clientX - g.x) * 0.006,
          pitch: Math.max(0.3, Math.min(1.25, g.pitch + (e.clientY - g.y) * 0.004)),
        }));
      }}
      onPointerUp={() => {
        setTimeout(() => (drag.current = null), 0);
      }}
    >
      {/* A few stars and a glow on the horizon behind the skyline. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <radialGradient id="city-glow" cx="50%" cy="100%" r="70%">
            <stop offset="0%" stopColor="hsl(30 100% 60%)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="hsl(30 100% 60%)" stopOpacity="0" />
          </radialGradient>
        </defs>
        {Array.from({ length: 70 }, (_, i) => (
          <circle key={i} cx={`${hash(i) * 100}%`} cy={`${hash(i + 99) * 45}%`} r={hash(i + 7) > 0.85 ? 1.3 : 0.7} fill="white" opacity={0.25 + hash(i + 3) * 0.5} />
        ))}
        <rect x="0" y="0" width="100%" height="100%" fill="url(#city-glow)" />
      </svg>

      <svg className="absolute inset-0 h-full w-full">
        {/* The ground: each neighborhood a softly lit block, streets in between. */}
        {hoods.map((h) => {
          const pad = 10;
          const c = [
            proj(h.x0 + pad, 0, h.z0 + pad),
            proj(h.x1 - pad, 0, h.z0 + pad),
            proj(h.x1 - pad, 0, h.z1 - pad),
            proj(h.x0 + pad, 0, h.z1 - pad),
          ];
          return (
            <polygon
              key={h.name || '~'}
              points={pts(c)}
              fill={`hsl(${h.hue} 45% 22% / 0.55)`}
              stroke={`hsl(${h.hue} 80% 60% / 0.45)`}
              strokeWidth={1}
            />
          );
        })}

        {/* Towers, far to near. */}
        {order.map(({ p, x, z }) => {
          const hrs = hoursAt(p);
          const h = hrs === null ? 10 : Math.max(14, (hrs / maxHours) * MAX_H);
          const auto = autoAt(p);
          const on = hover === p.id;
          const f = FOOT / 2;
          const corners = [
            [x - f, z - f],
            [x + f, z - f],
            [x + f, z + f],
            [x - f, z + f],
          ] as const;
          // The four sides, each with its outward direction.
          const sides = [
            { a: 0, b: 1, nx: 0, nz: -1, light: 0.75 },
            { a: 1, b: 2, nx: 1, nz: 0, light: 0.55 },
            { a: 2, b: 3, nx: 0, nz: 1, light: 0.85 },
            { a: 3, b: 0, nx: -1, nz: 0, light: 0.6 },
          ].filter((s) => facing(s.nx, s.nz));
          const floors = Math.max(1, Math.floor((h - 6) / FLOOR));
          const dim = hrs === null;
          return (
            <g
              key={p.id}
              className="cursor-pointer"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onOpenProcess(p.id)}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover((v) => (v === p.id ? null : v))}
            >
              {sides.map((s, si) => {
                const [ax, az] = corners[s.a];
                const [bx, bz] = corners[s.b];
                const face = [proj(ax, 0, az), proj(bx, 0, bz), proj(bx, h, bz), proj(ax, h, az)];
                const windows: ReactElement[] = [];
                if (!dim) {
                  for (let r = 0; r < floors; r++) {
                    for (let c = 0; c < 3; c++) {
                      const lit = hash(p.name.length * 31 + si * 977 + r * 13 + c) * 100 < auto;
                      const u0 = 0.14 + c * 0.27;
                      const u1 = u0 + 0.16;
                      const y0 = 8 + r * FLOOR;
                      const y1 = y0 + FLOOR * 0.55;
                      const at = (u: number, y: number) => proj(ax + (bx - ax) * u, y, az + (bz - az) * u);
                      windows.push(
                        <polygon
                          key={`${r}-${c}`}
                          points={pts([at(u0, y0), at(u1, y0), at(u1, y1), at(u0, y1)])}
                          fill={lit ? 'hsl(45 100% 70%)' : 'hsl(225 40% 14%)'}
                          opacity={lit ? 0.95 : 0.8}
                        />,
                      );
                    }
                  }
                }
                return (
                  <g key={si}>
                    <polygon
                      points={pts(face)}
                      fill={dim ? `hsl(220 10% ${30 * s.light}%)` : `hsl(${p.hue} 35% ${34 * s.light}%)`}
                      stroke={on ? 'hsl(195 100% 75%)' : `hsl(${p.hue} 50% 50% / 0.5)`}
                      strokeWidth={on ? 1.5 : 0.6}
                    />
                    {windows}
                  </g>
                );
              })}
              {/* The roof. */}
              <polygon
                points={pts(corners.map(([cx2, cz2]) => proj(cx2, h, cz2)))}
                fill={dim ? 'hsl(220 10% 38%)' : `hsl(${p.hue} 45% ${on ? 58 : 46}%)`}
                stroke={on ? 'hsl(195 100% 75%)' : `hsl(${p.hue} 60% 65% / 0.6)`}
                strokeWidth={on ? 1.5 : 0.6}
              />
              {/* A red beacon on the three biggest drains. */}
              {top3.has(p.id) && (() => {
                const b = proj(x, h + 16, z);
                const base = proj(x, h, z);
                return (
                  <g className="pointer-events-none">
                    <line x1={base.x} y1={base.y} x2={b.x} y2={b.y} stroke="hsl(220 15% 70%)" strokeWidth={1.5} />
                    <circle cx={b.x} cy={b.y} r={9} fill="hsl(0 100% 60%)" opacity={0.35} className="animate-pulse" />
                    <circle cx={b.x} cy={b.y} r={3} fill="hsl(0 100% 65%)" />
                  </g>
                );
              })()}
            </g>
          );
        })}

        {/* Neighborhood names at the front edge of each block. */}
        {hoods.map((h) => {
          const front = [proj(h.x0, 0, h.z1), proj(h.x1, 0, h.z1), proj(h.x0, 0, h.z0), proj(h.x1, 0, h.z0)].sort((a, b) => b.y - a.y);
          const lx = (front[0].x + front[1].x) / 2;
          const ly = Math.max(front[0].y, front[1].y) + 18;
          return (
            <text
              key={`l-${h.name || '~'}`}
              x={lx}
              y={ly}
              textAnchor="middle"
              className="cursor-pointer fill-white text-[13px] font-semibold"
              style={{ paintOrder: 'stroke', stroke: 'hsl(230 50% 8%)', strokeWidth: 4 }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onOpenDept(h.name)}
            >
              {h.name || 'Other'}
            </text>
          );
        })}
      </svg>

      {/* The tower you point at. */}
      {hovered && (() => {
        const p = hovered.p;
        const hrs = hoursAt(p);
        const h = hrs === null ? 10 : Math.max(14, (hrs / maxHours) * MAX_H);
        const at = proj(hovered.x, h, hovered.z);
        const right = at.x < size.w - 290;
        return (
          <div
            className="pointer-events-none absolute z-[200] w-60 rounded-xl border border-sky-300/45 bg-slate-950/80 px-4 py-3 text-xs text-white/85 shadow-[0_0_30px_rgba(56,189,248,0.25)] backdrop-blur-md duration-150 animate-in fade-in-0 zoom-in-95"
            style={{ left: right ? at.x + 30 : at.x - 270, top: Math.max(70, at.y - 20) }}
          >
            <p className="text-sm font-semibold" style={{ color: `hsl(${p.hue} 90% 75%)` }}>{p.name}</p>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-sky-200/60">{p.department || 'No department'}</p>
            {p.hours === null ? (
              <p>No time estimate yet.</p>
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-white/50">Today</dt>
                <dd>{fmt(p.hours)} hrs a month · {p.autoPct}% by apps</dd>
                {p.future && p.future.hours !== null && (
                  <>
                    <dt className="text-white/50">Future</dt>
                    <dd>
                      {fmt(p.future.hours)} hrs a month · {p.future.autoPct}% by apps
                      {p.hours - p.future.hours > 0.05 && (
                        <span className="block font-medium text-emerald-300">saves {fmt(p.hours - p.future.hours)} hrs a month</span>
                      )}
                    </dd>
                  </>
                )}
              </dl>
            )}
            {p.hours !== null && p.autoPct < 30 && !p.future && (
              <p className="mt-2 font-medium text-amber-300">Mostly by hand. A good one to automate.</p>
            )}
            <p className="mt-2 font-medium text-sky-300">Click to open</p>
          </div>
        );
      })()}

      {/* Today to Future. */}
      <div
        className="absolute bottom-5 left-1/2 z-[210] flex w-[min(560px,calc(100%-2rem))] -translate-x-1/2 cursor-default flex-col gap-2 rounded-2xl border border-white/15 bg-slate-950/70 px-5 py-3 text-white shadow-xl backdrop-blur"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-white/70">
            <span className="mr-1 text-2xl font-semibold tabular-nums text-white">{fmt(nowTotal)}</span>
            people hrs a month
          </p>
          {hasFuture && total - totalFuture > 0.05 && (
            <p className="text-sm font-medium text-emerald-300">
              {mix > 0.02 ? `saves ${fmt(total - nowTotal)} hrs` : `future saves ${fmt(total - totalFuture)} hrs`}
            </p>
          )}
        </div>
        {hasFuture ? (
          <div className="flex items-center gap-3 text-xs">
            <button type="button" onClick={() => glide(0)} className={`font-semibold ${mix < 0.5 ? 'text-white' : 'text-white/50 hover:text-white'}`}>
              Today
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(mix * 100)}
              onChange={(e) => {
                cancelAnimationFrame(anim.current);
                setMix(Number(e.target.value) / 100);
              }}
              aria-label="From today to the future"
              className="flex-1 accent-emerald-400"
            />
            <button type="button" onClick={() => glide(1)} className={`font-semibold ${mix >= 0.5 ? 'text-emerald-300' : 'text-white/50 hover:text-white'}`}>
              Future
            </button>
          </div>
        ) : (
          <p className="text-xs text-white/50">Add a future version to a process to see the city shrink.</p>
        )}
        <p className="text-[11px] text-white/45">
          Taller = more people hours · Lit windows = done by apps · Red beacon = biggest drains · Drag to turn · Scroll to zoom
        </p>
      </div>
    </div>
  );
}
