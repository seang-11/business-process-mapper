import { useMemo } from 'react';
import { ArrowRight, CornerDownRight, Repeat2, Zap } from 'lucide-react';
import type { ElementRef, ProcessConnection, ProcessStep } from '@/types';
import { buildOutline, type OutlineItem } from '@/lib/walkthrough';
import ElementIcon from './ElementIcon';

interface Props {
  steps: ProcessStep[];
  connections: ProcessConnection[];
  onOpenStep: (step: ProcessStep) => void;
}

const isApp = (e: ElementRef | null | undefined): boolean => e?.actorClass === 'System';
const titleOf = (s: ProcessStep) => s.walkthroughLine.trim() || s.title;

/**
 * The whole process as one scrolling timeline: every step in the order the
 * work flows, each with who does it, what they do (grouped by app), what it
 * produces, and where a decision can lead. The same style as a person's view,
 * for reading the process top to bottom. Click a step to open it.
 */
export default function ProcessTimeline({ steps, connections, onOpenStep }: Props) {
  const outline = useMemo(() => buildOutline(steps, connections), [steps, connections]);
  const items = outline.items;
  const total = items.length;

  const { people, automated } = useMemo(() => {
    const people = new Set<string>();
    let automated = 0;
    for (const s of steps) {
      if (isApp(s.performedBy)) automated += 1;
      else if (s.performedBy) people.add(s.performedBy.id);
    }
    return { people: people.size, automated };
  }, [steps]);

  if (total === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No steps yet — click &quot;Add Step&quot; to begin
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[hsl(220_20%_98.5%)]">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <p className="text-sm text-muted-foreground">
          {total} steps · {people} {people === 1 ? 'person' : 'people'} · {automated} automated
        </p>
        {/* The process at a glance, one bar per step in its owner's colour. */}
        <div className="mt-3 flex gap-[3px]" aria-hidden="true">
          {items.map((it) => (
            <span
              key={it.step.id}
              title={`${it.number}. ${titleOf(it.step)} · ${it.step.performedBy?.name ?? 'Unassigned'}`}
              className="h-1.5 flex-1 rounded-full"
              style={{ backgroundColor: dotColor(it.step) }}
            />
          ))}
        </div>

        <ol className="relative ml-2 mt-8 border-l-2 border-border pl-6">
          {items.map((it, i) => {
            const prev = items[i - 1];
            const startsBranch = it.branch && it.branch.label !== prev?.branch?.label;
            const loopTo = it.loopBackId ? outline.byId.get(it.loopBackId) : null;
            return (
              <li key={it.step.id}>
                {startsBranch && (
                  <Event>
                    <CornerDownRight className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                    {it.branch!.label}
                  </Event>
                )}
                <StepCard item={it} total={total} outline={outline} onOpen={() => onOpenStep(it.step)} />
                {loopTo && (
                  <Event accent>
                    <Repeat2 className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                    Then back to step {loopTo.number}, {titleOf(loopTo.step)}
                  </Event>
                )}
              </li>
            );
          })}
          <Event muted>End of the process</Event>
        </ol>
      </div>
    </div>
  );
}

function dotColor(step: ProcessStep) {
  if (isApp(step.performedBy)) return 'rgb(16 185 129)';
  return step.performedBy?.color || 'hsl(var(--muted-foreground))';
}

/** A line on the timeline between cards, with a dot on the rail. */
function Event({ accent, muted, children }: { accent?: boolean; muted?: boolean; children: React.ReactNode }) {
  return (
    <p
      className={`relative my-3 text-sm before:absolute before:-left-[31px] before:top-1.5 before:h-2.5 before:w-2.5 before:rounded-full before:border-2 before:bg-background ${
        accent
          ? 'text-primary before:border-primary/60'
          : muted
          ? 'text-muted-foreground/70 before:border-border'
          : 'italic text-muted-foreground before:border-muted-foreground/50'
      }`}
    >
      {children}
    </p>
  );
}

function StepCard({ item, total, outline, onOpen }: {
  item: OutlineItem;
  total: number;
  outline: ReturnType<typeof buildOutline>;
  onOpen: () => void;
}) {
  const { step } = item;
  const who = step.performedBy;
  const automated = isApp(who);
  const apps = [who, ...step.uses].filter((e): e is ElementRef => !!e && isApp(e));
  const appById = new Map(apps.map((a) => [a.id, a]));

  // Checklist grouped by the app each item is done in; untagged items first.
  const groups: { app: ElementRef | null; items: string[] }[] = [];
  for (const c of step.checklist) {
    const app = (c.appId && appById.get(c.appId)) || null;
    const group = groups.find((g) => g.app?.id === app?.id);
    if (group) group.items.push(c.text);
    else groups.push({ app, items: [c.text] });
  }
  groups.sort((a, b) => (a.app ? 1 : 0) - (b.app ? 1 : 0));
  const usedApps = apps.filter((a) => a.id !== who?.id);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      className="relative my-3 cursor-pointer rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm transition-colors hover:border-primary/50"
    >
      <span
        className="absolute -left-[33px] top-4 h-3.5 w-3.5 rounded-full ring-4 ring-muted"
        style={{ backgroundColor: dotColor(step) }}
        aria-hidden="true"
      />

      <div className="flex items-center justify-between gap-3">
        {automated ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <Zap className="h-3 w-3" /> Automated · {who?.name}
          </span>
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold" style={who?.color ? { color: who.color } : undefined}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: who?.color || 'hsl(var(--muted-foreground))' }} />
            <span className="truncate">{who?.name || 'Unassigned'}</span>
            {who?.party === 'External' && <span className="font-normal text-muted-foreground">· external</span>}
          </span>
        )}
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {step.stepType === 'Decision' && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">Decision</span>
          )}
          <span className="tabular-nums">Step {item.number} of {total}</span>
        </span>
      </div>

      <p className="mt-1.5 text-base font-semibold">{titleOf(step)}</p>
      {step.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{step.description}</p>}

      {groups.length > 0 ? (
        <div className="mt-2.5 space-y-2">
          {groups.map((g) => (
            <div key={g.app?.id ?? 'none'}>
              {g.app && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <ElementIcon name={g.app.name} image={g.app.image} icon={g.app.icon} typeIcon={g.app.typeIcon} color={g.app.color} size={13} />
                  In {g.app.name}
                </p>
              )}
              {g.items.map((text, i) => (
                <p key={i} className={`text-sm ${g.app ? 'pl-5' : ''}`}>
                  · {text}
                </p>
              ))}
            </div>
          ))}
        </div>
      ) : (
        usedApps.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {usedApps.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1.5">
                <ElementIcon name={a.name} image={a.image} icon={a.icon} typeIcon={a.typeIcon} color={a.color} size={13} />
                {a.name}
              </span>
            ))}
          </div>
        )
      )}

      {step.produces.length > 0 && (
        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <CornerDownRight className="h-3.5 w-3.5" /> Produces
          {step.produces.map((p) => (
            <span key={p.id} className="rounded-full border border-border px-2 py-0.5 text-foreground">
              {p.name}
            </span>
          ))}
        </p>
      )}

      {item.outcomes.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-border pt-2.5">
          {item.outcomes.map((o) => {
            const target = outline.byId.get(o.targetId);
            return (
              <p key={o.key} className="flex items-center gap-1.5 text-sm">
                <span className="font-medium">If {o.label || 'otherwise'}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {target ? `Step ${target.number} · ${titleOf(target.step)}` : 'An earlier step'}
                </span>
                {o.loopsBack && <Repeat2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Goes back round" />}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
