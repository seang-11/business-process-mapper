import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface GlobeDept {
  /** The department's name, or '' for processes with none. */
  name: string;
  hue: number;
  lead: string;
  processes: { id: string; name: string; stepCount: number }[];
}

/** One department handing work to another: its processes that run the other's. */
export interface GlobeHandoff {
  from: string;
  to: string;
  items: { from: string; to: string }[];
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const TAU = Math.PI * 2;

type Vec = { x: number; y: number; z: number };

/**
 * Points along an arc from one department to another: round the sphere the
 * short way, lifted off the surface in the middle like a flight path. The
 * farther apart they are, the higher it flies.
 */
function arcPoints(a: Vec, b: Vec, extraLift: number, n = 40): Vec[] {
  const la = Math.hypot(a.x, a.y, a.z) || 1;
  const lb = Math.hypot(b.x, b.y, b.z) || 1;
  const ua = { x: a.x / la, y: a.y / la, z: a.z / la };
  const ub = { x: b.x / lb, y: b.y / lb, z: b.z / lb };
  const om = Math.acos(Math.max(-1, Math.min(1, ua.x * ub.x + ua.y * ub.y + ua.z * ub.z)));
  const so = Math.sin(om);
  const lift = 0.15 + 0.3 * (om / Math.PI) + extraLift;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const wa = so < 1e-4 ? 1 - t : Math.sin((1 - t) * om) / so;
    const wb = so < 1e-4 ? t : Math.sin(t * om) / so;
    const x = ua.x * wa + ub.x * wb;
    const y = ua.y * wa + ub.y * wb;
    const z = ua.z * wa + ub.z * wb;
    const m = Math.hypot(x, y, z) || 1;
    const len = (la + (lb - la) * t) * (1 + lift * Math.sin(Math.PI * t));
    return { x: (x / m) * len, y: (y / m) * len, z: (z / m) * len };
  });
}

/** Rotate a point on the unit sphere: first around the up axis (yaw), then tip it towards you (pitch). */
function rotate(p: { x: number; y: number; z: number }, yaw: number, pitch: number) {
  const x1 = p.x * Math.cos(yaw) - p.z * Math.sin(yaw);
  const z1 = p.x * Math.sin(yaw) + p.z * Math.cos(yaw);
  const y2 = p.y * Math.cos(pitch) - z1 * Math.sin(pitch);
  const z2 = p.y * Math.sin(pitch) + z1 * Math.cos(pitch);
  return { x: x1, y: y2, z: z2 };
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The shortest way round from one angle to another. */
const nearest = (from: number, to: number) => {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return from + d;
};

/**
 * The company as a globe: each department a glowing sphere in its own color,
 * spread evenly over a slowly turning world, with its processes orbiting it
 * like moons. Arcs fly between departments where one hands work to another,
 * with light running along them in the direction the work goes. Drag to spin
 * it; click a department to fly in and open it.
 * Drawn with plain elements and a little math, so it needs no 3D library.
 */
export default function BrainGlobe({
  depts,
  handoffs,
  onOpen,
}: {
  depts: GlobeDept[];
  handoffs: GlobeHandoff[];
  onOpen: (name: string) => void;
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

  // Departments spread evenly over the sphere.
  const points = useMemo(
    () =>
      depts.map((d, i) => {
        const n = depts.length;
        const y = n === 1 ? 0 : 1 - (2 * (i + 0.5)) / n;
        const r = Math.sqrt(1 - y * y);
        const a = i * GOLDEN;
        return { d, base: { x: Math.cos(a) * r, y: y * 0.85, z: Math.sin(a) * r } };
      }),
    [depts],
  );

  // Each handoff's flight path, worked out once; only the turning changes per frame.
  const arcs = useMemo(() => {
    const at = new Map(points.map(({ d, base }) => [d.name, { base, hue: d.hue }]));
    return handoffs.flatMap((h) => {
      const a = at.get(h.from);
      const b = at.get(h.to);
      if (!a || !b) return [];
      // Work going both ways between two departments: the second arc flies a little higher.
      const extra = h.from > h.to && handoffs.some((o) => o.from === h.to && o.to === h.from) ? 0.12 : 0;
      return [{ h, key: `arc:${h.from}>${h.to}`, fromHue: a.hue, toHue: b.hue, pts: arcPoints(a.base, b.base, extra) }];
    });
  }, [points, handoffs]);

  const reduceMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const view = useRef({ yaw: 0.4, pitch: -0.25, zoom: 1, t: 0 });
  const [, setFrame] = useState(0);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(null);
  const flight = useRef<{ from: typeof view.current; to: { yaw: number; pitch: number; zoom: number }; start: number; name: string } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  // One loop drives everything: the slow spin, the orbiting processes, and a fly-in.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // The first frame's timestamp can be a hair before the one we started from.
      const dt = Math.max(0, Math.min(64, now - last));
      last = now;
      const v = view.current;
      const f = flight.current;
      if (f) {
        const k = Math.min(1, (now - f.start) / 900);
        const e = ease(k);
        v.yaw = f.from.yaw + (f.to.yaw - f.from.yaw) * e;
        v.pitch = f.from.pitch + (f.to.pitch - f.from.pitch) * e;
        v.zoom = f.from.zoom + (f.to.zoom - f.from.zoom) * e;
        if (k >= 1) {
          flight.current = null;
          openRef.current(f.name);
          // Back from the department, the globe is waiting where it was, at normal size.
          v.zoom = 1;
        }
      } else if (!drag.current && !hoverRef.current && !reduceMotion) {
        v.yaw += dt * 0.00012;
      }
      v.t += dt;
      setFrame((n) => (n + 1) % 1_000_000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion]);

  const flyTo = (name: string, base: { x: number; y: number; z: number }) => {
    const v = view.current;
    // The yaw that brings it to the front, then the pitch that centres it.
    const yaw = Math.atan2(base.x, base.z);
    const z1 = base.x * Math.sin(yaw) + base.z * Math.cos(yaw);
    const pitch = Math.atan2(base.y, z1);
    flight.current = {
      from: { ...v },
      to: { yaw: nearest(v.yaw, yaw), pitch, zoom: 2.2 },
      start: performance.now(),
      name,
    };
  };

  const { yaw, pitch, zoom, t } = view.current;
  const cx = size.w / 2;
  const cy = size.h / 2 + 10;
  const R = Math.min(size.w, size.h) * 0.34 * zoom;

  // Longitude lines turn with the globe; latitude lines stay put, like a real one seen from the side.
  const meridians = Array.from({ length: 6 }, (_, i) => (i / 6) * Math.PI + yaw);
  const parallels = [-0.6, -0.3, 0, 0.3, 0.6];

  const placed = points
    .map(({ d, base }) => {
      const p = rotate(base, yaw, pitch);
      return { d, base, p, sx: cx + p.x * R, sy: cy + p.y * R, depth: (p.z + 1) / 2 };
    })
    .sort((a, b) => a.p.z - b.p.z);

  // Point at a department and its arcs stand out while the rest step back.
  const hoverDept = hover && !hover.startsWith('arc:') ? (hover === '~' ? '' : hover) : null;
  const drawn = arcs.map((arc) => {
    const scr = arc.pts.map((q) => {
      const p = rotate(q, yaw, pitch);
      return { x: cx + p.x * R, y: cy + p.y * R, hidden: p.z < 0 && Math.hypot(p.x, p.y) < 1 };
    });
    // Split into stretches in front of and behind the globe, so the far side can be drawn faint.
    const runs: { hidden: boolean; d: string }[] = [];
    scr.forEach((s, i) => {
      const last = runs[runs.length - 1];
      if (!last || last.hidden !== s.hidden) {
        const prev = scr[i - 1];
        runs.push({ hidden: s.hidden, d: prev ? `M${prev.x},${prev.y} L${s.x},${s.y}` : `M${s.x},${s.y}` });
      } else last.d += ` L${s.x},${s.y}`;
    });
    const on = hover === arc.key;
    const lit = on || (hoverDept !== null && (arc.h.from === hoverDept || arc.h.to === hoverDept));
    return { arc, scr, runs, on, lit, dim: !lit && hover !== null };
  });
  const pointed = drawn.find((a) => a.on);

  return (
    <div
      ref={box}
      data-ui
      className="absolute inset-0 z-10 cursor-grab select-none overflow-hidden active:cursor-grabbing"
      style={{ background: 'radial-gradient(ellipse at 50% 45%, hsl(225 45% 16%) 0%, hsl(228 50% 8%) 60%, hsl(230 55% 5%) 100%)' }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, yaw: view.current.yaw, pitch: view.current.pitch, moved: false };
      }}
      onPointerMove={(e) => {
        const g = drag.current;
        if (!g || flight.current) return;
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true;
        view.current.yaw = g.yaw + dx * 0.006;
        view.current.pitch = Math.max(-1.1, Math.min(1.1, g.pitch - dy * 0.006));
      }}
      onPointerUp={() => {
        setTimeout(() => (drag.current = null), 0);
      }}
    >
      {/* Stars, fixed so the globe turns in front of them. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        {Array.from({ length: 90 }, (_, i) => {
          const x = ((i * 9301 + 49297) % 233280) / 233280;
          const y = ((i * 4931 + 12345) % 104729) / 104729;
          const tw = 0.35 + 0.35 * Math.sin(t / 900 + i);
          return <circle key={i} cx={`${x * 100}%`} cy={`${y * 100}%`} r={i % 7 === 0 ? 1.4 : 0.8} fill="white" opacity={reduceMotion ? 0.5 : tw} />;
        })}
      </svg>

      {/* The globe itself: a glowing sphere with its grid. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <radialGradient id="globe-fill" cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="hsl(215 70% 45%)" stopOpacity="0.55" />
            <stop offset="60%" stopColor="hsl(225 60% 22%)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="hsl(230 60% 10%)" stopOpacity="0.8" />
          </radialGradient>
          <radialGradient id="globe-halo" cx="50%" cy="50%" r="50%">
            <stop offset="70%" stopColor="hsl(210 90% 60%)" stopOpacity="0" />
            <stop offset="100%" stopColor="hsl(210 90% 60%)" stopOpacity="0.25" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={R * 1.12} fill="url(#globe-halo)" />
        <circle cx={cx} cy={cy} r={R} fill="url(#globe-fill)" stroke="hsl(205 90% 70%)" strokeOpacity="0.35" />
        {parallels.map((lat) => (
          <ellipse
            key={lat}
            cx={cx}
            cy={cy + lat * R * Math.cos(pitch)}
            rx={R * Math.sqrt(1 - lat * lat)}
            ry={R * Math.sqrt(1 - lat * lat) * Math.abs(Math.sin(pitch)) + 0.5}
            fill="none"
            stroke="hsl(205 90% 75%)"
            strokeOpacity="0.14"
          />
        ))}
        {meridians.map((m, i) => (
          <ellipse
            key={i}
            cx={cx}
            cy={cy}
            rx={Math.abs(R * Math.cos(m)) + 0.5}
            ry={R}
            fill="none"
            stroke="hsl(205 90% 75%)"
            strokeOpacity="0.12"
          />
        ))}
      </svg>

      {/* Handoffs: arcs between departments, light running the way the work goes. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          {drawn.map(({ arc, scr }, i) => (
            <linearGradient
              key={arc.key}
              id={`handoff-${i}`}
              gradientUnits="userSpaceOnUse"
              x1={scr[0].x}
              y1={scr[0].y}
              x2={scr[scr.length - 1].x}
              y2={scr[scr.length - 1].y}
            >
              <stop offset="0%" stopColor={`hsl(${arc.fromHue} 90% 65%)`} />
              <stop offset="100%" stopColor={`hsl(${arc.toHue} 90% 65%)`} />
            </linearGradient>
          ))}
        </defs>
        {drawn.map(({ arc, scr, runs, on, lit, dim }, i) => {
          const width = Math.min(5, 1.2 + arc.h.items.length * 0.6) * (on ? 1.5 : 1);
          const pulses = Math.min(4, arc.h.items.length + 1);
          const last = scr.length - 1;
          return (
            <g key={arc.key} opacity={dim ? 0.15 : 1} style={{ transition: 'opacity 200ms' }}>
              {runs.map((r, j) => (
                <path
                  key={j}
                  d={r.d}
                  fill="none"
                  stroke={`url(#handoff-${i})`}
                  strokeWidth={width}
                  strokeLinecap="round"
                  strokeOpacity={r.hidden ? 0.2 : lit ? 0.95 : 0.6}
                  strokeDasharray={r.hidden ? '3 5' : undefined}
                />
              ))}
              {/* Light running from the department that sends the work to the one that gets it. */}
              {!reduceMotion &&
                Array.from({ length: pulses }, (_, k) => {
                  const u = ((((t / 2400 + k / pulses) % 1) + 1) % 1) * last;
                  const i0 = Math.max(0, Math.min(last, Math.floor(u)));
                  const a = scr[i0];
                  const b = scr[Math.min(last, i0 + 1)];
                  const f = u - i0;
                  const hue = arc.fromHue + (arc.toHue - arc.fromHue) * (u / last);
                  const fade = a.hidden ? 0.25 : 1;
                  return (
                    <g key={k} transform={`translate(${a.x + (b.x - a.x) * f} ${a.y + (b.y - a.y) * f})`}>
                      <circle r={width * 2.2} fill={`hsl(${hue} 95% 65%)`} opacity={0.3 * fade} />
                      <circle r={Math.max(1.6, width * 0.8)} fill={`hsl(${hue} 100% 88%)`} opacity={fade} />
                    </g>
                  );
                })}
              {/* A wide invisible line, so the arc is easy to point at. */}
              <path
                d={`M${scr.map((s) => `${s.x},${s.y}`).join(' L')}`}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                style={{ pointerEvents: 'stroke', cursor: 'help' }}
                onMouseEnter={() => setHover(arc.key)}
                onMouseLeave={() => setHover((h) => (h === arc.key ? null : h))}
              />
            </g>
          );
        })}
      </svg>

      {/* What the arc you point at carries. */}
      {pointed && (
        <div
          className="pointer-events-none absolute z-[200] max-w-xs rounded-lg border border-white/15 bg-slate-950/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur"
          style={{ left: pointed.scr[pointed.scr.length >> 1].x, top: pointed.scr[pointed.scr.length >> 1].y - 16, transform: 'translate(-50%, -100%)' }}
        >
          <p className="font-semibold">
            {pointed.arc.h.from || 'Other'} → {pointed.arc.h.to || 'Other'}
          </p>
          <ul className="mt-1 space-y-0.5 text-white/75">
            {pointed.arc.h.items.slice(0, 4).map((it, i) => (
              <li key={i}>
                {it.from} <span className="text-white/45">runs</span> {it.to}
              </li>
            ))}
            {pointed.arc.h.items.length > 4 && <li className="text-white/45">and {pointed.arc.h.items.length - 4} more</li>}
          </ul>
        </div>
      )}

      {/* Departments, back to front, each with its processes orbiting. */}
      {placed.map(({ d, base, sx, sy, depth }) => {
        const front = depth > 0.55;
        const s = 0.55 + depth * 0.65;
        const size = 46 * s * (zoom > 1 ? 1 + (zoom - 1) * 0.3 : 1);
        const key = d.name || '~';
        const on = hover === key;
        return (
          <div
            key={key}
            className="absolute"
            style={{ left: sx, top: sy, zIndex: Math.round(depth * 100), opacity: 0.3 + depth * 0.7 }}
          >
            {/* Moons: one per process. */}
            {d.processes.map((p, i) => {
              const a = (t / 2600) * (reduceMotion ? 0 : 1) + (i / d.processes.length) * TAU;
              const orbit = size * 0.95;
              const mx = Math.cos(a) * orbit;
              const my = Math.sin(a) * orbit * 0.42;
              const behind = Math.sin(a) < 0;
              const ms = (5 + Math.min(6, p.stepCount / 4)) * s;
              return (
                <span
                  key={p.id}
                  title={p.name}
                  className="absolute rounded-full"
                  style={{
                    left: mx - ms / 2,
                    top: my - ms / 2,
                    width: ms,
                    height: ms,
                    zIndex: behind ? -1 : 2,
                    background: `hsl(${d.hue} 85% 78%)`,
                    boxShadow: `0 0 ${6 * s}px hsl(${d.hue} 90% 70% / 0.8)`,
                  }}
                />
              );
            })}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => !flight.current && flyTo(d.name, base)}
              onMouseEnter={() => setHover(key)}
              onMouseLeave={() => setHover((h) => (h === key ? null : h))}
              aria-label={`Open ${d.name || 'Other processes'}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full transition-transform duration-200"
              style={{
                width: size,
                height: size,
                transform: `translate(-50%, -50%) scale(${on ? 1.12 : 1})`,
                background: `radial-gradient(circle at 35% 30%, hsl(${d.hue} 95% 82%), hsl(${d.hue} 75% 52%) 45%, hsl(${d.hue} 70% 28%) 100%)`,
                boxShadow: `0 0 ${18 * s}px hsl(${d.hue} 90% 60% / ${on ? 0.9 : 0.55}), inset -${4 * s}px -${5 * s}px ${10 * s}px rgba(0,0,0,0.35)`,
              }}
            />
            {/* The label: always on the front half, and for whatever you point at. */}
            {(front || on) && (
              <div
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center"
                style={{ top: size / 2 + 10 * s }}
              >
                <p className="font-semibold text-white drop-shadow" style={{ fontSize: 12 + 4 * s }}>
                  {d.name || 'Other'}
                </p>
                <p className="text-[11px] text-white/70">
                  {d.processes.length} {d.processes.length === 1 ? 'process' : 'processes'}
                  {on && d.lead ? ` · led by ${d.lead}` : ''}
                </p>
                {on && (() => {
                  const sends = handoffs.filter((h) => h.from === d.name).reduce((n, h) => n + h.items.length, 0);
                  const gets = handoffs.filter((h) => h.to === d.name).reduce((n, h) => n + h.items.length, 0);
                  return sends + gets > 0 ? (
                    <p className="text-[11px] text-white/70">
                      Hands off {sends} · Receives {gets}
                    </p>
                  ) : null;
                })()}
                {on && <p className="mt-0.5 text-[11px] font-medium text-sky-300">Click to fly in</p>}
              </div>
            )}
          </div>
        );
      })}

      <p className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/80 backdrop-blur">
        Drag to spin · Click a department to fly in{arcs.length > 0 && ' · Arcs show work handed between departments'}
      </p>
    </div>
  );
}
