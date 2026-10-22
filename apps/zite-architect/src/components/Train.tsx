import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X, ArrowLeft, ArrowRight, GraduationCap, Link2, Printer, Zap, CornerDownRight, ExternalLink, Check, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { getProcessGraph } from 'zitejs/api';
import { format } from 'date-fns';
import { Button } from '@project/components/ui/button';
import { Skeleton } from '@project/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@project/components/ui/select';
import type { ElementRef, ProcessConnection, ProcessStep } from '@/types';
import { buildOutline } from '@/lib/walkthrough';
import {
  buildBrief, buildLesson, rolesOf, type Lesson, type LessonStep, type RoleOption,
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

interface Props {
  processName: string;
  versions: TrainVersion[];
  /** Which version to train on first. The live one, unless a link says otherwise. */
  initialVersionId: string;
  /** A role to open straight to, from a shared link. */
  initialRole: string | null;
  initialView: 'lesson' | 'brief';
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
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

const SEG_TRACK = 'flex shrink-0 rounded-lg bg-muted p-0.5 text-xs';
const segBtn = (active: boolean) =>
  `rounded-md px-3 py-1 font-medium transition-all ${
    active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
  }`;
const CARD = 'rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]';

function RoleAvatar({ role, size = 36 }: { role: RoleOption; size?: number }) {
  const tint = tintFor(role.name);
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold"
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
 * process, one step at a time, with the whole process always in view. The same
 * role can also be turned into a one-page handover brief for when someone is
 * leaving and someone else is arriving. All of it is read straight from the map.
 */
export default function Train({
  processName, versions, initialVersionId, initialRole, initialView, onClose, onOpenStep,
}: Props) {
  const [versionId, setVersionId] = useState(initialVersionId);
  const [graph, setGraph] = useState<{ steps: ProcessStep[]; connections: ProcessConnection[] } | null>(null);
  const version = versions.find((v) => v.id === versionId) ?? versions[0];
  const live = versions.find((v) => v.state === 'Current') ?? null;
  const versionName = version?.name ?? '';

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

  // Checked against the roles once the version has loaded; an unknown one just shows the picker.
  const [roleKey, setRoleKey] = useState<string | null>(initialRole);
  const [view, setView] = useState<'lesson' | 'brief'>(initialView);
  /** -1 is the introduction; steps follow; one past the last is the wrap-up. */
  const [idx, setIdx] = useState(-1);

  const role = roles.find((r) => r.key === roleKey) ?? null;
  const lesson = useMemo(
    () => (role ? buildLesson(role, outline, connections) : null),
    [role, outline, connections],
  );
  const brief = useMemo(() => (lesson ? buildBrief(lesson, processName) : null), [lesson, processName]);
  const n = lesson?.steps.length ?? 0;

  const pickRole = (key: string | null) => {
    setRoleKey(key);
    setIdx(-1);
  };

  const next = useCallback(() => setIdx((i) => Math.min(n, i + 1)), [n]);
  const back = useCallback(() => setIdx((i) => Math.max(-1, i - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (role && view === 'lesson' && e.key === 'ArrowRight') next();
      else if (role && view === 'lesson' && e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [role, view, next, back, onClose]);

  const copyLink = () => {
    if (!role) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('lane');
    url.searchParams.delete('by');
    url.searchParams.set('train', role.key);
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
      <header className="train-noprint flex items-center gap-4 border-b border-border bg-background px-6 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <GraduationCap className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Train · {processName}</p>
          <p className="truncate text-xs text-muted-foreground">{version ? whenText(version) : ''}</p>
        </div>

        {versions.length > 1 && (
          <Select
            value={versionId}
            onValueChange={(v) => {
              setVersionId(v);
              setIdx(-1);
            }}
          >
            <SelectTrigger className="h-8 w-[260px] text-xs" aria-label="Version to train on">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.id} value={v.id} className="text-xs">
                  {v.name} · {STATE_LABEL[v.state] ?? v.state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {role && (
          <div className={`${SEG_TRACK} ml-4`}>
            <button className={segBtn(view === 'lesson')} onClick={() => setView('lesson')}>Lesson</button>
            <button className={segBtn(view === 'brief')} onClick={() => setView('brief')}>Handover brief</button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          {role && (
            <Button variant="ghost" size="sm" onClick={copyLink}>
              <Link2 className="mr-1.5 h-3.5 w-3.5" /> Copy link
            </Button>
          )}
          {role && view === 'brief' && (
            <Button variant="ghost" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close training" title="Close (Esc)">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {version && (
        <VersionBanner
          version={version}
          live={live}
          onSwitchToLive={() => {
            if (live) {
              setVersionId(live.id);
              setIdx(-1);
            }
          }}
        />
      )}

      {role && (
        <div className="train-noprint flex items-center gap-2 overflow-x-auto border-b border-border bg-background px-6 py-2">
          <span className="shrink-0 text-xs text-muted-foreground">Your role</span>
          {roles.map((r) => (
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
        ) : !role || !lesson || !brief ? (
          <RolePicker roles={roles} processName={processName} onPick={pickRole} />
        ) : view === 'brief' ? (
          <BriefView
            lesson={lesson}
            brief={brief}
            processName={processName}
            versionName={versionName}
            versionWhen={version ? `${STATE_LABEL[version.state] ?? version.state} · ${whenText(version)}` : ''}
          />
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
                  onBrief={() => setView('brief')}
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
    </div>
  );
}

// --- Which version you are teaching ---

/**
 * Says plainly which way of working this training describes, so nobody learns a
 * process that isn't the one the team runs. Training should use the live version;
 * a version still being prepared, or an old one, says so and offers the way back.
 */
function VersionBanner({ version, live, onSwitchToLive }: {
  version: TrainVersion;
  live: TrainVersion | null;
  onSwitchToLive: () => void;
}) {
  const isLive = version.state === 'Current';
  const when = whenText(version);

  const tone = isLive
    ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200'
    : 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200';

  let headline: string;
  let detail: string;
  if (isLive) {
    headline = `You're training on the live version: ${version.name}`;
    detail = version.liveFrom
      ? `${when}. This is how the work is done today.`
      : 'This is how the work is done today.';
  } else if (version.state === 'Future') {
    headline = `${version.name} isn't live yet`;
    detail = live
      ? `Train people on ${live.name}, which is how the work is done today. Use this version only for people who start after it goes live.`
      : 'No version is marked live yet, so check this is the one your team uses.';
  } else {
    headline = `${version.name} is an old version`;
    detail = live
      ? `${when}. It's here for reference. New people should learn ${live.name}.`
      : `${when}. It's here for reference.`;
  }

  return (
    <div className={`train-noprint flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-6 py-2.5 text-sm ${tone}`}>
      <span className="font-semibold">{headline}</span>
      <span className="min-w-0 flex-1 text-xs opacity-90">{detail}</span>
      {!isLive && live && (
        <Button size="sm" variant="outline" className="h-7 bg-background text-xs text-foreground" onClick={onSwitchToLive}>
          Switch to {live.name}
        </Button>
      )}
    </div>
  );
}

// --- Role picker ---

function RolePicker({ roles, processName, onPick }: {
  roles: RoleOption[];
  processName: string;
  onPick: (key: string) => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <h2 className="text-2xl font-semibold tracking-tight">What role are you?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Pick the role you're learning, taking over, or rethinking. You'll see exactly what it does in {processName}.
        You can switch any time.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {roles.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => onPick(r.key)}
            className={`${CARD} group flex items-center gap-3 p-4 text-left transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)]`}
          >
            <RoleAvatar role={r} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-semibold leading-tight">{r.name}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {r.automated ? 'Run by apps' : 'Role'} · {r.stepCount} step{r.stepCount === 1 ? '' : 's'}
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
        The whole process. {lesson.role.automated ? 'The automated' : 'Your'} steps are highlighted.
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
              className={`flex-1 rounded-full transition-all ${isCur ? 'h-3 ring-2 ring-primary/30' : 'h-2'} ${
                isMine ? 'cursor-pointer bg-primary hover:opacity-80' : 'cursor-default bg-foreground/15'
              }`}
            />
          );
        })}
      </div>
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
          ? `${steps.length} of the ${totalSteps} steps run on their own. This lesson shows what triggers each one and what it does.`
          : `You do ${steps.length} of the ${totalSteps} steps. This lesson walks through each one: what starts it, what you do, which tools you use, and where the work goes next.`}
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
        {s.stepType === 'Decision' && ' · a decision'}
        {s.stepType === 'Wait' && ' · a wait'}
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
            {decision ? 'Your decision' : 'Then it goes to'}
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

function WrapUp({ role, onBrief, onOther, onRestart }: {
  role: RoleOption;
  onBrief: () => void;
  onOther: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="py-10 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <Check className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-2xl font-semibold tracking-tight">That's the {role.name} part of the process</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Taking this role over from someone, or handing it on? The handover brief puts it on one page.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onBrief}>Open the handover brief</Button>
        <Button variant="outline" onClick={onOther}>Learn another role</Button>
        <Button variant="ghost" onClick={onRestart}>Start over</Button>
      </div>
    </div>
  );
}

// --- Handover brief ---

function BriefView({ lesson, brief, processName, versionName, versionWhen }: {
  lesson: Lesson;
  brief: ReturnType<typeof buildBrief>;
  processName: string;
  versionName: string;
  /** "Live · Live since Sep 2, 2026": which way of working this brief describes. */
  versionWhen: string;
}) {
  const { role, steps, tools, worksWith } = lesson;
  const subject = role.automated ? 'the automation' : 'you';
  return (
    <div className="train-print mx-auto max-w-3xl px-6 py-10">
      <p className="text-xs font-medium uppercase tracking-wider text-primary">Handover brief</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{brief.headline}</h1>
      <p className="mt-2 inline-flex flex-wrap items-center gap-x-2 rounded-full border border-border bg-background px-3 py-1 text-xs">
        <span className="font-semibold">{versionName}</span>
        {versionWhen && <span className="text-muted-foreground">{versionWhen}</span>}
      </p>
      <p className="mt-4 text-base leading-relaxed">{brief.summary}</p>

      <section className="mt-8">
        <h3 className="text-sm font-semibold">The steps</h3>
        <ol className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
          {steps.map((s, i) => (
            <li key={s.item.step.id} className="flex gap-3 px-4 py-3">
              <span className="w-5 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{s.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.trigger}</p>
                {s.apps.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {s.apps.map((a) => <AppChip key={a.id} app={a} />)}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className={`${CARD} p-4`}>
          <h3 className="text-sm font-semibold">Get access to</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tools.length ? tools.map((t) => <AppChip key={t.id} app={t} />) : (
              <span className="text-sm text-muted-foreground">No tools recorded.</span>
            )}
          </div>
        </section>
        <section className={`${CARD} p-4`}>
          <h3 className="text-sm font-semibold">{role.automated ? 'It works with' : 'You work with'}</h3>
          <ul className="mt-3 space-y-1.5 text-sm">
            {worksWith.length ? worksWith.map((c) => (
              <li key={c.key}>
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground">
                  {' · '}
                  {c.gives && c.gets
                    ? `works back and forth with ${subject}`
                    : c.gives
                    ? `hands work to ${subject}`
                    : `receives work from ${subject}`}
                </span>
              </li>
            )) : <li className="text-muted-foreground">Nobody else yet.</li>}
          </ul>
        </section>
      </div>

      <section className="mt-8">
        <h3 className="text-sm font-semibold">Ramp-up plan</h3>
        <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
          {brief.plan.map((p) => (
            <div key={p.label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 px-4 py-3 text-sm">
              <span className="text-muted-foreground">{p.label}</span>
              <span>{p.text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h3 className="text-sm font-semibold">For the person leaving to confirm</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {brief.leaving.map((l) => (
            <li key={l} className="flex items-start gap-2">
              <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-foreground/30" />
              {l}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
        Built from the {versionName} version of {processName} on {new Date().toLocaleDateString()}. It reads from the
        process map, so it stays current when the process changes.
      </p>
    </div>
  );
}
