import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X, ArrowLeft, ArrowRight, GraduationCap, Link2, Zap, CornerDownRight, ExternalLink, Check, Users,
  Compass, Flag, Hourglass, GitFork, Workflow,
} from 'lucide-react';
import { toast } from 'sonner';
import { getProcessGraph } from 'zitejs/api';
import { format } from 'date-fns';
import { Button } from '@project/components/ui/button';
import { Skeleton } from '@project/components/ui/skeleton';
import type { ElementRef, ProcessConnection, ProcessStep } from '@/types';
import { buildOutline } from '@/lib/walkthrough';
import {
  AUTOMATED_ROLE, UNASSIGNED_ROLE, buildLesson, buildStory, roleKeyOf, rolesOf,
  type Lesson, type LessonStep, type RoleOption, type Stage,
} from '@/lib/training';
import ElementIcon from './ElementIcon';

export interface TrainVersion {
  id: string;
  name: string;
  /** Current is the live way of working; Future is being prepared; Archived is retired. */
  state: string;
  liveFrom: string;
  liveTo: string;
}

type TrainView = 'process' | 'lesson' | 'brief';

interface Props {
  processName: string;
  /** What the process is for, in the team's own words. A sentence is written from the map if empty. */
  processDescription: string;
  versions: TrainVersion[];
  /** Which version to train on first. The live one, unless a link says otherwise. */
  initialVersionId: string;
  /** A role to open straight to, from a shared link. */
  initialRole: string | null;
  initialView: TrainView;
  onClose: () => void;
  /** Close Train and show this step on the map. */
  onOpenStep: (step: ProcessStep, versionId: string) => void;
}

const EMPTY_STEPS: ProcessStep[] = [];
const EMPTY_CONNECTIONS: ProcessConnection[] = [];

const prettyDay = (value: string) => {
  const d = value ? new Date(`${value}T00:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? format(d, 'MMM d, yyyy') : '';
};

const STATE_LABEL: Record<string, string> = { Current: 'Live', Future: 'Not live yet', Archived: 'Retired' };

const STAGES = ['Big picture', 'Your role', 'Your steps'];

/** When a version applies, in words: "Live since Sep 2, 2026", "Not live yet", "Sep 2 to Oct 22, 2026". */
function whenText(v: TrainVersion): string {
  const from = prettyDay(v.liveFrom);
  const to = prettyDay(v.liveTo);
  if (v.state === 'Current') return from ? `Live since ${from}` : 'Live now';
  if (v.state === 'Future') return 'Not live yet';
  if (from && to) return `Was live ${from} to ${to}`;
  if (to) return `Was live until ${to}`;
  if (from) return `Was live from ${from}`;
  return 'Retired';
}

// Soft tints for role avatars, picked from the name so a role keeps its colour.
const TINTS = [
  { fg: 'hsl(217 65% 42%)', bg: 'hsl(217 90% 95%)' },
  { fg: 'hsl(262 55% 48%)', bg: 'hsl(262 80% 96%)' },
  { fg: 'hsl(152 55% 32%)', bg: 'hsl(152 60% 94%)' },
  { fg: 'hsl(24 80% 42%)', bg: 'hsl(24 95% 94%)' },
  { fg: 'hsl(336 65% 46%)', bg: 'hsl(336 85% 96%)' },
  { fg: 'hsl(188 70% 30%)', bg: 'hsl(188 65% 93%)' },
];
const tintFor = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
};
/** One colour per role everywhere in Train, so the bar, the story and the cards agree. */
const roleColor = (key: string, name: string) =>
  key === AUTOMATED_ROLE ? 'hsl(152 55% 38%)' : key === UNASSIGNED_ROLE ? 'hsl(220 9% 60%)' : tintFor(name).fg;

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

const SEG_TRACK = 'flex shrink-0 rounded-lg bg-muted p-0.5 text-xs';
const segBtn = (active: boolean) =>
  `rounded-md px-3 py-1 font-medium transition-all ${
    active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
  }`;
const CARD = 'rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]';

function RoleAvatar({ role, size = 36 }: { role: RoleOption; size?: number }) {
  const tint = tintFor(role.name);
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold"
      style={{
        width: size,
        height: size,
        backgroundColor: role.automated ? 'hsl(var(--muted))' : tint.bg,
        color: role.automated ? 'hsl(var(--muted-foreground))' : tint.fg,
      }}
    >
      {role.automated ? <Zap className="h-4 w-4" /> : initials(role.name)}
    </span>
  );
}

function AppChip({ app }: { app: ElementRef }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium">
      <ElementIcon name={app.name} image={app.image} icon={app.icon} typeIcon={app.typeIcon} color={app.color} size={14} />
      {app.name}
    </span>
  );
}

/**
 * Training for a role: pick who you are, then learn exactly what you do in this
 * process, one step at a time, with the whole process always in view. All of it
 * is read straight from the map.
 */
export default function Train({
  processName, processDescription, versions, initialVersionId, initialRole, initialView, onClose, onOpenStep,
}: Props) {
  // Training teaches the live version, always. Only if nothing is live yet does it fall back.
  const [versionId] = useState(
    () => versions.find((v) => v.state === 'Current')?.id ?? initialVersionId,
  );
  const [graph, setGraph] = useState<{ steps: ProcessStep[]; connections: ProcessConnection[] } | null>(null);
  const version = versions.find((v) => v.id === versionId) ?? versions[0];

  // Each version is read on its own, so what you learn is exactly what that version says.
  useEffect(() => {
    let cancelled = false;
    setGraph(null);
    getProcessGraph({ versionId })
      .then((res) => {
        if (!cancelled) setGraph({ steps: res.steps as ProcessStep[], connections: res.connections });
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Could not load that version.');
      });
    return () => {
      cancelled = true;
    };
  }, [versionId]);

  const steps = graph?.steps ?? EMPTY_STEPS;
  const connections = graph?.connections ?? EMPTY_CONNECTIONS;

  const outline = useMemo(() => buildOutline(steps, connections), [steps, connections]);
  const roles = useMemo(() => rolesOf(outline), [outline]);
  // Training is for people, so the automatic part and unassigned steps are never offered as a role.
  const learnableRoles = useMemo(() => roles.filter((r) => !r.automated && r.key !== UNASSIGNED_ROLE), [roles]);

  // Checked against the roles once the version has loaded; an unknown one just shows the picker.
  const [roleKey, setRoleKey] = useState<string | null>(initialRole);
  // Old links may still ask for the handover brief, which is gone; they land on the lesson.
  const [view, setView] = useState<TrainView>(initialView === 'brief' ? 'lesson' : initialView);
  /** -1 is the introduction; steps follow; one past the last is the wrap-up. */
  const [idx, setIdx] = useState(-1);
  /** The whole process, in a panel that can be opened from any lesson screen. */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const story = useMemo(() => buildStory(outline), [outline]);

  const role = learnableRoles.find((r) => r.key === roleKey) ?? null;
  const lesson = useMemo(
    () => (role ? buildLesson(role, outline, connections) : null),
    [role, outline, connections],
  );
  const n = lesson?.steps.length ?? 0;

  const pickRole = (key: string | null) => {
    setRoleKey(key);
    setIdx(-1);
  };

  // Where the learner is: 0 big picture, 1 pick a role, 2 their steps.
  const stage = view === 'process' ? 0 : !role ? 1 : 2;
  const progress = stage === 0 ? 10 : stage === 1 ? 33 : 40 + 60 * Math.min(1, (idx + 1) / (n + 1));
  const goStage = (i: number) => {
    if (i === 0) setView('process');
    else if (i === 1) {
      pickRole(null);
      setView('lesson');
    } else setView('lesson');
  };

  const next = useCallback(() => setIdx((i) => Math.min(n, i + 1)), [n]);
  const back = useCallback(() => setIdx((i) => Math.max(-1, i - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // The panel closes first, then the training.
        if (drawerOpen) setDrawerOpen(false);
        else onClose();
      } else if (role && view === 'lesson' && e.key === 'ArrowRight') next();
      else if (role && view === 'lesson' && e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [role, view, next, back, onClose, drawerOpen]);

  const copyLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('lane');
    url.searchParams.delete('by');
    url.searchParams.set('train', role?.key ?? 'all');
    url.searchParams.set('view', view);
    // So the link teaches the same version it was copied from.
    url.searchParams.set('version', versionId);
    navigator.clipboard.writeText(url.toString()).then(
      () => toast.success('Link copied'),
      () => toast.error('Could not copy the link'),
    );
  };

  return (
    <div
      className="train-shell fixed inset-0 z-50 flex flex-col bg-[hsl(220_20%_98.5%)]"
      role="dialog"
      aria-label={`Train on ${processName}`}
    >
      <header className="train-noprint relative flex h-16 shrink-0 items-center gap-4 border-b border-border bg-background/80 px-8 backdrop-blur">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-[-1px] h-0.5 bg-transparent"
        >
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_2px_8px_hsl(var(--primary)/0.35)]">
          <GraduationCap className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Training</p>
          <div className="flex items-center gap-2">
            <p className="truncate text-lg font-semibold leading-tight tracking-tight">{processName}</p>
            {version && (
              <span
                title={whenText(version)}
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  version.state === 'Current'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : version.state === 'Future'
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {STATE_LABEL[version.state] ?? version.state}
              </span>
            )}
          </div>
        </div>

        <nav aria-label="Training progress" className="mx-auto hidden min-w-0 items-center md:flex">
          {STAGES.map((label, i) => {
            const done = i < stage;
            const here = i === stage;
            const locked = i >= 2 && !role;
            return (
              <div key={label} className="flex items-center">
                {i > 0 && (
                  <span className={`mx-2 h-px w-6 lg:w-10 ${i <= stage ? 'bg-primary' : 'bg-border'}`} />
                )}
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => goStage(i)}
                  className="flex items-center gap-2 disabled:cursor-default"
                  aria-current={here ? 'step' : undefined}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                      done
                        ? 'bg-primary text-primary-foreground'
                        : here
                        ? 'bg-primary/10 text-primary ring-2 ring-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span
                    className={`hidden text-sm lg:inline ${
                      here ? 'font-semibold text-foreground' : done ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {label}
                  </span>
                </button>
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={copyLink}>
            <Link2 className="mr-1.5 h-3.5 w-3.5" /> Copy link
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close training" title="Close (Esc)">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {role && view !== 'process' && (
        <div className="train-noprint flex items-center gap-2 overflow-x-auto px-8 pt-3">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Your role</span>
          {learnableRoles.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => pickRole(r.key)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                r.key === role.key
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {r.name}
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7 shrink-0 text-xs"
            onClick={() => setDrawerOpen(true)}
          >
            <Compass className="mr-1.5 h-3.5 w-3.5" /> See the whole process
          </Button>
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto">
        {!graph ? (
          <div className="mx-auto max-w-3xl space-y-3 px-6 py-14">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : steps.length === 0 ? (
          <p className="mx-auto max-w-3xl px-6 py-14 text-sm text-muted-foreground">
            This version has no steps yet, so there is nothing to teach. Pick another version above.
          </p>
        ) : view === 'process' ? (
          <ProcessOverview
            processName={processName}
            description={processDescription}
            outline={outline}
            roles={roles}
            story={story}
            roleKey={role?.key ?? null}
            onNext={() => {
              setView('lesson');
              setIdx(-1);
            }}
            nextLabel={role ? `Next: your part as ${role.name}` : 'Next: find your role'}
          />
        ) : !role || !lesson ? (
          <RolePicker roles={learnableRoles} processName={processName} onPick={pickRole} onBigPicture={() => setView('process')} />
        ) : (
          <div className="mx-auto max-w-3xl px-6 pb-16 pt-6">
            <ProcessStrip
              outline={outline}
              lesson={lesson}
              currentId={idx >= 0 && idx < n ? lesson.steps[idx].item.step.id : null}
              onPick={(stepId) => {
                const at = lesson.steps.findIndex((s) => s.item.step.id === stepId);
                if (at >= 0) setIdx(at);
              }}
            />

            <div className="mt-6">
              {idx === -1 ? (
                <Intro lesson={lesson} processName={processName} onStart={next} />
              ) : idx >= n ? (
                <WrapUp
                  role={role}
                  onFinish={onClose}
                  onOther={() => pickRole(null)}
                  onRestart={() => setIdx(-1)}
                />
              ) : (
                <StepLesson
                  lesson={lesson}
                  step={lesson.steps[idx]}
                  index={idx}
                  onOpen={() => onOpenStep(lesson.steps[idx].item.step, versionId)}
                />
              )}
            </div>

            {idx !== -1 && (
              <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
                <Button variant="ghost" onClick={back}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                {idx < n && (
                  <Button onClick={next}>
                    {idx === n - 1 ? 'Finish' : 'Next step'} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {drawerOpen && (
        <div className="train-noprint fixed inset-0 z-[60] flex justify-end">
          <button
            type="button"
            aria-label="Close the whole-process panel"
            className="flex-1 cursor-default bg-black/20"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="flex h-full w-full max-w-[440px] flex-col border-l border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <p className="text-sm font-semibold">The whole process</p>
                <p className="text-xs text-muted-foreground">
                  {role ? `${role.name} is highlighted.` : 'Who has the work, from start to finish.'}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <ProcessStory story={story} roleKey={role?.key ?? null} compact />
            </div>
            <div className="border-t border-border px-5 py-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setDrawerOpen(false);
                  setView('process');
                }}
              >
                Open the big picture
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

// --- The big picture ---

/** A small key: which color is which role. */
function RoleLegend({ items, mineKey }: { items: ProcessStep[]; mineKey: string | null }) {
  const seen = new Map<string, string>();
  for (const s of items) {
    const key = roleKeyOf(s);
    if (!seen.has(key)) {
      seen.set(
        key,
        key === AUTOMATED_ROLE ? 'Happens automatically' : key === UNASSIGNED_ROLE ? 'Nobody yet' : s.performedBy!.name,
      );
    }
  }
  return (
    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
      {[...seen.entries()].map(([key, name]) => (
        <span key={key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: roleColor(key, name) }} />
          <span className={key === mineKey ? 'font-semibold text-foreground' : ''}>
            {name}
            {key === mineKey ? ' (you)' : ''}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * The whole process told as a short story: who has the work, what they do, and
 * where it goes next. Plain words only. The picked role's stages are marked.
 */
function ProcessStory({ story, roleKey, compact }: { story: Stage[]; roleKey: string | null; compact?: boolean }) {
  return (
    <ol>
      {story.map((stage, i) => {
        const mine = roleKey !== null && stage.roleKey === roleKey;
        const color = roleColor(stage.roleKey, stage.roleName);
        return (
          <li key={stage.id} className="relative pb-4 pl-12 last:pb-0">
            {i < story.length - 1 && <span className="absolute bottom-0 left-[17px] top-10 w-px bg-border" />}
            <span
              className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-lg text-[12px] font-semibold"
              style={{ backgroundColor: `${color}1F`, color }}
            >
              {stage.automated ? <Zap className="h-4 w-4" /> : initials(stage.roleName)}
            </span>

            <div
              className={`rounded-2xl border p-4 ${
                mine ? 'border-primary/40 bg-primary/[0.04]' : 'border-border bg-card'
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm font-semibold">{stage.roleName}</p>
                {stage.automated && stage.tools.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    on its own, using {stage.tools.map((t) => t.name).join(', ')}
                  </span>
                )}
                {mine && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    You
                  </span>
                )}
                {stage.branch && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    <GitFork className="h-3 w-3" /> {stage.branch}
                  </span>
                )}
                {i === 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                    <Flag className="h-3 w-3" /> Starts here
                  </span>
                )}
                {i === story.length - 1 && i !== 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                    <Flag className="h-3 w-3" /> Ends here
                  </span>
                )}
              </div>

              <ul className="mt-2 space-y-1.5">
                {stage.steps.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {s.number}
                    </span>
                    <span className="min-w-0 flex-1">
                      {s.text}
                      {s.kind === 'choice' && (
                        <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                          A choice
                        </span>
                      )}
                      {s.kind === 'wait' && (
                        <span className="ml-1.5 inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          <Hourglass className="h-2.5 w-2.5" /> A pause
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              {!compact && !stage.automated && stage.tools.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border/70 pt-2.5">
                  {stage.tools.map((t) => <AppChip key={t.id} app={t} />)}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Lesson one, for everyone: what the process is, who is in it, and how the work travels. */
function ProcessOverview({
  processName, description, outline, roles, story, roleKey, onNext, nextLabel,
}: {
  processName: string;
  description: string;
  outline: ReturnType<typeof buildOutline>;
  roles: RoleOption[];
  story: Stage[];
  roleKey: string | null;
  onNext: () => void;
  nextLabel: string;
}) {
  const total = outline.items.length;
  const people = roles.filter((r) => !r.automated && r.key !== UNASSIGNED_ROLE);
  const automated = roles.find((r) => r.automated)?.stepCount ?? 0;
  const sentence =
    description.trim() ||
    `${processName} has ${total} steps and involves ${people.length} ${people.length === 1 ? 'role' : 'roles'}${
      automated > 0 ? `. ${automated} of the steps happen on their own` : ''
    }.`;
  const startsWith = story[0];
  const endsWith = story[story.length - 1];

  return (
    <div className="mx-auto max-w-3xl px-6 pb-16 pt-8">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ backgroundColor: tintFor(processName).bg, color: tintFor(processName).fg }}
      >
        <Workflow className="h-6 w-6" />
      </span>
      <p className="mt-4 text-xs font-medium text-primary">Start here</p>
      <h2 className="mt-1 text-3xl font-semibold tracking-tight">How {processName} works</h2>
      <p className="mt-3 text-base leading-relaxed">{sentence}</p>
      {startsWith && endsWith && (
        <p className="mt-2 text-sm text-muted-foreground">
          It starts with {startsWith.automated ? 'something that happens automatically' : startsWith.roleName}
          {' '}and finishes with {endsWith.automated ? 'something that happens automatically' : endsWith.roleName}.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-muted px-3 py-1 font-medium">{total} steps</span>
        <span className="rounded-full bg-muted px-3 py-1 font-medium">
          {people.length} {people.length === 1 ? 'role' : 'roles'}
        </span>
        {automated > 0 && (
          <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
            {automated} happen on their own
          </span>
        )}
      </div>

      <div className={`${CARD} mt-6 px-4 py-3`}>
        <p className="text-xs text-muted-foreground">Every step in order. Each color is a different role.</p>
        <div className="mt-2 flex items-center gap-[3px]">
          {outline.items.map((it) => (
            <span
              key={it.step.id}
              title={`${it.number}. ${it.step.title} · ${it.step.performedBy?.name ?? 'Unassigned'}`}
              className="h-2 flex-1 rounded-full"
              style={{ backgroundColor: roleColor(roleKeyOf(it.step), it.step.performedBy?.name ?? '') }}
            />
          ))}
        </div>
        <RoleLegend items={outline.items.map((it) => it.step)} mineKey={roleKey} />
      </div>

      <h3 className="mt-10 text-sm font-semibold">Who's involved</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {roles.map((r) => (
          <div key={r.key} className={`${CARD} flex items-start gap-3 p-3.5`}>
            <RoleAvatar role={r} size={36} />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">{r.automated ? 'Happens automatically' : r.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {r.automated
                  ? `${r.stepCount} step${r.stepCount === 1 ? '' : 's'} run on their own`
                  : `Does ${r.stepCount} of the ${total} steps`}
              </p>
            </div>
          </div>
        ))}
      </div>

      <h3 className="mt-10 text-sm font-semibold">The story, start to finish</h3>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        Follow the work down the page. Each block is one role, or the automatic part, doing their bit before it
        moves on.
      </p>
      <ProcessStory story={story} roleKey={roleKey} />

      <div className="mt-10 flex justify-end border-t border-border pt-5">
        <Button onClick={onNext}>
          {nextLabel} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// --- Role picker ---

function RolePicker({ roles, processName, onPick, onBigPicture }: {
  roles: RoleOption[];
  processName: string;
  onPick: (key: string) => void;
  onBigPicture: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <h2 className="text-2xl font-semibold tracking-tight">What role are you?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Pick the role you're learning, taking over, or rethinking. You'll see exactly what it does in {processName}.
        You can switch any time.
      </p>
      <button
        type="button"
        onClick={onBigPicture}
        className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <Compass className="h-3.5 w-3.5" /> New here? See how the whole process works first
      </button>
      {roles.length === 0 && (
        <p className="mt-8 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-10 text-center text-sm text-muted-foreground">
          No people are assigned to steps in this process yet, so there is no role to train.
        </p>
      )}
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {roles.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => onPick(r.key)}
            className={`${CARD} group flex items-center gap-3 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]`}
          >
            <RoleAvatar role={r} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-semibold leading-tight">{r.name}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {r.automated ? 'Happens on its own' : 'Role'} · {r.stepCount} step{r.stepCount === 1 ? '' : 's'}
              </span>
              {r.apps.length > 0 && (
                <span className="mt-2 flex flex-wrap gap-1">
                  {r.apps.slice(0, 5).map((a) => (
                    <span key={a.id} title={a.name} className="rounded border border-border bg-background p-0.5">
                      <ElementIcon name={a.name} image={a.image} icon={a.icon} typeIcon={a.typeIcon} color={a.color} size={14} />
                    </span>
                  ))}
                </span>
              )}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </div>
  );
}

// --- The process, always in view ---

function ProcessStrip({ outline, lesson, currentId, onPick }: {
  outline: ReturnType<typeof buildOutline>;
  lesson: Lesson;
  currentId: string | null;
  onPick: (stepId: string) => void;
}) {
  const mine = new Set(lesson.steps.map((s) => s.item.step.id));
  const items = outline.items;
  const cur = currentId ? outline.byId.get(currentId) : null;

  return (
    <div className={`${CARD} px-4 py-3`}>
      <p className="text-xs text-muted-foreground">
        The whole process, start to finish. Each color is a different role, and {lesson.role.automated ? 'the automatic' : 'your'} steps are
        the bright ones.
      </p>
      <div className="mt-2 flex items-center gap-[3px]">
        {items.map((it) => {
          const isMine = mine.has(it.step.id);
          const isCur = it.step.id === currentId;
          return (
            <button
              key={it.step.id}
              type="button"
              disabled={!isMine}
              onClick={() => onPick(it.step.id)}
              title={`${it.number}. ${it.step.title} · ${it.step.performedBy?.name ?? 'Unassigned'}`}
              aria-label={`Step ${it.number}: ${it.step.title}`}
              style={{
                backgroundColor: roleColor(roleKeyOf(it.step), it.step.performedBy?.name ?? ''),
                opacity: isMine ? 1 : 0.28,
              }}
              className={`flex-1 rounded-full transition-all ${isCur ? 'h-3 ring-2 ring-primary/30' : 'h-2'} ${
                isMine ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
              }`}
            />
          );
        })}
      </div>
      <RoleLegend items={items.map((it) => it.step)} mineKey={lesson.role.key} />
      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate">{items[0]?.step.title}</span>
        <span className="shrink-0 font-medium text-foreground">
          {cur ? `Step ${cur.number} of ${items.length}` : `${lesson.steps.length} of ${items.length} steps`}
        </span>
        <span className="min-w-0 truncate text-right">{items[items.length - 1]?.step.title}</span>
      </div>
    </div>
  );
}

// --- Lesson slides ---

function Intro({ lesson, processName, onStart }: { lesson: Lesson; processName: string; onStart: () => void }) {
  const { role, steps, worksWith, tools, totalSteps } = lesson;
  return (
    <div>
      <div className="flex items-center gap-3">
        <RoleAvatar role={role} size={44} />
        <div>
          <p className="text-xs text-muted-foreground">Your role in {processName}</p>
          <h2 className="text-2xl font-semibold tracking-tight">{role.name}</h2>
        </div>
      </div>
      <p className="mt-4 text-base leading-relaxed">
        {role.automated
          ? `${steps.length} of the ${totalSteps} steps happen on their own. This lesson shows what sets each one off and what it does.`
          : `Now your part. You do ${steps.length} of the ${totalSteps} steps. This lesson walks through each one: what starts it, what you do, which tools you use, and where the work goes next. The bar above always shows where you are in the whole process.`}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className={`${CARD} p-4`}>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {role.automated ? 'It runs in' : "You'll work in"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tools.length ? tools.map((t) => <AppChip key={t.id} app={t} />) : (
              <span className="text-sm text-muted-foreground">No tools recorded yet.</span>
            )}
          </div>
        </div>
        <div className={`${CARD} p-4`}>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {role.automated ? 'It works with' : 'You work with'}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {worksWith.length ? worksWith.map((c) => (
              <li key={c.key} className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  {c.gives && c.gets ? 'works back and forth' : c.gives ? 'hands work over' : 'receives your work'}
                </span>
              </li>
            )) : <li className="text-muted-foreground">Nobody else yet.</li>}
          </ul>
        </div>
      </div>

      <div className="mt-8 flex justify-end border-t border-border pt-5">
        <Button onClick={onStart}>
          Start with {steps.length > 1 ? 'your first step' : 'your step'} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function StepLesson({ lesson, step, index, onOpen }: {
  lesson: Lesson;
  step: LessonStep;
  index: number;
  onOpen: () => void;
}) {
  const s = step.item.step;
  const decision = s.stepType === 'Decision';
  const doesFallback = step.does.length === 0 && s.description;

  return (
    <div>
      <p className="text-xs font-medium text-primary">
        {lesson.role.automated ? 'Step' : 'Your step'} {index + 1} of {lesson.steps.length}
        {s.stepType === 'Decision' && ' · a choice'}
        {s.stepType === 'Wait' && ' · a pause'}
      </p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight">{step.title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{step.trigger}</p>
      {step.item.branch && (
        <p className="mt-1.5 flex items-center gap-1 text-xs italic text-muted-foreground">
          <CornerDownRight className="h-3 w-3" /> This only happens {step.item.branch.label.toLowerCase()}.
        </p>
      )}
      {s.description && step.does.length > 0 && (
        <p className="mt-4 text-base leading-relaxed">{s.description}</p>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className={`${CARD} p-4`}>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">What you do</p>
          {step.does.length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-sm">
              {step.does.map((d) => (
                <li key={d.id} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>
                    {d.text}
                    {d.app && <span className="ml-1.5 text-xs text-muted-foreground">in {d.app.name}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm leading-relaxed">{doesFallback ? s.description : 'No details written for this step yet.'}</p>
          )}
        </div>

        <div className={`${CARD} p-4`}>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Where you do it</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {step.apps.length ? step.apps.map((a) => <AppChip key={a.id} app={a} />) : (
              <span className="text-sm text-muted-foreground">No tool needed.</span>
            )}
          </div>
        </div>

        <div className={`${CARD} p-4`}>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {decision ? 'Your choice' : 'Then it goes to'}
          </p>
          <ul className="mt-2 space-y-2 text-sm">
            {step.goesTo.length ? step.goesTo.map((h) => (
              <li key={h.stepId + h.label}>
                {h.label && (
                  <span className="mr-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                    {decision ? `If ${h.label.toLowerCase()}` : h.label}
                  </span>
                )}
                <span className="font-medium">{h.who}</span>
                <span className="block text-xs text-muted-foreground">{h.title}</span>
              </li>
            )) : <li className="text-muted-foreground">The process ends here.</li>}
          </ul>
        </div>
      </div>

      {(step.receives.length > 0 || step.produces.length > 0) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {step.receives.length > 0 && (
            <div className={`${CARD} p-4`}>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">You'll need</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {step.receives.map((r) => (
                  <span key={r.id} className="rounded-full border border-border px-2 py-0.5 text-xs">{r.name}</span>
                ))}
              </div>
            </div>
          )}
          {step.produces.length > 0 && (
            <div className={`${CARD} p-4`}>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">You produce</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {step.produces.map((r) => (
                  <span key={r.id} className="rounded-full border border-border px-2 py-0.5 text-xs">{r.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="mt-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ExternalLink className="h-3.5 w-3.5" /> Open this step in the map
      </button>
    </div>
  );
}

/** A short burst of confetti when someone finishes a lesson. Skipped for anyone who prefers less motion. */
function Confetti() {
  const colors = ['hsl(217 80% 60%)', 'hsl(152 60% 45%)', 'hsl(24 90% 58%)', 'hsl(336 75% 58%)', 'hsl(262 65% 62%)'];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-72 overflow-hidden motion-reduce:hidden">
      {Array.from({ length: 32 }, (_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${(i * 37) % 100}%`,
            backgroundColor: colors[i % colors.length],
            animationDelay: `${(i % 8) * 0.1}s`,
            animationDuration: `${1.7 + (i % 5) * 0.25}s`,
            width: i % 3 === 0 ? 6 : 8,
            height: i % 2 === 0 ? 12 : 8,
          }}
        />
      ))}
    </div>
  );
}

function WrapUp({ role, onFinish, onOther, onRestart }: {
  role: RoleOption;
  onFinish: () => void;
  onOther: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="relative py-10 text-center">
      <Confetti />
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <Check className="h-6 w-6" />
      </span>
      <p className="mt-4 text-sm font-medium text-emerald-700">Nice work</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight">That's the {role.name} part of the process</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        You now know every step this role does, which tools it uses, and who it works with.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onFinish}>Finish</Button>
        <Button variant="outline" onClick={onOther}>Learn another role</Button>
        <Button variant="ghost" onClick={onRestart}>Start over</Button>
      </div>
    </div>
  );
}
