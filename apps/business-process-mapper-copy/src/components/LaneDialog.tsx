import { useMemo, useState } from 'react';
import { ChevronDown, Link2, Zap } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import type { ElementRef, ProcessConnection, ProcessStep } from '@/types';
import { buildOutline, type OutlineItem } from '@/lib/walkthrough';
import { AUTOMATED_LANE, getLaneKey, type LaneGrouping } from './SwimlaneDiagram';
import ElementIcon from './ElementIcon';

interface Props {
  lane: string;
  grouping: LaneGrouping;
  steps: ProcessStep[];
  connections: ProcessConnection[];
  onClose: () => void;
  onOpenStep: (step: ProcessStep) => void;
  onCopyLink: () => void;
}

const isApp = (e: ElementRef | null | undefined): boolean => e?.actorClass === 'System';
const titleOf = (s: ProcessStep) => s.walkthroughLine.trim() || s.title;

/** A step someone else does, as one line of the timeline. */
interface Other {
  item: OutlineItem;
  label: string;
}

interface Entry {
  item: OutlineItem;
  /** What has to happen first; empty when it starts the process. */
  startsAfter: Other[];
  /** The step just before is also theirs and leads straight into this one. */
  rightAfter: boolean;
  /** Apps this step sets off by itself. */
  triggers: Other[];
  /** Everything others do between this step and their next one. */
  meanwhile: OutlineItem[];
}

/**
 * One person's part in a process, top to bottom: what starts each of their
 * steps, what they do (grouped by the app they do it in), what their step
 * sets off automatically, and what everyone else does in between. Written
 * for someone opening the process to see just their part.
 */
export default function LaneDialog({ lane, grouping, steps, connections, onClose, onOpenStep, onCopyLink }: Props) {
  const isAutomated = grouping === 'people' && lane === AUTOMATED_LANE;

  const { outline, entries, after, remaining } = useMemo(() => {
    const outline = buildOutline(steps, connections);
    const items = outline.items;
    const laneOf = (s: ProcessStep) => getLaneKey(s, grouping);
    const mine = items.map((it, i) => (laneOf(it.step) === lane ? i : -1)).filter((i) => i >= 0);
    const mineIds = new Set(mine.map((i) => items[i].step.id));

    const ins = new Map<string, ProcessConnection[]>();
    const outs = new Map<string, ProcessConnection[]>();
    for (const c of connections) {
      if (!outline.byId.has(c.fromStepId) || !outline.byId.has(c.toStepId)) continue;
      ins.set(c.toStepId, [...(ins.get(c.toStepId) ?? []), c]);
      outs.set(c.fromStepId, [...(outs.get(c.fromStepId) ?? []), c]);
    }
    const other = (id: string, label: string): Other => ({ item: outline.byId.get(id)!, label });

    const entries: Entry[] = mine.map((i, k) => {
      const item = items[i];
      const id = item.step.id;
      const incoming = ins.get(id) ?? [];
      const prevMine = k > 0 ? items[mine[k - 1]].step.id : null;
      const triggers = (outs.get(id) ?? [])
        .filter((c) => !mineIds.has(c.toStepId) && isApp(outline.byId.get(c.toStepId)!.step.performedBy))
        .map((c) => other(c.toStepId, c.label));
      const shown = new Set(triggers.map((t) => t.item.step.id));
      const nextMine = k < mine.length - 1 ? mine[k + 1] : null;
      return {
        item,
        startsAfter: incoming.filter((c) => !mineIds.has(c.fromStepId)).map((c) => other(c.fromStepId, c.label)),
        rightAfter: !!prevMine && incoming.some((c) => c.fromStepId === prevMine),
        triggers,
        meanwhile: nextMine == null ? [] : items.slice(i + 1, nextMine).filter((it) => !shown.has(it.step.id)),
      };
    });

    // After their last step: who picks the work up next (people only; apps
    // it sets off are already listed under the step).
    const last = mine[mine.length - 1];
    const after =
      last == null
        ? []
        : (outs.get(items[last].step.id) ?? [])
            .filter((c) => !mineIds.has(c.toStepId) && !isApp(outline.byId.get(c.toStepId)!.step.performedBy))
            .map((c) => other(c.toStepId, c.label));
    const remaining = last == null ? 0 : items.length - last - 1;

    return { outline, entries, after, remaining };
  }, [lane, grouping, steps, connections]);

  const total = outline.items.length;
  const mineSet = new Set(entries.map((e) => e.item.step.id));
  const first = entries[0]?.item.step.performedBy ?? null;
  const appNames = isAutomated
    ? [...new Set(entries.map((e) => e.item.step.performedBy?.name).filter(Boolean))].join(', ')
    : '';
  const subtitle = isAutomated ? `Run by ${appNames}` : grouping === 'app' ? 'App' : first?.typeName || '';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="space-y-0 border-b border-border px-6 pb-4 pt-5 text-left">
          <div className="flex items-center gap-3 pr-8">
            <Badge who={isAutomated ? null : first} automated={isAutomated} name={lane} />
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-lg">{lane}</DialogTitle>
              <DialogDescription className="mt-0.5 text-sm">
                {subtitle ? `${subtitle} · ` : ''}
                {entries.length} of {total} steps
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onCopyLink} className="shrink-0">
              <Link2 className="mr-1.5 h-3.5 w-3.5" /> Copy link
            </Button>
          </div>

          {/* Where their steps sit in the whole process. */}
          <div className="mt-4 flex gap-[3px]" aria-hidden="true">
            {outline.items.map((it) => (
              <span
                key={it.step.id}
                title={`${it.number}. ${titleOf(it.step)}`}
                className="h-1.5 flex-1 rounded-full"
                style={{
                  backgroundColor: mineSet.has(it.step.id)
                    ? first?.color || 'hsl(var(--primary))'
                    : 'hsl(var(--border))',
                }}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Their steps within the whole process</p>
        </DialogHeader>

        <div className="max-h-[calc(88vh-9rem)] overflow-y-auto px-6 py-5">
          <ol className="relative ml-2 border-l-2 border-border pl-6">
            {entries.map((e, k) => (
              <li key={e.item.step.id}>
                <StartsWhen entry={e} isFirst={k === 0} />
                <StepCard item={e.item} total={total} color={first?.color} onOpen={() => onOpenStep(e.item.step)} />
                {e.triggers.map((t) => (
                  <Event key={t.item.step.id} auto>
                    <Zap className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                    Then automatically · <b className="font-semibold">{t.item.step.performedBy?.name}</b> · {titleOf(t.item.step)}{' '}
                    <span className="text-muted-foreground">(step {t.item.number})</span>
                  </Event>
                ))}
                {e.meanwhile.length > 0 && <Meanwhile items={e.meanwhile} />}
              </li>
            ))}

            {after.map((a) => (
              <Event key={a.item.step.id}>
                Then <b className="font-semibold text-foreground">{a.item.step.performedBy?.name ?? 'Unassigned'}</b> ·{' '}
                {titleOf(a.item.step)} <span className="text-muted-foreground/70">(step {a.item.number}{a.label ? ` · ${a.label}` : ''})</span>
              </Event>
            ))}
            <Event muted>
              {remaining > 0
                ? `Their part ends here · ${remaining} more step${remaining === 1 ? '' : 's'} by others`
                : 'Their part ends the process'}
            </Event>
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Timeline pieces ---

/** A line on the timeline between cards, with a dot on the rail. */
function Event({ auto, muted, children }: { auto?: boolean; muted?: boolean; children: React.ReactNode }) {
  return (
    <p
      className={`relative my-3 text-sm before:absolute before:-left-[31px] before:top-1.5 before:h-2.5 before:w-2.5 before:rounded-full before:border-2 before:bg-background ${
        auto
          ? 'text-emerald-700 before:border-emerald-500 dark:text-emerald-400'
          : muted
          ? 'text-muted-foreground/70 before:border-border'
          : 'text-muted-foreground before:border-muted-foreground/50'
      }`}
    >
      {children}
    </p>
  );
}

function StartsWhen({ entry, isFirst }: { entry: Entry; isFirst: boolean }) {
  if (entry.rightAfter && entry.startsAfter.length === 0) return <Event>Right after</Event>;
  if (entry.startsAfter.length === 0) {
    return <Event>{entry.item.number === 1 ? 'Starts the process' : isFirst ? 'Starts on its own' : 'Then'}</Event>;
  }
  return (
    <>
      {entry.startsAfter.map((s) => {
        const auto = isApp(s.item.step.performedBy);
        return (
          <Event key={s.item.step.id} auto={auto}>
            Starts when {auto && <Zap className="inline h-3.5 w-3.5 align-[-2px]" />}{' '}
            <b className="font-semibold text-foreground">{s.item.step.performedBy?.name ?? 'Unassigned'}</b> · {titleOf(s.item.step)}{' '}
            <span className="text-muted-foreground/70">
              (step {s.item.number}
              {s.label ? ` · ${s.label}` : ''})
            </span>
          </Event>
        );
      })}
    </>
  );
}

function StepCard({ item, total, color, onOpen }: {
  item: OutlineItem;
  total: number;
  color?: string;
  onOpen: () => void;
}) {
  const { step } = item;
  const apps = [step.performedBy, ...step.uses].filter((e): e is ElementRef => !!e && isApp(e));
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
  const usedApps = apps.filter((a) => a.id !== step.performedBy?.id);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative my-3 block w-full rounded-xl border border-border bg-card px-4 py-3.5 text-left shadow-sm transition-colors hover:border-primary/50"
    >
      <span
        className="absolute -left-[33px] top-4 h-3.5 w-3.5 rounded-full ring-4 ring-background"
        style={{ backgroundColor: color || 'hsl(var(--primary))' }}
        aria-hidden="true"
      />
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">Step {item.number} of {total}</span>
        {item.branch && <span className="truncate rounded-full bg-muted px-2 py-0.5">{item.branch.label}</span>}
        {step.stepType === 'Decision' && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">Decision</span>
        )}
      </span>
      <span className="mt-1 block text-base font-semibold">{titleOf(step)}</span>

      {groups.length > 0 ? (
        <span className="mt-2 block space-y-2">
          {groups.map((g) => (
            <span key={g.app?.id ?? 'none'} className="block">
              {g.app && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <ElementIcon name={g.app.name} image={g.app.image} icon={g.app.icon} typeIcon={g.app.typeIcon} color={g.app.color} size={13} />
                  In {g.app.name}
                </span>
              )}
              {g.items.map((text, i) => (
                <span key={i} className={`block text-sm ${g.app ? 'pl-5' : ''}`}>
                  · {text}
                </span>
              ))}
            </span>
          ))}
        </span>
      ) : (
        usedApps.length > 0 && (
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {usedApps.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1.5">
                <ElementIcon name={a.name} image={a.image} icon={a.icon} typeIcon={a.typeIcon} color={a.color} size={13} />
                {a.name}
              </span>
            ))}
          </span>
        )
      )}
    </button>
  );
}

function Meanwhile({ items }: { items: OutlineItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative my-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-dashed border-border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
        aria-expanded={open}
      >
        <span>
          Meanwhile · {items.length} step{items.length === 1 ? '' : 's'} by others
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5 pl-3">
          {items.map((it) => {
            const auto = isApp(it.step.performedBy);
            return (
              <li key={it.step.id} className={`text-xs ${auto ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                <span className="tabular-nums">{it.number}</span> · {auto && <Zap className="inline h-3 w-3 align-[-2px]" />}{' '}
                <span className="font-medium">{it.step.performedBy?.name ?? 'Unassigned'}</span> · {titleOf(it.step)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Badge({ who, automated, name }: { who: ElementRef | null; automated: boolean; name: string }) {
  if (automated) {
    return (
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15">
        <Zap className="h-5 w-5" />
      </span>
    );
  }
  if (who && who.actorClass === 'System') {
    return (
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card">
        <ElementIcon name={who.name} image={who.image} icon={who.icon} typeIcon={who.typeIcon} color={who.color} size={20} />
      </span>
    );
  }
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return (
    <span
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
      style={{ backgroundColor: who?.color || 'hsl(var(--muted-foreground))' }}
    >
      {initials}
    </span>
  );
}
