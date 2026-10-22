import { useMemo } from 'react';
import { ArrowRight, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import type { ElementRef, ProcessConnection, ProcessStep } from '@/types';
import { AUTOMATED_LANE, getLaneKey, type LaneGrouping } from './SwimlaneDiagram';
import ElementIcon from './ElementIcon';

interface Props {
  lane: string;
  grouping: LaneGrouping;
  steps: ProcessStep[];
  connections: ProcessConnection[];
  onClose: () => void;
  onOpenStep: (step: ProcessStep) => void;
}

interface Handoff {
  key: string;
  /** Who's on the other end: a person, or the app itself, never "Automated". */
  who: string;
  whoRef: ElementRef | null;
  from: string;
  to: string;
}

interface StepGroup {
  /** The app running these steps, in the automated lane; null otherwise. */
  app: ElementRef | null;
  steps: ProcessStep[];
}

const isApp = (e: ElementRef | null | undefined): e is ElementRef => e?.actorClass === 'System';

/**
 * One lane at a glance, in the middle of the screen: what this person (or
 * app) does here, in order, who they get work from and pass it to, and the
 * tools involved. Automated work is always named by the app doing it.
 */
export default function LaneDialog({ lane, grouping, steps, connections, onClose, onOpenStep }: Props) {
  const isAutomated = grouping === 'people' && lane === AUTOMATED_LANE;

  const { mine, groups, incoming, outgoing, tally } = useMemo(() => {
    const laneOf = (s: ProcessStep) => getLaneKey(s, grouping);
    // The automated lane is a shared home; for a handoff, name the app.
    const whoOf = (s: ProcessStep) =>
      laneOf(s) === AUTOMATED_LANE && s.performedBy ? s.performedBy.name : laneOf(s);
    const whoRefOf = (s: ProcessStep) => (laneOf(s) === AUTOMATED_LANE || grouping === 'people' ? s.performedBy : null);

    const byId = new Map(steps.map((s) => [s.id, s]));
    const mine = steps.filter((s) => laneOf(s) === lane);
    const mineIds = new Set(mine.map((s) => s.id));

    const groups: StepGroup[] = [];
    if (isAutomated) {
      for (const s of mine) {
        const app = s.performedBy;
        const group = groups.find((g) => g.app?.id === app?.id);
        if (group) group.steps.push(s);
        else groups.push({ app, steps: [s] });
      }
    } else {
      groups.push({ app: null, steps: mine });
    }

    const incoming: Handoff[] = [];
    const outgoing: Handoff[] = [];
    for (const c of connections) {
      const from = byId.get(c.fromStepId);
      const to = byId.get(c.toStepId);
      if (!from || !to) continue;
      const key = c.id || `${from.id}->${to.id}`;
      if (mineIds.has(to.id) && !mineIds.has(from.id)) {
        incoming.push({ key, who: whoOf(from), whoRef: whoRefOf(from), from: from.title, to: to.title });
      } else if (mineIds.has(from.id) && !mineIds.has(to.id)) {
        outgoing.push({ key, who: whoOf(to), whoRef: whoRefOf(to), from: from.title, to: to.title });
      }
    }

    // A person's apps, or in an app lane, the people who use it.
    const counts = new Map<string, { ref: ElementRef; count: number }>();
    for (const s of mine) {
      const refs =
        grouping === 'app'
          ? s.performedBy && !isApp(s.performedBy) ? [s.performedBy] : []
          : s.uses.filter((u) => isApp(u) && u.id !== (isAutomated ? s.performedBy?.id : undefined));
      for (const ref of new Map(refs.map((r) => [r.id, r])).values()) {
        const entry = counts.get(ref.id) ?? { ref, count: 0 };
        entry.count += 1;
        counts.set(ref.id, entry);
      }
    }
    const tally = [...counts.values()].sort((a, b) => b.count - a.count);

    return { mine, groups, incoming, outgoing, tally };
  }, [lane, grouping, steps, connections, isAutomated]);

  const first = mine[0]?.performedBy ?? null;
  const subtitle = isAutomated
    ? `Run by ${groups.map((g) => g.app?.name).filter(Boolean).join(', ')}`
    : grouping === 'app'
    ? 'App'
    : first?.typeName || '';

  let number = 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="space-y-0 border-b border-border px-6 py-5 text-left">
          <div className="flex items-center gap-3">
            <Badge who={isAutomated ? null : first} automated={isAutomated} name={lane} />
            <div className="min-w-0">
              <DialogTitle className="truncate text-lg">{lane}</DialogTitle>
              <DialogDescription className="mt-0.5 text-sm">
                {subtitle ? `${subtitle} · ` : ''}
                {mine.length} step{mine.length === 1 ? '' : 's'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[calc(85vh-5.5rem)] space-y-7 overflow-y-auto px-6 py-5">
          <section>
            <SectionTitle>Steps</SectionTitle>
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.app?.id ?? 'all'}>
                  {g.app && (
                    <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                      <ElementIcon name={g.app.name} image={g.app.image} icon={g.app.icon} typeIcon={g.app.typeIcon} color={g.app.color} size={16} />
                      {g.app.name}
                      <span className="font-normal text-muted-foreground">
                        · {g.steps.length} step{g.steps.length === 1 ? '' : 's'}
                      </span>
                    </p>
                  )}
                  <ol>
                    {g.steps.map((s) => {
                      number += 1;
                      const apps = s.uses.filter((u) => isApp(u) && u.id !== s.performedBy?.id);
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => onOpenStep(s)}
                            className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted"
                          >
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                              {number}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.title}</span>
                            {apps.length > 0 && (
                              <span className="flex shrink-0 items-center gap-1.5">
                                {apps.slice(0, 3).map((a) => (
                                  <span key={a.id} title={a.name}>
                                    <ElementIcon name={a.name} image={a.image} icon={a.icon} typeIcon={a.typeIcon} color={a.color} size={14} />
                                  </span>
                                ))}
                              </span>
                            )}
                            {s.stepType === 'Decision' && (
                              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                Decision
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-7 sm:grid-cols-2">
            <section>
              <SectionTitle>Gets work from</SectionTitle>
              <HandoffList items={incoming} direction="in" empty="Starts its own work" />
            </section>
            <section>
              <SectionTitle>Passes work to</SectionTitle>
              <HandoffList items={outgoing} direction="out" empty="Where the work ends" />
            </section>
          </div>

          {tally.length > 0 && (
            <section>
              <SectionTitle>{grouping === 'app' ? 'People using it' : isAutomated ? 'Also connects to' : 'Apps used'}</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {tally.map(({ ref, count }) => (
                  <span key={ref.id} className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm">
                    <ElementIcon name={ref.name} image={ref.image} icon={ref.icon} typeIcon={ref.typeIcon} color={ref.color} size={14} />
                    {ref.name}
                    <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>;
}

function HandoffList({ items, direction, empty }: { items: Handoff[]; direction: 'in' | 'out'; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-3">
      {items.map((h) => (
        <li key={h.key}>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            {isApp(h.whoRef) && (
              <ElementIcon name={h.whoRef.name} image={h.whoRef.image} icon={h.whoRef.icon} typeIcon={h.whoRef.typeIcon} color={h.whoRef.color} size={14} />
            )}
            {h.who}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {h.from}
            <ArrowRight className="mx-1 inline h-3 w-3 align-[-2px]" />
            {h.to}
          </p>
        </li>
      ))}
    </ul>
  );
}
