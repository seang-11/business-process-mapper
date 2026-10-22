import { GetProcessesOutputType } from 'zitejs/api';
import { GraduationCap, Workflow } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { tintFor, initialsOf } from '@/lib/tints';
import ElementIcon from './ElementIcon';

type ProcessRow = GetProcessesOutputType['processes'][number];

interface Props {
  processes: ProcessRow[];
  onOpen: (id: string) => void;
  onTrain: (id: string) => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface Column {
  key: string;
  title: string;
  hint: string;
  dot: string;
  items: ProcessRow[];
}

/**
 * Processes laid out in columns by where they stand: still a draft, live today,
 * or live with a newer version on the way. Nothing to drag; where a process sits
 * comes from its versions, so the board is always true.
 */
export default function ProcessBoard({ processes, onOpen, onTrain }: Props) {
  const isLive = (p: ProcessRow) => p.versions.some((v) => v.state === 'Current');
  const hasNext = (p: ProcessRow) => p.versions.some((v) => v.state === 'Future');

  const columns: Column[] = [
    {
      key: 'draft',
      title: 'Draft',
      hint: 'Not live yet',
      dot: 'hsl(38 92% 50%)',
      items: processes.filter((p) => !isLive(p)),
    },
    {
      key: 'live',
      title: 'Live',
      hint: 'How the work is done today',
      dot: 'hsl(152 55% 42%)',
      items: processes.filter((p) => isLive(p) && !hasNext(p)),
    },
    {
      key: 'next',
      title: 'Update on the way',
      hint: 'Live now, with a new version being prepared',
      dot: 'hsl(217 80% 55%)',
      items: processes.filter((p) => isLive(p) && hasNext(p)),
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {columns.map((col) => (
        <section key={col.key} className="rounded-2xl bg-muted/50 p-3">
          <header className="flex items-center gap-2 px-1.5 pb-3 pt-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.dot }} />
            <h3 className="text-sm font-semibold">{col.title}</h3>
            <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
              {col.items.length}
            </span>
            <span className="ml-auto hidden truncate text-[11px] text-muted-foreground xl:inline">{col.hint}</span>
          </header>

          <div className="space-y-3">
            {col.items.length === 0 && (
              <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
                Nothing here right now.
              </p>
            )}
            {col.items.map((p) => {
              const tint = tintFor(p.name);
              return (
                <article
                  key={p.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => onOpen(p.id)}
                  onKeyDown={(e) => e.key === 'Enter' && onOpen(p.id)}
                  className="group cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_6px_18px_rgba(16,24,40,0.08)]"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: tint.bg, color: tint.fg }}
                    >
                      <Workflow className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold leading-tight">{p.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {p.stepCount > 0 ? `${plural(p.stepCount, 'step')} · ${plural(p.people.length, 'role')}` : 'No steps yet'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex -space-x-1.5">
                      {p.people.slice(0, 4).map((person) => {
                        const t = tintFor(person.name);
                        return (
                          <span
                            key={person.id}
                            title={person.name}
                            className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold ring-2 ring-card"
                            style={{ backgroundColor: t.bg, color: t.fg }}
                          >
                            {initialsOf(person.name)}
                          </span>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-1">
                      {p.apps.slice(0, 4).map((a) => (
                        <span key={a.id} title={a.name} className="rounded border border-border bg-background p-0.5">
                          <ElementIcon name={a.name} image={a.image} icon={a.icon} typeIcon={a.typeIcon} color={a.color} size={12} />
                        </span>
                      ))}
                      {p.apps.length > 4 && <span className="text-[10px] text-muted-foreground">+{p.apps.length - 4}</span>}
                    </div>
                  </div>

                  {p.stepCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-mb-1 mt-2 h-7 w-full justify-start px-1 text-xs text-muted-foreground hover:text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTrain(p.id);
                      }}
                    >
                      <GraduationCap className="mr-1.5 h-3.5 w-3.5" /> Start training
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
