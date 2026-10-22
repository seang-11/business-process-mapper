import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  X, Play, Pause, ChevronLeft, ChevronRight, Check, CornerDownRight, Repeat2,
  ArrowRight, Flag, GitFork, RotateCcw,
} from 'lucide-react';
import { Button } from '@project/components/ui/button';
import type { ElementRef, ProcessConnection, ProcessStep } from '@/types';
import { appsOf, buildScenes, type Scene } from '@/lib/walkthrough';
import ElementIcon from './ElementIcon';

interface Props {
  processName: string;
  steps: ProcessStep[];
  connections: ProcessConnection[];
  onClose: () => void;
}

// How long each scene holds before moving on: enough to read what's on it.
const INTRO_MS = 5500;
const STEP_BASE_MS = 4000;
const PER_CHECK_MS = 700;
const PER_APP_MS = 300;
const DESCRIPTION_MS = 1500;
const FORK_MS = 3500;
const STEP_MIN_MS = 4500;
const STEP_MAX_MS = 15000;
/** Delay between items that animate in one after another. */
const STAGGER_S = 0.5;

function durationOf(scene: Scene): number {
  if (scene.kind === 'intro') return INTRO_MS;
  if (scene.kind === 'outro') return Infinity;
  const { step, forks } = scene;
  const ms =
    STEP_BASE_MS +
    Math.min(step.checklist.length, 8) * PER_CHECK_MS +
    appsOf(step).length * PER_APP_MS +
    (step.description ? DESCRIPTION_MS : 0) +
    (forks.length ? FORK_MS : 0);
  return Math.min(STEP_MAX_MS, Math.max(STEP_MIN_MS, ms));
}

const isApp = (e: ElementRef | null | undefined) => e?.actorClass === 'System';

/**
 * A process played as a short presentation: who's involved, then each step
 * in turn (who, what, with which apps, its checklist, what it produces, and
 * who it goes to next), then a summary. Plays by itself; arrows, space and
 * Esc drive it too.
 */
export default function Walkthrough({ processName, steps, connections, onClose }: Props) {
  const scenes = useMemo(() => buildScenes(steps, connections), [steps, connections]);
  const reduceMotion = useReducedMotion() ?? false;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  const scene = scenes[index];
  const duration = durationOf(scene);
  const last = scenes.length - 1;

  const goTo = useCallback(
    (i: number) => {
      setIndex(Math.max(0, Math.min(last, i)));
      setElapsed(0);
    },
    [last],
  );

  // The clock: runs while playing, moves on when the scene's time is up.
  const tick = useRef<number>();
  useEffect(() => {
    if (!playing || !Number.isFinite(duration)) return;
    let prev = performance.now();
    const frame = (now: number) => {
      setElapsed((e) => e + (now - prev));
      prev = now;
      tick.current = requestAnimationFrame(frame);
    };
    tick.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(tick.current!);
  }, [playing, duration, index]);

  useEffect(() => {
    if (elapsed >= duration && index < last) goTo(index + 1);
  }, [elapsed, duration, index, last, goTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') goTo(index + 1);
      else if (e.key === 'ArrowLeft') goTo(index - 1);
      else if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, goTo, onClose]);

  const label =
    scene.kind === 'intro' ? 'Intro' : scene.kind === 'outro' ? 'Summary' : `Step ${scene.number} of ${scene.total}`;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background" role="dialog" aria-label={`${processName} walkthrough`}>
      <header className="flex items-center justify-between gap-4 px-6 py-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{processName}</p>
          <p className="text-xs text-muted-foreground">Walkthrough</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close walkthrough" title="Close (Esc)">
          <X className="h-5 w-5" />
        </Button>
      </header>

      <main className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            className="w-full max-w-2xl"
            initial={reduceMotion ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
            transition={{ duration: reduceMotion ? 0 : 0.45, ease: 'easeOut' }}
          >
            {scene.kind === 'intro' && <IntroScene processName={processName} steps={steps} still={reduceMotion} />}
            {scene.kind === 'step' && <StepScene scene={scene} still={reduceMotion} />}
            {scene.kind === 'outro' && (
              <OutroScene
                processName={processName}
                scenes={scenes}
                still={reduceMotion}
                onReplay={() => {
                  goTo(0);
                  setPlaying(true);
                }}
                onClose={onClose}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="border-t border-border px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => goTo(index - 1)} aria-label="Previous" title="Previous (←)">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? 'Pause' : 'Play'}
              title={playing ? 'Pause (space)' : 'Play (space)'}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => goTo(index + 1)} aria-label="Next" title="Next (→)">
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* One segment per scene; click any to jump there. */}
          <div className="flex flex-1 items-center gap-1">
            {scenes.map((s, i) => {
              const fill = i < index ? 1 : i > index ? 0 : Number.isFinite(duration) ? Math.min(1, elapsed / duration) : 1;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => goTo(i)}
                  className="group h-4 flex-1 py-1.5"
                  aria-label={s.kind === 'step' ? `Step ${s.number}` : s.kind === 'intro' ? 'Intro' : 'Summary'}
                >
                  <span className="block h-1 overflow-hidden rounded-full bg-muted group-hover:bg-muted-foreground/30">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${fill * 100}%` }} />
                  </span>
                </button>
              );
            })}
          </div>

          <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{label}</span>
        </div>
      </footer>
    </div>
  );
}

// --- Pieces ---

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** A person as a coloured circle with initials; an app as its logo. */
function Avatar({ who, size = 44 }: { who: ElementRef | null; size?: number }) {
  if (who && isApp(who)) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-card"
        style={{ width: size, height: size }}
      >
        <ElementIcon
          name={who.name}
          image={who.image}
          icon={who.icon}
          typeIcon={who.typeIcon}
          color={who.color}
          size={Math.round(size * 0.5)}
        />
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        backgroundColor: who?.color || 'hsl(var(--muted-foreground))',
      }}
    >
      {who ? initials(who.name) : '?'}
    </span>
  );
}

function Chip({ el }: { el: ElementRef }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium shadow-sm">
      <ElementIcon name={el.name} image={el.image} icon={el.icon} typeIcon={el.typeIcon} color={el.color} size={16} />
      {el.name}
    </span>
  );
}

/** Fades and lifts in after a delay; holds still when motion is reduced. */
function Reveal({ delay, still, children, className }: {
  delay: number; still: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={still ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: still ? 0 : delay, duration: still ? 0 : 0.4, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

// --- Scenes ---

function IntroScene({ processName, steps, still }: { processName: string; steps: ProcessStep[]; still: boolean }) {
  const { people, apps } = useMemo(() => {
    const people = new Map<string, ElementRef>();
    const apps = new Map<string, ElementRef>();
    for (const s of steps) {
      if (s.performedBy && !isApp(s.performedBy)) people.set(s.performedBy.id, s.performedBy);
      for (const a of appsOf(s)) apps.set(a.id, a);
    }
    return { people: [...people.values()], apps: [...apps.values()] };
  }, [steps]);

  return (
    <div>
      <Reveal delay={0} still={still}>
        <p className="text-sm font-medium text-primary">How it works</p>
        <h1 className="mt-2 text-5xl font-semibold tracking-tight">{processName}</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          {steps.length} steps · {people.length} {people.length === 1 ? 'person' : 'people'} · {apps.length}{' '}
          {apps.length === 1 ? 'app' : 'apps'}
        </p>
      </Reveal>

      {people.length > 0 && (
        <div className="mt-10">
          <Reveal delay={0.5} still={still}>
            <SectionLabel>Who's involved</SectionLabel>
          </Reveal>
          <div className="flex flex-wrap gap-x-6 gap-y-4">
            {people.map((p, i) => (
              <Reveal key={p.id} delay={0.7 + i * 0.15} still={still} className="flex items-center gap-3">
                <Avatar who={p} size={40} />
                <div>
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.typeName}
                    {p.party === 'External' ? ' · external' : ''}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      )}

      {apps.length > 0 && (
        <div className="mt-8">
          <Reveal delay={0.9 + people.length * 0.15} still={still}>
            <SectionLabel>Apps</SectionLabel>
          </Reveal>
          <div className="flex flex-wrap gap-2">
            {apps.map((a, i) => (
              <Reveal key={a.id} delay={1.1 + people.length * 0.15 + i * 0.08} still={still}>
                <Chip el={a} />
              </Reveal>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StepScene({ scene, still }: { scene: Extract<Scene, { kind: 'step' }>; still: boolean }) {
  const { step, handoffTo, forks, loopBack } = scene;
  const performer = step.performedBy;
  const apps = appsOf(step).filter((a) => a.id !== performer?.id);
  const others = step.uses.filter((u) => !isApp(u));
  const line = step.walkthroughLine.trim() || step.title;

  // Each block waits for the ones above it, so the scene builds top to bottom.
  let t = 0.3;
  const next = (gap = STAGGER_S) => (t += gap);
  const at = { who: t, line: next(0.35), desc: next(0.4) };
  const appsAt = next(step.description ? STAGGER_S : 0.1);
  const checksAt = next(apps.length || others.length ? STAGGER_S + 0.2 : 0);
  const afterChecks = checksAt + step.checklist.length * STAGGER_S;
  const producesAt = afterChecks + 0.2;
  const forksAt = producesAt + (step.produces.length ? STAGGER_S : 0);
  const handoffAt = forksAt + (forks.length ? forks.length * 0.3 + STAGGER_S : 0.2);

  const samePerson = handoffTo && handoffTo.performedBy?.id === performer?.id;

  return (
    <div>
      <Reveal delay={at.who} still={still} className="flex items-center gap-3">
        <Avatar who={performer} />
        <div>
          <p className="text-lg font-semibold leading-tight">{performer?.name || 'Unassigned'}</p>
          <p className="text-sm text-muted-foreground">
            {isApp(performer) ? 'Runs automatically' : performer?.typeName}
            {performer?.party === 'External' ? ' · external' : ''}
            {step.stepType && step.stepType !== 'Task' ? ` · ${step.stepType}` : ''}
          </p>
        </div>
      </Reveal>

      <Reveal delay={at.line} still={still}>
        <h2 className="mt-6 text-4xl font-semibold leading-tight tracking-tight">{line}</h2>
      </Reveal>

      {step.description && (
        <Reveal delay={at.desc} still={still}>
          <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{step.description}</p>
        </Reveal>
      )}

      {(apps.length > 0 || others.length > 0) && (
        <Reveal delay={appsAt} still={still} className="mt-6 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-muted-foreground">{apps.length ? 'Using' : 'With'}</span>
          {[...apps, ...others].map((el, i) => (
            <Reveal key={el.id} delay={appsAt + 0.1 + i * 0.12} still={still}>
              <Chip el={el} />
            </Reveal>
          ))}
        </Reveal>
      )}

      {step.checklist.length > 0 && (
        <div className="mt-8">
          <Reveal delay={checksAt - 0.2} still={still}>
            <SectionLabel>Checklist</SectionLabel>
          </Reveal>
          <ul className="space-y-2.5">
            {step.checklist.map((item, i) => (
              <Reveal key={item.id} delay={checksAt + i * STAGGER_S} still={still} className="flex items-start gap-3">
                <motion.span
                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2"
                  initial={still ? false : { borderColor: 'hsl(var(--border))', backgroundColor: 'transparent' }}
                  animate={{ borderColor: 'hsl(var(--primary))', backgroundColor: 'hsl(var(--primary))' }}
                  transition={{ delay: still ? 0 : checksAt + i * STAGGER_S + 0.3, duration: still ? 0 : 0.2 }}
                >
                  <motion.span
                    initial={still ? false : { scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: still ? 0 : checksAt + i * STAGGER_S + 0.35, type: 'spring', stiffness: 500 }}
                  >
                    <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />
                  </motion.span>
                </motion.span>
                <span className="text-base">{item.text}</span>
              </Reveal>
            ))}
          </ul>
        </div>
      )}

      {step.produces.length > 0 && (
        <Reveal delay={producesAt} still={still} className="mt-8 flex flex-wrap items-center gap-2">
          <span className="mr-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CornerDownRight className="h-4 w-4" /> Produces
          </span>
          {step.produces.map((p) => (
            <Chip key={p.id} el={p} />
          ))}
        </Reveal>
      )}

      {forks.length > 0 && (
        <div className="mt-8">
          <Reveal delay={forksAt} still={still}>
            <SectionLabel>
              <span className="inline-flex items-center gap-1.5">
                <GitFork className="h-3.5 w-3.5" /> Possible outcomes
              </span>
            </SectionLabel>
          </Reveal>
          <div className="grid gap-2 sm:grid-cols-2">
            {forks.map((f, i) => (
              <Reveal
                key={f.key}
                delay={forksAt + 0.2 + i * 0.3}
                still={still}
                className={`rounded-xl border p-4 ${f.main ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
              >
                <p className="text-sm font-semibold">{f.label || 'Otherwise'}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                  <span>{f.targetTitle}</span>
                </p>
                {f.repeats && (
                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-primary">
                    <Repeat2 className="h-3.5 w-3.5" /> Can repeat
                  </p>
                )}
                {f.main && <p className="mt-2 text-xs font-medium text-primary">Continuing with this</p>}
              </Reveal>
            ))}
          </div>
        </div>
      )}

      {loopBack && (
        <Reveal delay={forksAt} still={still} className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1.5 text-sm text-primary">
          <Repeat2 className="h-4 w-4" />
          {loopBack.label ? `${loopBack.label}: ` : 'Can go back to '}
          {loopBack.title}
        </Reveal>
      )}

      <Reveal delay={handoffAt} still={still} className="mt-10 border-t border-border pt-5">
        {handoffTo ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{samePerson ? 'Then' : 'Hands off to'}</span>
            {!samePerson && (
              <span className="inline-flex items-center gap-2 font-semibold">
                <Avatar who={handoffTo.performedBy} size={28} />
                {handoffTo.performedBy?.name || 'Unassigned'}
              </span>
            )}
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{handoffTo.walkthroughLine.trim() || handoffTo.title}</span>
            </span>
          </div>
        ) : (
          <p className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Flag className="h-4 w-4" /> This is where the process ends.
          </p>
        )}
      </Reveal>
    </div>
  );
}

function OutroScene({ processName, scenes, still, onReplay, onClose }: {
  processName: string;
  scenes: Scene[];
  still: boolean;
  onReplay: () => void;
  onClose: () => void;
}) {
  const played = scenes.flatMap((s) => (s.kind === 'step' ? [s] : []));

  const { byPerson, apps, handoffs } = useMemo(() => {
    const counts = new Map<string, { who: ElementRef | null; name: string; count: number }>();
    const apps = new Map<string, ElementRef>();
    let handoffs = 0;
    for (const s of played) {
      const who = s.step.performedBy;
      const key = who?.id ?? 'none';
      const entry = counts.get(key) ?? { who, name: who?.name || 'Unassigned', count: 0 };
      entry.count += 1;
      counts.set(key, entry);
      for (const a of appsOf(s.step)) apps.set(a.id, a);
      if (s.handoffTo && s.handoffTo.performedBy?.id !== who?.id) handoffs += 1;
    }
    return {
      byPerson: [...counts.values()].sort((a, b) => b.count - a.count),
      apps: [...apps.values()],
      handoffs,
    };
  }, [played]);
  const most = byPerson[0]?.count ?? 1;

  return (
    <div>
      <Reveal delay={0} still={still}>
        <p className="text-sm font-medium text-primary">That's the process</p>
        <h2 className="mt-2 text-4xl font-semibold tracking-tight">{processName}</h2>
      </Reveal>

      {/* The whole path in one line, each step in its owner's colour. */}
      <div className="mt-8 flex flex-wrap items-center gap-1.5">
        {played.map((s, i) => (
          <Reveal key={s.step.id} delay={0.3 + i * 0.05} still={still} className="flex items-center gap-1.5">
            <span
              title={`${s.number}. ${s.step.title} · ${s.step.performedBy?.name ?? 'Unassigned'}`}
              className="inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold text-white"
              style={{ backgroundColor: s.step.performedBy?.color || 'hsl(var(--muted-foreground))' }}
            >
              {s.number}
            </span>
            {i < played.length - 1 && <span className="h-px w-3 bg-border" />}
          </Reveal>
        ))}
      </div>

      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        <Reveal delay={0.6} still={still}>
          <SectionLabel>Steps by person</SectionLabel>
          <ul className="space-y-2.5">
            {byPerson.map((p) => (
              <li key={p.name} className="flex items-center gap-3">
                <Avatar who={p.who} size={24} />
                <span className="w-36 truncate text-sm">{p.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <motion.span
                    className="block h-full rounded-full bg-primary"
                    initial={still ? false : { width: 0 }}
                    animate={{ width: `${(p.count / most) * 100}%` }}
                    transition={{ delay: still ? 0 : 0.9, duration: still ? 0 : 0.6, ease: 'easeOut' }}
                  />
                </span>
                <span className="w-5 text-right text-sm tabular-nums text-muted-foreground">{p.count}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.8} still={still}>
          <SectionLabel>At a glance</SectionLabel>
          <p className="text-3xl font-semibold tabular-nums">{handoffs}</p>
          <p className="text-sm text-muted-foreground">handoffs between people and apps</p>
          {apps.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {apps.map((a) => (
                <span key={a.id} title={a.name} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card">
                  <ElementIcon name={a.name} image={a.image} icon={a.icon} typeIcon={a.typeIcon} color={a.color} size={18} />
                </span>
              ))}
            </div>
          )}
        </Reveal>
      </div>

      <Reveal delay={1.1} still={still} className="mt-10 flex flex-wrap gap-2">
        <Button variant="outline" onClick={onReplay}>
          <RotateCcw className="mr-2 h-4 w-4" /> Watch again
        </Button>
        <Button onClick={onClose}>Back to the map</Button>
      </Reveal>
    </div>
  );
}
