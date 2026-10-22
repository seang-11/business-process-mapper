import { GetProcessesOutputType } from 'zitejs/api';
import { GraduationCap, Layers, Rocket, Sparkles, Target, Workflow, Compass, ArrowRight } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import ElementIcon from './ElementIcon';

type ProcessRow = GetProcessesOutputType['processes'][number];

interface Props {
  processes: ProcessRow[];
  /** Open the process on the map. */
  onOpen: (id: string) => void;
  /** Start training for the process, from the big picture. */
  onTrain: (id: string) => void;
}

// Each process gets its own colour and icon, picked from its name so they stay put.
const TINTS = [
  { fg: 'hsl(217 65% 42%)', bg: 'hsl(217 90% 95%)' },
  { fg: 'hsl(262 55% 48%)', bg: 'hsl(262 80% 96%)' },
  { fg: 'hsl(152 55% 32%)', bg: 'hsl(152 60% 94%)' },
  { fg: 'hsl(24 80% 42%)', bg: 'hsl(24 95% 94%)' },
  { fg: 'hsl(336 65% 46%)', bg: 'hsl(336 85% 96%)' },
  { fg: 'hsl(188 70% 30%)', bg: 'hsl(188 65% 93%)' },
];
const ICONS = [Workflow, Rocket, Sparkles, Layers, Target, Compass];

const hashOf = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Where a process stands: the way it's done today, or still being drafted. */
function statusOf(p: ProcessRow): { label: string; className: string; title: string } {
  const live = p.versions.find((v) => v.state === 'Current');
  if (live) {
    return {
      label: 'Live',
      className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
      title: live.liveFrom ? `Live since ${live.liveFrom}` : 'How the work is done today',
    };
  }
  return {
    label: 'Draft',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    title: 'Not live yet',
  };
}

/** Processes as friendly cards: what it is, who's in it, what it runs on, and a way straight into training. */
export default function ProcessCards({ processes, onOpen, onTrain }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {processes.map((p) => {
        const h = hashOf(p.name);
        const tint = TINTS[h % TINTS.length];
        const Icon = ICONS[h % ICONS.length];
        const status = statusOf(p);
        const people = p.people;
        const shownApps = p.apps.slice(0, 6);
        const hasSteps = p.stepCount > 0;

        return (
          <article
            key={p.id}
            role="link"
            tabIndex={0}
            onClick={() => onOpen(p.id)}
            onKeyDown={(e) => e.key === 'Enter' && onOpen(p.id)}
            className="group flex cursor-pointer flex-col rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]"
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: tint.bg, color: tint.fg }}
              >
                <Icon className="h-6 w-6" />
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${status.className}`}
                title={status.title}
              >
                {status.label}
              </span>
            </div>

            <h3 className="mt-4 break-words text-base font-semibold leading-snug tracking-tight">{p.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasSteps ? `${plural(p.stepCount, 'step')} · ${plural(people.length, 'role')}` : 'No steps yet'}
            </p>
            {p.description && (
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{p.description}</p>
            )}

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex items-center">
                <div className="flex -space-x-1.5">
                  {people.slice(0, 5).map((person) => {
                    const t = TINTS[hashOf(person.name) % TINTS.length];
                    return (
                      <span
                        key={person.id}
                        title={person.name}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-card"
                        style={{ backgroundColor: t.bg, color: t.fg }}
                      >
                        {initials(person.name)}
                      </span>
                    );
                  })}
                </div>
                {people.length > 5 && (
                  <span className="ml-1.5 text-[11px] text-muted-foreground">+{people.length - 5}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {shownApps.map((a) => (
                  <span key={a.id} title={a.name} className="rounded-md border border-border bg-background p-1">
                    <ElementIcon name={a.name} image={a.image} icon={a.icon} typeIcon={a.typeIcon} color={a.color} size={14} />
                  </span>
                ))}
                {p.apps.length > shownApps.length && (
                  <span className="text-[11px] text-muted-foreground">+{p.apps.length - shownApps.length}</span>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 flex-1 font-medium"
                disabled={!hasSteps}
                onClick={(e) => {
                  e.stopPropagation();
                  onTrain(p.id);
                }}
              >
                <GraduationCap className="mr-1.5 h-4 w-4" /> Start training
              </Button>
              <span className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true">
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
