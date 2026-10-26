import { useMemo, useState } from 'react';
import type { GetBrainOutputType } from 'zitejs/api';
import {
  ArrowDown,
  ArrowRight,
  CircleHelp,
  GraduationCap,
  Hourglass,
  Maximize2,
  Minimize2,
  Pencil,
  SquareCheck,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { deptTag } from '@/lib/deptColors';
import { processIcon } from '@/lib/processIcon';
import RoleAvatar, { hueFor } from './RoleAvatar';
import ElementIcon from './ElementIcon';

type BrainProc = GetBrainOutputType['processes'][number];
type Who = BrainProc['people'][number];

/** One step, as the overview needs it. A Brain process's steps fit as they are. */
export interface OverviewStep {
  id: string;
  title: string;
  stepType: string;
  /** An app does it on its own. */
  automated: boolean;
  who: Who | null;
  uses: Who[];
  minutes: number | null;
  subProcessId: string | null;
}

/** A process, as the overview needs it. A Brain process fits as it is. */
export interface OverviewProc {
  name: string;
  icon?: string;
  department: string;
  description: string;
  live: boolean;
  stepCount: number;
  runsPerMonth: number | null;
  ownerName: string;
  automated: number;
  review: number;
  manual: number;
  runs: { processId: string }[];
  steps: OverviewStep[];
}
type Step = OverviewStep;

const AUTOMATED = 'hsl(152 55% 42%)';
const REVIEW = 'hsl(262 60% 62%)';
const MANUAL = 'hsl(28 90% 55%)';

const fmtHrs = (h: number) => `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10} hrs/mo`;

/** The color a role (or app) wears in this pop-up: the same hue it has everywhere else. */
const tint = (w: Who | null) =>
  !w ? { hue: 220, sat: 10 } : w.kind === 'app' ? { hue: 152, sat: 45 } : { hue: hueFor(w.name), sat: 70 };

/** A step's kind, as a small icon. */
function StepIcon({ s }: { s: Step }) {
  const [Icon, bg, fg, label] = s.automated
    ? [Zap, 'hsl(152 55% 92%)', 'hsl(152 55% 30%)', 'An app does it']
    : s.stepType === 'Decision'
      ? [CircleHelp, 'hsl(262 70% 94%)', 'hsl(262 45% 40%)', 'A decision']
      : s.stepType === 'Wait'
        ? [Hourglass, 'hsl(40 20% 92%)', 'hsl(40 10% 38%)', 'Waiting']
        : s.subProcessId
          ? [Workflow, 'hsl(217 80% 94%)', 'hsl(217 60% 40%)', 'Runs another process']
          : [SquareCheck, 'hsl(220 14% 95%)', 'hsl(220 9% 46%)', 'A task'];
  return (
    <span title={label} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: bg, color: fg }}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

/**
 * The process you clicked on the Brain: who it belongs to and what it costs up
 * top, then its steps grouped by who does them, with the handoffs between them.
 * Click a role to see only their steps.
 */
export default function ProcessPopup({
  p,
  hue,
  hours,
  names,
  runBy,
  canEdit,
  flowOpen = false,
  variant = 'popup',
  onClose,
  onJump,
  onToggleFlow,
  onEdit,
  onOpen,
  onTrain,
  onOpenStep,
}: {
  p: OverviewProc;
  /** A pop-up over the Brain, or the Overview on a process page (no header or buttons; the page has its own). */
  variant?: 'popup' | 'page';
  /** Click a step to open it, for admins on the process page. */
  onOpenStep?: (id: string) => void;
  /** The department's color. */
  hue: number | undefined;
  hours: number | null;
  names: Map<string, string>;
  /** Processes that run this one. */
  runBy: { id: string; name: string }[];
  canEdit: boolean;
  /** Its steps are laid out on the board right now. */
  flowOpen?: boolean;
  onClose?: () => void;
  onJump?: (id: string) => void;
  onToggleFlow?: () => void;
  onEdit?: () => void;
  onOpen?: () => void;
  onTrain?: () => void;
}) {
  const page = variant === 'page';
  const [only, setOnly] = useState<string | null>(null);
  const PIcon = processIcon(p);

  // Who does the steps, in the order they first show up, with how many each.
  const roles = useMemo(() => {
    const m = new Map<string, { who: Who | null; n: number }>();
    for (const s of p.steps) {
      const key = s.who?.id ?? '~';
      m.set(key, { who: s.who, n: (m.get(key)?.n ?? 0) + 1 });
    }
    return [...m.entries()].map(([key, v]) => ({ key, ...v }));
  }, [p.steps]);

  // Steps in a row by the same role, as one block.
  const groups = useMemo(() => {
    const out: { key: string; who: Who | null; steps: { s: Step; n: number }[] }[] = [];
    p.steps.forEach((s, i) => {
      const key = s.who?.id ?? '~';
      const last = out[out.length - 1];
      if (last && last.key === key) last.steps.push({ s, n: i + 1 });
      else out.push({ key, who: s.who, steps: [{ s, n: i + 1 }] });
    });
    return out;
  }, [p.steps]);

  const work = p.automated + p.review + p.manual;
  const runs = [...new Set(p.runs.map((r) => r.processId))];

  return (
    <aside
      role="dialog"
      aria-label={p.name}
      className={
        page
          ? 'mx-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-[0_1px_3px_rgba(16,24,40,0.06)]'
          : 'flex max-h-full w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl duration-200 animate-in fade-in-0 zoom-in-95'
      }
    >
      {/* Header: what it is and where it lives. */}
      {!page && (
      <div className="flex items-start gap-3.5 p-5 pb-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={hue !== undefined ? { background: `hsl(${hue} 80% 94%)`, color: `hsl(${hue} 55% 38%)` } : undefined}
        >
          <PIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-full px-2 py-0.5 font-medium" style={deptTag(hue)}>
              {p.department || 'No department'}
            </span>
            <span className={`rounded-full px-2 py-0.5 font-medium ${p.live ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {p.live ? 'Live' : 'Draft'}
            </span>
          </div>
          <h2 className="mt-1.5 text-xl font-semibold leading-snug tracking-tight">{p.name}</h2>
          {p.description && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{p.description}</p>}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      )}

      {/* The numbers, in one strip. */}
      <div className={`grid grid-cols-4 ${page ? 'border-b' : 'border-y'} border-border`}>
        {[
          ['Steps', `${p.stepCount}`],
          ['People time', hours !== null ? fmtHrs(hours) : '—'],
          ['Runs', p.runsPerMonth ? `${p.runsPerMonth} a month` : '—'],
          ['Owner', p.ownerName || '—'],
        ].map(([label, value], i) => (
          <div key={label} className={`min-w-0 px-4 py-2.5 ${i > 0 ? 'border-l border-border' : ''}`}>
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="truncate text-[15px] font-semibold" title={value}>{value}</p>
          </div>
        ))}
      </div>

      <div className={page ? '' : 'min-h-0 flex-1 overflow-y-auto'}>
        {/* Who does the work, as one bar. */}
        {work > 0 && (
          <div className="px-5 pt-4">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Who does the work</span>
              <span className="flex items-center gap-3">
                {[
                  [p.manual, 'by hand', MANUAL],
                  [p.review, p.review === 1 ? 'decision' : 'decisions', REVIEW],
                  [p.automated, 'by apps', AUTOMATED],
                ].map(([n, label, c]) => (
                  <span key={label as string} className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: c as string }} />
                    {n as number} {label as string}
                  </span>
                ))}
              </span>
            </div>
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
              {[
                [p.manual, MANUAL],
                [p.review, REVIEW],
                [p.automated, AUTOMATED],
              ].map(([n, c], i) =>
                (n as number) > 0 ? <span key={i} style={{ flex: n as number, background: c as string }} /> : null,
              )}
            </div>
          </div>
        )}

        {/* Roles: click one to see only their steps. */}
        {roles.length > 1 && (
          <div className="px-5 pt-4">
            <p className="mb-2 text-xs text-muted-foreground">Click a role to see only their steps</p>
            <div className="flex flex-wrap gap-1.5">
              {roles.map(({ key, who, n }) => {
                const t = tint(who);
                const on = only === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setOnly(on ? null : key)}
                    aria-pressed={on}
                    className="inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-[13px] font-medium transition-opacity"
                    style={{
                      background: `hsl(${t.hue} ${t.sat}% 95%)`,
                      color: `hsl(${t.hue} ${t.sat}% 28%)`,
                      borderColor: on ? `hsl(${t.hue} ${t.sat}% 50%)` : 'transparent',
                      opacity: only && !on ? 0.45 : 1,
                    }}
                  >
                    {who ? <RoleAvatar w={who} size={18} /> : <span className="h-[22px] w-[22px] rounded-full bg-muted" />}
                    {who?.name ?? 'Nobody yet'}
                    <span className="font-normal opacity-60">{n}</span>
                    {who?.party === 'External' && <span className="text-[10px] font-normal opacity-60">outside</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* The steps, grouped by who does them. */}
        <div className="px-5 pb-4 pt-2">
          {groups.map((g, gi) => {
            const t = tint(g.who);
            const next = groups[gi + 1];
            const faded = only !== null && only !== g.key;
            return (
              <div key={`${g.key}-${gi}`}>
                <div
                  className="mt-2 rounded-xl px-3 py-2.5 transition-opacity"
                  style={{ background: `hsl(${t.hue} ${t.sat}% 97%)`, border: `1px solid hsl(${t.hue} ${t.sat}% 90%)`, opacity: faded ? 0.3 : 1 }}
                >
                  <p className="mb-1 flex items-center gap-2 text-[13px] font-semibold" style={{ color: `hsl(${t.hue} ${t.sat}% 30%)` }}>
                    {g.who ? <RoleAvatar w={g.who} size={18} /> : <span className="h-[22px] w-[22px] rounded-full bg-muted" />}
                    {g.who?.name ?? 'Nobody yet'}
                    {g.who?.party === 'External' && <span className="text-[11px] font-normal opacity-60">outside the team</span>}
                  </p>
                  <ol>
                    {g.steps.map(({ s, n }) => {
                      const apps = s.uses.filter((u) => u.kind === 'app' && u.id !== s.who?.id);
                      return (
                        <li
                          key={s.id}
                          onClick={onOpenStep ? () => onOpenStep(s.id) : undefined}
                          className={`flex items-center gap-2.5 py-1.5 text-sm ${onOpenStep ? '-mx-1.5 cursor-pointer rounded-md px-1.5 hover:bg-background' : ''}`}
                        >
                          <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{n}</span>
                          <StepIcon s={s} />
                          <span className="min-w-0 flex-1">
                            {s.title}
                            {s.subProcessId && names.get(s.subProcessId) && (
                              <span className="ml-1 text-xs text-muted-foreground">· runs {names.get(s.subProcessId)}</span>
                            )}
                          </span>
                          {s.minutes && <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{s.minutes} min</span>}
                          <span className="flex shrink-0 items-center gap-1">
                            {apps.slice(0, 3).map((a) => (
                              <span
                                key={a.id}
                                title={a.name}
                                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground"
                              >
                                <ElementIcon name={a.name} image={a.image} icon={a.icon} typeIcon={a.typeIcon} color={a.color} size={11} />
                                <span className="hidden sm:inline">{a.name}</span>
                              </span>
                            ))}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
                {next && (
                  <p className="flex items-center gap-1.5 pl-9 pt-1.5 text-xs text-muted-foreground" style={{ opacity: only ? 0.4 : 1 }}>
                    <ArrowDown className="h-3 w-3" /> hands to{' '}
                    <span className="font-semibold" style={{ color: `hsl(${tint(next.who).hue} ${tint(next.who).sat}% 32%)` }}>
                      {next.who?.name ?? 'nobody yet'}
                    </span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Connected processes, then what you can do. */}
      {(!page || runs.length > 0 || runBy.length > 0) && (
      <div className="space-y-2.5 border-t border-border p-3.5">
        {(runs.length > 0 || runBy.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {runs.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onJump?.(id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"
              >
                <ArrowRight className="h-3 w-3 text-primary" /> Hands off to <b className="font-semibold">{names.get(id)}</b>
              </button>
            ))}
            {runBy.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onJump?.(r.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"
              >
                <Workflow className="h-3 w-3 text-primary" /> Started by <b className="font-semibold">{r.name}</b>
              </button>
            ))}
          </div>
        )}
        {!page && (
        <div className="flex flex-wrap gap-2">
          {onTrain && (
            <Button variant="outline" onClick={onTrain}>
              <GraduationCap className="mr-1.5 h-4 w-4" /> Train
            </Button>
          )}
          {onToggleFlow && (
            <Button variant="outline" onClick={onToggleFlow}>
              {flowOpen ? <Minimize2 className="mr-1.5 h-4 w-4" /> : <Maximize2 className="mr-1.5 h-4 w-4" />}
              {flowOpen ? 'Hide on board' : 'Show on board'}
            </Button>
          )}
          {canEdit ? (
            <Button className="flex-1" onClick={onEdit}>
              <Pencil className="mr-1.5 h-4 w-4" /> Edit process
            </Button>
          ) : (
            <Button className="flex-1" onClick={onOpen}>
              Open process
            </Button>
          )}
        </div>
        )}
      </div>
      )}
    </aside>
  );
}
