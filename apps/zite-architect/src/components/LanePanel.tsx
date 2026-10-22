import { useMemo } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import type { ElementRef, ProcessConnection, ProcessStep } from '@/types';
import { AUTOMATED_LANE, getLaneKey, type LaneGrouping } from './SwimlaneDiagram';
import ElementIcon from './ElementIcon';
import IconStack from './IconStack';

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
  otherLane: string;
  otherTitle: string;
  ownTitle: string;
}

const isApp = (e: ElementRef | null | undefined): e is ElementRef => e?.actorClass === 'System';

/**
 * One lane at a glance: what this person (or app) does in the process, in
 * order, who they get work from and hand it to, and which tools they touch.
 * Docks where the step editor does, so the map stays in view beside it.
 */
export default function LanePanel({ lane, grouping, steps, connections, onClose, onOpenStep }: Props) {
  const isAutomated = grouping === 'people' && lane === AUTOMATED_LANE;

  const { mine, incoming, outgoing, tally } = useMemo(() => {
    const laneOf = (s: ProcessStep) => getLaneKey(s, grouping);
    const byId = new Map(steps.map((s) => [s.id, s]));
    const mine = steps.filter((s) => laneOf(s) === lane);
    const mineIds = new Set(mine.map((s) => s.id));

    // A handoff is an arrow that crosses into or out of this lane.
    const incoming: Handoff[] = [];
    const outgoing: Handoff[] = [];
    for (const c of connections) {
      const from = byId.get(c.fromStepId);
      const to = byId.get(c.toStepId);
      if (!from || !to) continue;
      if (mineIds.has(to.id) && !mineIds.has(from.id)) {
        incoming.push({ key: c.id || `${from.id}->${to.id}`, otherLane: laneOf(from), otherTitle: from.title, ownTitle: to.title });
      } else if (mineIds.has(from.id) && !mineIds.has(to.id)) {
        outgoing.push({ key: c.id || `${from.id}->${to.id}`, otherLane: laneOf(to), otherTitle: to.title, ownTitle: from.title });
      }
    }

    // People lanes list the apps they use; the automated lane also counts the
    // apps doing the work; an app lane lists the people who use it.
    const counts = new Map<string, { ref: ElementRef; count: number }>();
    for (const s of mine) {
      const refs =
        grouping === 'app'
          ? s.performedBy && !isApp(s.performedBy) ? [s.performedBy] : []
          : [...(isAutomated && s.performedBy ? [s.performedBy] : []), ...s.uses].filter(isApp);
      for (const ref of new Map(refs.map((r) => [r.id, r])).values()) {
        const entry = counts.get(ref.id) ?? { ref, count: 0 };
        entry.count += 1;
        counts.set(ref.id, entry);
      }
    }
    const tally = [...counts.values()].sort((a, b) => b.count - a.count);

    return { mine, incoming, outgoing, tally };
  }, [lane, grouping, steps, connections, isAutomated]);

  const typeLine = isAutomated
    ? 'Run by apps'
    : grouping === 'app'
    ? 'App'
    : mine[0]?.performedBy?.typeName || '';
  const color = !isAutomated ? mine[0]?.performedBy?.color : undefined;

  return (
    <aside
      role="dialog"
      aria-label={lane}
      className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[26rem] shrink-0 flex-col border-l border-border bg-background shadow-xl lg:static lg:shadow-none"
    >
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
            <span className="truncate">{lane}</span>
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {typeLine ? `${typeLine} · ` : ''}
            {mine.length} step{mine.length === 1 ? '' : 's'} in this process
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
        <section>
          <SectionTitle>Steps</SectionTitle>
          <ol className="space-y-0.5">
            {mine.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onOpenStep(s)}
                  className="flex w-full gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug">{s.title}</span>
                    {s.uses.some(isApp) && (
                      <span className="mt-1.5 flex">
                        <IconStack items={s.uses.filter(isApp)} size={12} max={6} />
                      </span>
                    )}
                  </span>
                  {s.stepType === 'Decision' && (
                    <span className="h-fit shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      Decision
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <SectionTitle>Gets work from</SectionTitle>
          <HandoffList items={incoming} direction="in" empty="Nobody. This lane starts its own work." />
        </section>

        <section>
          <SectionTitle>Hands work to</SectionTitle>
          <HandoffList items={outgoing} direction="out" empty="Nobody. The work ends here." />
        </section>

        {tally.length > 0 && (
          <section>
            <SectionTitle>{grouping === 'app' ? 'People using it' : 'Apps used'}</SectionTitle>
            <ul className="space-y-1.5">
              {tally.map(({ ref, count }) => (
                <li key={ref.id} className="flex items-center gap-2 text-sm">
                  <ElementIcon
                    name={ref.name}
                    image={ref.image}
                    icon={ref.icon}
                    typeIcon={ref.typeIcon}
                    color={ref.color}
                    size={16}
                  />
                  <span className="min-w-0 flex-1 truncate">{ref.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {count} step{count === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

function HandoffList({ items, direction, empty }: { items: Handoff[]; direction: 'in' | 'out'; empty: string }) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((h) => (
        <li key={h.key} className="rounded-md border border-border px-3 py-2">
          <p className="text-xs font-semibold">{h.otherLane}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{direction === 'in' ? h.otherTitle : h.ownTitle}</span>
            <ArrowRight className="h-3 w-3 shrink-0" />
            <span className="min-w-0 truncate">{direction === 'in' ? h.ownTitle : h.otherTitle}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
