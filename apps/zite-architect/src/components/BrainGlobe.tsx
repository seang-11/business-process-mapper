import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import PlanetArt, { PLANET_LABEL, planetTypes } from './PlanetArt';

export interface GlobeDept {
  /** The department's name, or '' for processes with none. */
  name: string;
  hue: number;
  lead: string;
  /** People hours a month across its processes, or null with no estimates. */
  hours: number | null;
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

/** How long the warp dive takes, in and back out. */
const WARP_MS = 1500;
/** The warp builds after the camera has started turning, so the trip reads as turn, then dive. */
const warpAt = (k: number) => ease(Math.max(0, Math.min(1, (k - 0.2) / 0.8)));

/** Stars for the warp: each at an angle and a depth, streaming outward as you travel. */
const STARS = Array.from({ length: 140 }, (_, i) => ({
  a: ((i * 2654435761) % 1000) / 1000 * Math.PI * 2,
  z: (((i * 40503) % 997) / 997) * 0.95 + 0.05,
  big: i % 9 === 0,
}));

/** A nearer layer of stars, for depth when the view turns. */
const NEAR = Array.from({ length: 45 }, (_, i) => ({
  x: ((i * 7919) % 1000) / 1000,
  y: ((i * 104729) % 997) / 997,
  r: 1 + ((i * 31) % 10) / 10,
}));

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
  onOpenProcess,
  returnFrom,
}: {
  depts: GlobeDept[];
  handoffs: GlobeHandoff[];
  onOpen: (name: string) => void;
  /** A moon was clicked: open that process. */
  onOpenProcess: (id: string) => void;
  /** Set when you come Back from a department, to fly back out of it. The count makes each return new. */
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
  /** warp: 0 at rest, 1 deep inside a department. travel: how far the stars have streamed. */
  const view = useRef({ yaw: 0.4, pitch: -0.25, zoom: 1, t: 0, warp: 0, travel: 0, target: null as string | null, mt: 0, home: 1 });
  const types = useMemo(() => planetTypes(depts.map((d) => d.name)), [depts]);
  const [, setFrame] = useState(0);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(null);
  const flight = useRef<{
    from: { yaw: number; pitch: number; zoom: number };
    to: { yaw: number; pitch: number; zoom: number };
    start: number;
    name: string;
    /** 1 diving in, -1 flying back out. */
    dir: 1 | -1;
  } | null>(null);
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
        const k = Math.min(1, (now - f.start) / WARP_MS);
        const e = ease(k);
        v.yaw = f.from.yaw + (f.to.yaw - f.from.yaw) * e;
        v.pitch = f.from.pitch + (f.to.pitch - f.from.pitch) * e;
        v.zoom = f.from.zoom + (f.to.zoom - f.from.zoom) * e;
        v.warp = f.dir === 1 ? warpAt(k) : warpAt(1 - k);
        if (k >= 1) {
          flight.current = null;
          if (f.dir === 1) {
            // Stay deep inside (all white) under the department page, ready to fly back out.
            v.warp = 1;
            openRef.current(f.name);
          } else {
            v.warp = 0;
            v.target = null;
          }
        }
      } else if (!drag.current && !hoverRef.current && !reduceMotion && v.warp === 0) {
        v.yaw += dt * 0.00012;
      }
      v.t += dt;
      // Moons hold still while you point at something, so they're easy to click.
      if (!hoverRef.current) v.mt += dt;
      v.travel += dt * v.warp * 0.0011;
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
    v.target = name;
    if (reduceMotion) {
      // No warp for anyone who asked for less motion: straight to the department.
      openRef.current(name);
      return;
    }
    v.home = v.zoom;
    setHover(null);
    flight.current = {
      from: { yaw: v.yaw, pitch: v.pitch, zoom: v.zoom },
      to: { yaw: nearest(v.yaw, yaw), pitch, zoom: Math.max(1.6, v.zoom) },
      start: performance.now(),
      name,
      dir: 1,
    };
  };

  // Scroll or pinch to move closer or farther. Listened to directly so the page itself never scrolls.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = view.current;
      if (flight.current || v.warp > 0) return;
      v.zoom = Math.max(0.6, Math.min(1.9, v.zoom * Math.exp(-e.deltaY * 0.0015)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Back from a department: the same trip in reverse, from inside it out to the whole globe.
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
    flight.current = {
      from: { yaw: v.yaw, pitch: v.pitch, zoom: v.zoom },
      to: { yaw: v.yaw, pitch: v.pitch, zoom: v.home },
      start: performance.now(),
      name: returnFrom.name,
      dir: -1,
    };
  }, [returnFrom, reduceMotion]);

  const { yaw, pitch, zoom, t, warp, travel, target } = view.current;
  const warping = warp > 0;
  const diag = Math.hypot(size.w, size.h);
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
  const hoverDept = hover && !hover.startsWith('arc:') && !hover.startsWith('moon:') ? (hover === '~' ? '' : hover) : null;
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
  const mt = view.current.mt;

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
      {/* Stars, fixed so the globe turns in front of them. In a warp they stream past as streaks. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        {STARS.map((st, i) => {
          const far = Math.hypot(size.w, size.h) / 2;
          const z = (((st.z - travel) % 1) + 1) % 1 || 1;
          const r = Math.min(far * 1.2, (far * 0.06) / Math.max(0.05, z));
          const r0 = r * (1 - 0.55 * warp);
          const ca = Math.cos(st.a);
          const sa = Math.sin(st.a);
          const tw = warping ? 0.5 + 0.5 * (1 - z) : reduceMotion ? 0.5 : 0.35 + 0.35 * Math.sin(t / 900 + i);
          return (
            <line
              key={i}
              x1={cx + ca * r0}
              y1={cy + sa * r0}
              x2={cx + ca * r}
              y2={cy + sa * r}
              stroke={warping ? 'hsl(215 100% 90%)' : 'white'}
              strokeWidth={(st.big ? 2.6 : 1.6) * (1 + warp * 0.8)}
              strokeLinecap="round"
              opacity={tw}
            />
          );
        })}
      </svg>

      {/* Nebula clouds drifting slowly, and a nearer layer of stars that slides further when you turn, so space has depth. */}
      <div className="pointer-events-none absolute inset-0" style={{ opacity: 1 - warp }} aria-hidden="true">
        {[
          { x: 22, y: 30, r: 46, h: 265 },
          { x: 78, y: 68, r: 52, h: 200 },
          { x: 64, y: 18, r: 34, h: 320 },
          { x: 30, y: 80, r: 38, h: 185 },
        ].map((n, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `calc(${n.x}% + ${Math.sin(t / 9000 + i) * 18 - yaw * 12}px)`,
              top: `calc(${n.y}% + ${Math.cos(t / 11000 + i) * 14 + pitch * 10}px)`,
              width: `${n.r}vmin`,
              height: `${n.r * 0.7}vmin`,
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(ellipse at center, hsl(${n.h} 80% 55% / 0.2), hsl(${n.h} 80% 45% / 0.07) 45%, transparent 70%)`,
              filter: 'blur(8px)',
            }}
          />
        ))}
        <svg className="absolute inset-0 h-full w-full">
          {NEAR.map((st, i) => {
            const x = (((st.x * size.w - yaw * 90) % size.w) + size.w) % size.w;
            const y = (((st.y * size.h + pitch * 60) % size.h) + size.h) % size.h;
            return <circle key={i} cx={x} cy={y} r={st.r} fill="white" opacity={0.75} />;
          })}
        </svg>
      </div>

      {/* The globe itself: a glowing sphere with its grid. It falls away as you warp in. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" opacity={Math.max(0, 1 - warp * 1.8)}>
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

      {/* Handoffs: only for the department you point at, light running the way the work goes. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" opacity={Math.max(0, 1 - warp * 2.5)}>
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
        {drawn.map(({ arc, scr, runs, lit }, i) => {
          if (!lit) return null;
          const width = Math.min(5, 1.2 + arc.h.items.length * 0.6);
          const pulses = Math.min(4, arc.h.items.length + 1);
          const last = scr.length - 1;
          return (
            <g key={arc.key}>
              {runs.map((r, j) => (
                <path
                  key={j}
                  d={r.d}
                  fill="none"
                  stroke={`url(#handoff-${i})`}
                  strokeWidth={width}
                  strokeLinecap="round"
                  strokeOpacity={r.hidden ? 0.25 : 0.95}
                  strokeDasharray={r.hidden ? '3 5' : undefined}
                />
              ))}
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
            </g>
          );
        })}
      </svg>

      {/* Departments, back to front: each a planet in its own color, with its processes as moons. */}
      {placed.map(({ d, base, sx: gx, sy: gy, depth }) => {
        const front = depth > 0.55;
        const s = 0.55 + depth * 0.65;
        const plain = 50 * s * (zoom > 1 ? 1 + (zoom - 1) * 0.45 : zoom);
        const key = d.name || '~';
        const on = hover === key && !warping;
        // In a warp, the department you picked swells to fill the screen; the rest fly off the edges.
        const isTarget = warping && target === d.name;
        const fill = (diag * 1.15) / plain;
        const size = isTarget ? plain * (1 + Math.pow(warp, 2.2) * (fill - 1)) : plain;
        const sx = isTarget ? gx + (cx - gx) * warp : cx + (gx - cx) * (1 + warp * 3);
        const sy = isTarget ? gy + (cy - gy) * warp : cy + (gy - cy) * (1 + warp * 3);
        const fade = isTarget ? 1 : 1 - warp;
        const type = types.get(d.name) ?? 'rocky';
        return (
          <div
            key={key}
            className="absolute"
            style={{
              left: sx,
              top: sy,
              zIndex: isTarget ? 150 : on ? 120 : Math.round(depth * 100),
              opacity: (isTarget ? 1 : 0.35 + depth * 0.65) * fade,
              pointerEvents: warping ? 'none' : undefined,
            }}
          >
            {/* Moons: one per process. Point at one for its name; click to open it. */}
            {!warping &&
              d.processes.map((p, i) => {
                const a = (mt / 2600) * (reduceMotion ? 0 : 1) + (i / d.processes.length) * TAU;
                const orbit = size * 1.05;
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
                        boxShadow: `0 0 ${(lit ? 12 : 6) * s}px hsl(${d.hue} 90% 70% / ${lit ? 1 : 0.7})`,
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
              onClick={() => !flight.current && flyTo(d.name, base)}
              onMouseEnter={() => setHover(key)}
              onMouseLeave={() => setHover((h) => (h === key ? null : h))}
              aria-label={`Open ${d.name || 'Other processes'}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full transition-transform duration-200"
              style={{
                width: size,
                height: size,
                transform: `translate(-50%, -50%) scale(${on ? 1.15 : 1})`,
                transition: warping ? 'none' : undefined,
                boxShadow: isTarget
                  ? `0 0 ${40 + 120 * warp}px ${20 * warp}px hsl(${d.hue} 95% 65% / 0.8)`
                  : `0 0 ${(on ? 30 : 16) * s}px ${on ? 4 : 1}px hsl(${d.hue} 90% 62% / ${on ? 0.85 : 0.45})`,
              }}
            >
              <PlanetArt type={type} hue={d.hue} id={`g-${key.replace(/[^a-zA-Z0-9]/g, '')}`} spin={reduceMotion ? 0 : t / 400 + key.length * 17} />
            </button>
            {/* The name: always on the front half, and for whatever you point at. */}
            {(front || on) && !warping && (
              <div
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center"
                style={{ top: size / 2 + (type === 'ringed' ? 16 : 10) * s }}
              >
                <p className="font-semibold text-white drop-shadow" style={{ fontSize: 12 + 4 * s }}>
                  {d.name || 'Other'}
                </p>
                <p className="text-[11px] text-white/65">
                  {d.processes.length} {d.processes.length === 1 ? 'process' : 'processes'}
                </p>
              </div>
            )}
          </div>
        );
      })}

      {/* The hologram card for the planet you point at. */}
      {(() => {
        const h = !warping && hoverDept !== null ? placed.find((p) => p.d.name === hoverDept) : null;
        if (!h) return null;
        const d = h.d;
        const sends = handoffs.filter((x) => x.from === d.name);
        const gets = handoffs.filter((x) => x.to === d.name);
        const right = h.sx < size.w - 280;
        return (
          <div
            className="pointer-events-none absolute z-[200] w-60 rounded-xl border border-sky-300/45 bg-slate-950/75 px-4 py-3 text-xs text-white/85 shadow-[0_0_30px_rgba(56,189,248,0.25)] backdrop-blur-md duration-200 animate-in fade-in-0 zoom-in-95"
            style={{ left: right ? h.sx + 56 : h.sx - 56 - 240, top: h.sy - 70 }}
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
                  <dd>{d.hours >= 10 ? Math.round(d.hours) : Math.round(d.hours * 10) / 10} hrs a month</dd>
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

      {/* Every department in a list: point to find it, click to fly there. */}
      <div
        className="absolute left-4 top-4 z-[210] w-48 rounded-xl border border-white/10 bg-slate-950/60 p-2 backdrop-blur transition-opacity"
        style={{ opacity: warping ? 0 : 1, pointerEvents: warping ? 'none' : undefined }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-white/45">Departments</p>
        {points.map(({ d, base }, i) => {
          const key = d.name || '~';
          return (
            <button
              key={key}
              type="button"
              onClick={() => !flight.current && flyTo(d.name, base)}
              onMouseEnter={() => setHover(key)}
              onMouseLeave={() => setHover((h) => (h === key ? null : h))}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs text-white/85 transition-colors ${
                hover === key ? 'bg-white/10' : 'hover:bg-white/10'
              }`}
            >
              <span className="relative h-4 w-4 shrink-0">
                <PlanetArt type={types.get(d.name) ?? 'rocky'} hue={d.hue} id={`l${i}`} />
              </span>
              <span className="min-w-0 flex-1 truncate">{d.name || 'Other'}</span>
              <span className="tabular-nums text-white/40">{d.processes.length}</span>
            </button>
          );
        })}
      </div>

      {/* The flash at the end of the dive, as you land in the department. */}
      {warp > 0.82 && <div className="pointer-events-none absolute inset-0 z-[300] bg-white" style={{ opacity: Math.min(1, (warp - 0.82) / 0.18) }} />}

      <p style={{ opacity: warping ? 0 : 1 }} className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/80 backdrop-blur">
        Drag to turn · Scroll to zoom · Point at a planet for details · Click to fly in
      </p>
    </div>
  );
}
