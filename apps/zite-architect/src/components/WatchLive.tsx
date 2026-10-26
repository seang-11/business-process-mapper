import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Pause, Play, RotateCcw } from 'lucide-react';
import type { ElementRef, ProcessConnection, ProcessStep } from '@/types';
import { appsOf, buildOutline } from '@/lib/walkthrough';
import { flowLayout, STEP_H, STEP_W } from '@/lib/brainFlow';
import ElementIcon from './ElementIcon';

const isApp = (e: ElementRef | null | undefined) => e?.actorClass === 'System';
const SPEEDS = [1, 1.5, 2] as const;
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

/** The sentence under the map: the step's own walkthrough line, else the first sentence of its note, else who does what. */
function captionOf(s: ProcessStep) {
  const line = s.walkthroughLine.trim();
  if (line) return line;
  const first = s.description.trim().split(/(?<=[.!?])\s/)[0];
  if (first) return first;
  return s.performedBy ? `${s.performedBy.name}: ${s.title}` : s.title;
}

/** How long a step stays on screen: long enough for its apps to pop in and its checklist to tick off. */
const durationOf = (s: ProcessStep) => 2600 + appsOf(s).length * 250 + s.checklist.length * 550;

/**
 * "Watch it Live": the process plays like a video. The camera glides along the
 * step map, a glowing dot carries the work from step to step, and each step
 * opens to show who does it, the apps it uses lighting up and its checklist
 * ticking off, with a one-line caption below. At a decision it waits for you to
 * pick which way to go. Play, pause, speed, and a progress bar you can click.
 */
export default function WatchLive({ steps, connections, processName }: {
  steps: ProcessStep[];
  connections: ProcessConnection[];
  processName: string;
}) {
  const outline = useMemo(() => buildOutline(steps, connections), [steps, connections]);
  const items = outline.items;
  const layout = useMemo(
    () => flowLayout(steps.map((s) => s.id), connections.map((c) => ({ from: c.fromStepId, to: c.toStepId, label: c.label }))),
    [steps, connections],
  );

  const [cur, setCur] = useState<string | null>(null);
  const [visited, setVisited] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [ticked, setTicked] = useState(0);
  const [shownApps, setShownApps] = useState(0);
  const reduceMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const item = cur ? outline.byId.get(cur) ?? null : null;
  const step = item?.step ?? null;
  const choosing = !!item && item.outcomes.length > 1;

  const go = useCallback((id: string) => {
    setCur(id);
    setEnded(false);
    setVisited((v) => (v.includes(id) ? v : [...v, id]));
  }, []);

  const start = useCallback(() => {
    if (!items[0]) return;
    setVisited([]);
    go(items[0].step.id);
    setPlaying(true);
  }, [items, go]);

  // A step's apps pop in, then its checklist ticks off, one at a time.
  useEffect(() => {
    setTicked(0);
    setShownApps(0);
    if (!step) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const apps = appsOf(step).length;
    for (let i = 1; i <= apps; i += 1) timers.push(setTimeout(() => setShownApps(i), (350 + i * 250) / speed));
    for (let i = 1; i <= step.checklist.length; i += 1) {
      timers.push(setTimeout(() => setTicked(i), (700 + apps * 250 + i * 550) / speed));
    }
    return () => timers.forEach(clearTimeout);
  }, [step, speed]);

  // Playing moves on by itself, except at a decision, which waits for a pick.
  useEffect(() => {
    if (!playing || !step || !item || choosing) return;
    const t = setTimeout(() => {
      if (item.nextId) go(item.nextId);
      else {
        setPlaying(false);
        setEnded(true);
      }
    }, durationOf(step) / speed);
    return () => clearTimeout(t);
  }, [playing, step, item, choosing, speed, go]);

  // The camera keeps the step on screen in the middle.
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 460 });
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const at = cur ? layout.pos.get(cur) : null;
  const first = items[0] ? layout.pos.get(items[0].step.id) : null;
  const focus = at ?? first ?? { x: 0, y: 0 };
  const camX = size.w / 2 - (focus.x + STEP_W / 2);
  const camY = Math.min(40, size.h * 0.32 - (focus.y + STEP_H / 2));
  const glide = reduceMotion ? 'none' : 'transform 900ms cubic-bezier(0.4, 0, 0.2, 1)';

  const index = item ? item.number : 0;
  const total = items.length;
  const doneSet = new Set(visited.slice(0, -1));

  if (total === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">This process has no steps yet.</div>;
  }

  return (
    <div className="flex h-full min-h-[520px] flex-col">
      <div ref={stage} className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-[hsl(220_20%_97.5%)]">
        <div
          className="absolute left-0 top-0"
          style={{ width: layout.width, height: layout.height, transform: `translate(${camX}px, ${camY}px)`, transition: glide }}
        >
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={layout.width} height={layout.height} aria-hidden="true">
            {layout.forward.map((e) => {
              const a = layout.pos.get(e.from);
              const b = layout.pos.get(e.to);
              if (!a || !b) return null;
              const x1 = a.x + STEP_W, y1 = a.y + STEP_H / 2, x2 = b.x, y2 = b.y + STEP_H / 2;
              const c = Math.max(24, (x2 - x1) / 2);
              const lit = visited.includes(e.from) && visited.includes(e.to);
              return (
                <path
                  key={`${e.from}->${e.to}`}
                  d={`M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={lit ? 'hsl(var(--primary))' : 'hsl(220 9% 75%)'}
                  strokeWidth={lit ? 2.25 : 1.5}
                  style={{ transition: 'stroke 400ms' }}
                />
              );
            })}
          </svg>

          {[...layout.pos].map(([id, p]) => {
            const s = outline.byId.get(id)?.step;
            if (!s) return null;
            const on = id === cur;
            const done = doneSet.has(id);
            const decision = s.stepType === 'Decision';
            return (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                title="Jump here"
                className={`absolute flex flex-col rounded-xl border p-2.5 text-left transition-all duration-500 ${
                  decision ? 'border-amber-200 bg-amber-50' : isApp(s.performedBy) ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-background'
                } ${on ? 'z-10 -translate-y-1 shadow-[0_0_0_4px_hsl(var(--primary)/0.18),0_8px_24px_rgba(16,24,40,0.12)] ring-2 ring-primary' : ''} ${
                  !on && !done && cur ? 'opacity-45' : ''
                }`}
                style={{ left: p.x, top: p.y, width: STEP_W, height: STEP_H }}
              >
                <span className="truncate text-[10px] font-semibold text-muted-foreground">
                  {s.performedBy?.name ?? 'Nobody yet'}
                  {decision ? ' · Decision' : ''}
                </span>
                <span className="mt-1 line-clamp-2 text-[12px] font-medium leading-snug">{s.title}</span>
              </button>
            );
          })}

          {/* The work itself, travelling from step to step. */}
          {at && (
            <span
              className="pointer-events-none absolute z-20 h-3.5 w-3.5 rounded-full bg-primary"
              style={{
                left: at.x - 7,
                top: at.y + STEP_H / 2 - 7,
                boxShadow: '0 0 0 6px hsl(var(--primary) / 0.22), 0 0 16px hsl(var(--primary) / 0.7)',
                transition: reduceMotion ? 'none' : 'left 900ms cubic-bezier(0.4,0,0.2,1), top 900ms cubic-bezier(0.4,0,0.2,1)',
              }}
            />
          )}

          {/* The step, opened up: who, the apps lighting up, the checklist ticking off. */}
          {step && at && (
            <div
              key={step.id}
              className="absolute z-30 w-[340px] rounded-2xl border border-border bg-card p-4 shadow-[0_12px_32px_rgba(16,24,40,0.14)] animate-in fade-in slide-in-from-top-2 duration-500"
              style={{ left: at.x + STEP_W / 2 - 170, top: at.y + STEP_H + 18 }}
            >
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                {step.performedBy && isApp(step.performedBy) ? (
                  <ElementIcon
                    name={step.performedBy.name}
                    image={step.performedBy.image}
                    icon={step.performedBy.icon}
                    typeIcon={step.performedBy.typeIcon}
                    color={step.performedBy.color}
                    size={18}
                  />
                ) : (
                  <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
                    {initials(step.performedBy?.name ?? '?')}
                  </span>
                )}
                <span className="font-medium text-foreground">{step.performedBy?.name ?? 'Nobody yet'}</span>
                {isApp(step.performedBy) && <span className="text-emerald-700">runs this on its own</span>}
              </p>
              <p className="mt-2 text-[15px] font-semibold leading-snug">{step.title}</p>
              {step.description && <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{step.description}</p>}

              {appsOf(step).filter((a) => a.id !== step.performedBy?.id).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {appsOf(step)
                    .filter((a) => a.id !== step.performedBy?.id)
                    .map((a, i) => (
                      <span
                        key={a.id}
                        className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium transition-all duration-300 ${
                          i < shownApps || reduceMotion ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
                        }`}
                      >
                        <ElementIcon name={a.name} image={a.image} icon={a.icon} typeIcon={a.typeIcon} color={a.color} size={13} /> {a.name}
                      </span>
                    ))}
                </div>
              )}

              {step.checklist.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {step.checklist.map((c, i) => {
                    const done = i < ticked || reduceMotion;
                    return (
                      <li key={c.id} className={`flex items-start gap-2 text-xs transition-colors duration-300 ${done ? 'text-foreground' : 'text-muted-foreground'}`}>
                        <span
                          className={`mt-[1px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-all duration-300 ${
                            done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border'
                          }`}
                        >
                          {done && <Check className="h-2.5 w-2.5" />}
                        </span>
                        {c.text}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {!cur && (
          <button
            type="button"
            onClick={start}
            className="absolute inset-0 z-40 flex cursor-pointer flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-[2px]"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_hsl(var(--primary)/0.4)]">
              <Play className="ml-1 h-7 w-7" />
            </span>
            <span className="text-sm font-medium">Watch {processName} live</span>
          </button>
        )}
      </div>

      {/* The caption, and the choice when it's a decision. */}
      <div className="mt-4 min-h-[56px] text-center">
        <p className="mx-auto max-w-2xl text-[17px] leading-snug">
          {ended
            ? "That's the whole process."
            : step
            ? choosing
              ? step.title
              : captionOf(step)
            : 'Press play to watch the process step by step.'}
        </p>
        {choosing && item && !ended && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {item.outcomes.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  go(o.targetId);
                  setPlaying(true);
                }}
                className="rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                {o.label || outline.byId.get(o.targetId)?.step.title || 'Next'} →
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Controls. */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => (ended || !cur ? start() : setPlaying((p) => !p))}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          {ended ? <RotateCcw className="h-4 w-4" /> : playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <div
          role="slider"
          aria-label="Jump to a step"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={index}
          tabIndex={0}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const n = Math.min(total - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * total)));
            go(items[n].step.id);
          }}
          className="relative h-2 flex-1 cursor-pointer rounded-full bg-muted"
        >
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(index / total) * 100}%` }} />
          {items.map((it, n) => (
            <span
              key={it.step.id}
              className="absolute top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-background/80"
              style={{ left: `${((n + 1) / total) * 100}%` }}
            />
          ))}
        </div>
        <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {index ? `Step ${index} of ${total}` : `${total} steps`}
        </span>
        <button
          type="button"
          onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}
          title="Playback speed"
          className="w-12 shrink-0 rounded-lg border border-border px-2 py-1 text-xs font-medium tabular-nums hover:bg-muted"
        >
          {speed}×
        </button>
      </div>
    </div>
  );
}
