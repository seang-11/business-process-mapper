import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { X, Play, Pause, ChevronLeft, ChevronRight, RotateCcw, Zap } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import type { ProcessConnection, ProcessStep } from '@/types';
import { AUTOMATED_LANE } from './SwimlaneDiagram';
import { appsOf, buildWalkthroughMap, type MapCard } from '@/lib/walkthrough';
import ElementIcon from './ElementIcon';

interface Props {
  processName: string;
  versionName: string;
  steps: ProcessStep[];
  connections: ProcessConnection[];
  onClose: () => void;
}

// The stage, in its own units; the SVG scales it to fit the screen.
const LABEL_W = 200;
const PAD = 28;
const CARD_W = 210;
const COL_W = 260;
const CARD_H = 96;
const LANE_H = 128;
/** Room above the first lane for a loop box's label. */
const TOP_PAD = 36;

// A section holds long enough to take in what's on it.
const SECTION_BASE_MS = 3500;
const PER_STEP_MS = 900;
const SECTION_MAX_MS = 9000;
const CAMERA_S = 0.9;

const colX = (c: number) => LABEL_W + PAD + c * COL_W;
const laneY = (l: number) => TOP_PAD + l * LANE_H;

/**
 * A process played as a short tour of its own map: the map simplified, cut
 * into a few sections, with the camera gliding from one to the next. The
 * section in view is bright and labelled; the rest stays faintly visible so
 * you never lose your place. Arrows, space and Esc drive it too.
 */
export default function Walkthrough({ processName, versionName, steps, connections, onClose }: Props) {
  const map = useMemo(() => buildWalkthroughMap(steps, connections), [steps, connections]);
  const reduceMotion = useReducedMotion() ?? false;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  const sections = map.sections;
  const last = sections.length - 1;
  const section = sections[index];
  const duration = section
    ? Math.min(SECTION_MAX_MS, SECTION_BASE_MS + section.stepIds.size * PER_STEP_MS)
    : SECTION_BASE_MS;
  const finished = index === last && elapsed >= duration;

  const goTo = useCallback(
    (i: number) => {
      setIndex(Math.max(0, Math.min(last, i)));
      setElapsed(0);
    },
    [last],
  );

  // The clock: runs while playing; moves on when the section's time is up and
  // stops at the end rather than looping.
  const raf = useRef<number>();
  useEffect(() => {
    if (!playing || finished) return;
    let prev = performance.now();
    const frame = (now: number) => {
      setElapsed((e) => e + (now - prev));
      prev = now;
      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf.current!);
  }, [playing, finished, index]);

  useEffect(() => {
    if (elapsed < duration) return;
    if (index < last) goTo(index + 1);
    else setPlaying(false);
  }, [elapsed, duration, index, last, goTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') goTo(index + 1);
      else if (e.key === 'ArrowLeft') goTo(index - 1);
      else if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, goTo, onClose]);

  const replay = () => {
    goTo(0);
    setPlaying(true);
  };

  if (!section) {
    return (
      <Shell processName={processName} versionName={versionName} onClose={onClose}>
        <p className="text-muted-foreground">This version has no steps yet.</p>
      </Shell>
    );
  }

  const viewW = LABEL_W + PAD * 2 + map.maxSectionCols * COL_W - (COL_W - CARD_W);
  const viewH = TOP_PAD + map.lanes.length * LANE_H;
  const camX = section.colStart * COL_W;
  const cardById = new Map(map.cards.map((c) => [c.step.id, c]));
  const activeLanes = new Set(map.cards.filter((c) => section.stepIds.has(c.step.id)).map((c) => c.lane));
  // Steps in this section, in order, for staggering their entrance.
  const order = new Map(
    map.cards.filter((c) => section.stepIds.has(c.step.id)).map((c, i) => [c.step.id, i]),
  );
  const fade = (on: boolean, delay = 0): React.CSSProperties => ({
    opacity: on ? 1 : 0.14,
    transition: reduceMotion ? 'none' : `opacity 0.6s ease ${on ? delay : 0}s`,
  });

  return (
    <Shell processName={processName} versionName={versionName} onClose={onClose}>
      <div className="flex h-full w-full flex-col">
        <div className="mb-4 flex items-baseline gap-3">
          <span className="text-sm font-semibold text-primary tabular-nums">
            Part {index + 1} of {sections.length}
          </span>
          <span className="truncate text-sm text-muted-foreground">{section.label}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-muted/40">
          <svg
            viewBox={`0 0 ${viewW} ${viewH}`}
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full"
            role="img"
            aria-label={`${processName}, part ${index + 1}: ${section.label}`}
          >
            <defs>
              <marker id="wt-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto" markerUnits="userSpaceOnUse">
                <path d="M 2 1.5 L 8 5 L 2 8.5" fill="none" stroke="hsl(var(--muted-foreground) / 0.6)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              </marker>
            </defs>

            {/* Lane bands span the whole process so the camera never runs off them. */}
            {map.lanes.map((lane, i) => (
              <rect
                key={lane}
                x={0}
                y={laneY(i)}
                width={viewW}
                height={LANE_H}
                fill={i % 2 ? 'hsl(var(--foreground) / 0.025)' : 'transparent'}
              />
            ))}

            <g
              style={{
                transform: `translateX(${-camX}px)`,
                transition: reduceMotion ? 'none' : `transform ${CAMERA_S}s cubic-bezier(0.4, 0, 0.2, 1)`,
              }}
            >
              {map.loops.map((loop) => {
                const members = loop.stepIds.map((id) => cardById.get(id)).filter(Boolean) as MapCard[];
                if (members.length < 2) return null;
                const x0 = Math.min(...members.map((m) => colX(m.col))) - 14;
                const x1 = Math.max(...members.map((m) => colX(m.col) + CARD_W)) + 14;
                const y0 = Math.min(...members.map((m) => cardTop(m))) - 30;
                const y1 = Math.max(...members.map((m) => cardTop(m) + CARD_H)) + 14;
                const on = members.some((m) => section.stepIds.has(m.step.id));
                return (
                  <g key={loop.id} style={fade(on)}>
                    <rect
                      x={x0}
                      y={y0}
                      width={x1 - x0}
                      height={y1 - y0}
                      rx={14}
                      fill="hsl(var(--primary) / 0.04)"
                      stroke="hsl(var(--primary) / 0.35)"
                      strokeWidth={2}
                      strokeDasharray="8 5"
                    />
                    <text x={x0 + 14} y={y0 + 19} fontSize={12} fontWeight={600} fill="hsl(var(--primary) / 0.8)">
                      {loop.name}
                    </text>
                  </g>
                );
              })}

              {map.connections.map((c) => {
                const a = cardById.get(c.fromStepId);
                const b = cardById.get(c.toStepId);
                if (!a || !b) return null;
                const x1 = colX(a.col) + CARD_W;
                const y1 = cardTop(a) + CARD_H / 2;
                const x2 = colX(b.col);
                const y2 = cardTop(b) + CARD_H / 2;
                const k = Math.max(40, Math.abs(x2 - x1) / 2);
                const on = section.stepIds.has(a.step.id) || section.stepIds.has(b.step.id);
                return (
                  <g key={c.id || `${c.fromStepId}->${c.toStepId}`} style={fade(on)}>
                    <path
                      d={`M ${x1} ${y1} C ${x1 + k} ${y1}, ${x2 - k} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke="hsl(var(--muted-foreground) / 0.5)"
                      strokeWidth={1.6}
                      markerEnd="url(#wt-arrow)"
                    />
                    {c.label && (
                      <foreignObject x={(x1 + x2) / 2 - 80} y={(y1 + y2) / 2 - 13} width={160} height={26}>
                        <div className="flex h-full items-center justify-center">
                          <span className="truncate rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {c.label}
                          </span>
                        </div>
                      </foreignObject>
                    )}
                  </g>
                );
              })}

              {map.cards.map((card) => {
                const on = section.stepIds.has(card.step.id);
                return (
                  <foreignObject
                    key={card.step.id}
                    x={colX(card.col)}
                    y={cardTop(card)}
                    width={CARD_W}
                    height={CARD_H}
                    style={fade(on, 0.25 + (order.get(card.step.id) ?? 0) * 0.15)}
                  >
                    <StepCard card={card} />
                  </foreignObject>
                );
              })}
            </g>

            {/* Lane names stay put while the map moves under them. */}
            <rect x={0} y={0} width={LABEL_W} height={viewH} fill="hsl(var(--card))" />
            <line x1={LABEL_W} y1={0} x2={LABEL_W} y2={viewH} stroke="hsl(var(--border))" />
            {map.lanes.map((lane, i) => (
              <g key={lane} style={fade(activeLanes.has(i))}>
                <foreignObject x={0} y={laneY(i)} width={LABEL_W} height={LANE_H}>
                  <div className="flex h-full items-center gap-2 px-5">
                    {lane === AUTOMATED_LANE && <Zap className="h-4 w-4 shrink-0 text-emerald-600" />}
                    <span className="truncate text-[15px] font-semibold">{lane}</span>
                  </div>
                </foreignObject>
              </g>
            ))}
          </svg>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => goTo(index - 1)} aria-label="Previous" title="Previous (←)">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            {finished ? (
              <Button size="icon" className="h-10 w-10 rounded-full" onClick={replay} aria-label="Watch again" title="Watch again">
                <RotateCcw className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? 'Pause' : 'Play'}
                title={playing ? 'Pause (space)' : 'Play (space)'}
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => goTo(index + 1)} aria-label="Next" title="Next (→)">
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex flex-1 items-center gap-1.5">
            {sections.map((s, i) => {
              const fill = i < index ? 1 : i > index ? 0 : Math.min(1, elapsed / duration);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => goTo(i)}
                  className="group h-4 flex-1 py-1.5"
                  aria-label={`Part ${i + 1}: ${s.label}`}
                  title={s.label}
                >
                  <span className="block h-1 overflow-hidden rounded-full bg-muted group-hover:bg-muted-foreground/30">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${fill * 100}%` }} />
                  </span>
                </button>
              );
            })}
          </div>

          {finished && (
            <Button size="sm" onClick={onClose}>
              Back to the map
            </Button>
          )}
        </div>
      </div>
    </Shell>
  );
}

/** Cards sit vertically centred in their lane. */
function cardTop(card: MapCard) {
  return laneY(card.lane) + (LANE_H - CARD_H) / 2;
}

function Shell({ processName, versionName, onClose, children }: {
  processName: string;
  versionName: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background" role="dialog" aria-label={`${processName} walkthrough`}>
      <header className="flex items-center justify-between gap-4 px-6 py-4">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{processName}</p>
          <p className="truncate text-xs text-muted-foreground">Walkthrough · {versionName}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close walkthrough" title="Close (Esc)">
          <X className="h-5 w-5" />
        </Button>
      </header>
      <main className="flex min-h-0 flex-1 px-6 pb-6">{children}</main>
    </div>
  );
}

/** A step as the tour shows it: who, what, and with which apps. */
function StepCard({ card }: { card: MapCard }) {
  const { step, automated } = card;
  const apps = appsOf(step).filter((a) => a.id !== step.performedBy?.id);
  const color = step.performedBy?.color;
  return (
    <div
      className={`flex h-full flex-col rounded-xl border bg-card px-3.5 py-3 shadow-sm ${
        automated ? 'border-emerald-500/60' : 'border-border'
      }`}
    >
      {automated ? (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          <Zap className="h-3 w-3" /> Automated · {step.performedBy?.name}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={color ? { color } : undefined}>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color || 'hsl(var(--muted-foreground))' }} />
          <span className="truncate">{step.performedBy?.name || 'Unassigned'}</span>
        </span>
      )}
      <p className="mt-1.5 line-clamp-2 text-[14px] font-semibold leading-snug">
        {step.walkthroughLine.trim() || step.title}
      </p>
      {apps.length > 0 && (
        <div className="mt-auto flex min-w-0 items-center gap-2 pt-1.5">
          {apps.slice(0, 3).map((a) => (
            <span key={a.id} className="inline-flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
              <ElementIcon name={a.name} image={a.image} icon={a.icon} typeIcon={a.typeIcon} color={a.color} size={13} />
              <span className="truncate">{a.name}</span>
            </span>
          ))}
          {apps.length > 3 && <span className="text-[11px] text-muted-foreground">+{apps.length - 3}</span>}
        </div>
      )}
    </div>
  );
}
