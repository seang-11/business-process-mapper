import { useMemo, useState } from 'react';
import { GetProcessesOutputType } from 'zitejs/api';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@project/components/ui/tooltip';
import { tintFor, initialsOf } from '@/lib/tints';
import ElementIcon from './ElementIcon';

type ProcessRow = GetProcessesOutputType['processes'][number];
type Participant = ProcessRow['apps'][number];

interface Props {
  processes: ProcessRow[];
  onOpen: (id: string) => void;
}

const SEG_TRACK = 'flex shrink-0 rounded-lg bg-muted p-0.5 text-xs';
const segBtn = (active: boolean) =>
  `rounded-md px-3 py-1 font-medium transition-all ${
    active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
  }`;

/**
 * Every process against every tool, or against every role: one glance shows
 * where a tool is used, who is involved where, and which tools or roles run
 * through the whole business.
 */
export default function ProcessGrid({ processes, onOpen }: Props) {
  const [by, setBy] = useState<'tools' | 'roles'>('tools');

  const columns = useMemo(() => {
    const counts = new Map<string, { item: Participant; count: number }>();
    for (const p of processes) {
      for (const x of by === 'tools' ? p.apps : p.people) {
        const found = counts.get(x.id);
        if (found) found.count += 1;
        else counts.set(x.id, { item: x, count: 1 });
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.item.name.localeCompare(b.item.name));
  }, [processes, by]);

  const used = (p: ProcessRow, id: string) => (by === 'tools' ? p.apps : p.people).some((x) => x.id === id);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className={SEG_TRACK}>
          <button className={segBtn(by === 'tools')} onClick={() => setBy('tools')}>Tools</button>
          <button className={segBtn(by === 'roles')} onClick={() => setBy('roles')}>Roles</button>
        </div>
        <p className="text-xs text-muted-foreground">
          {by === 'tools'
            ? 'Which tools each process runs on. The busiest tools are first.'
            : 'Who is involved in each process. The busiest roles are first.'}
        </p>
      </div>

      {columns.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          Nothing to show yet.
        </p>
      ) : (
        <TooltipProvider delayDuration={100}>
          <div className="overflow-auto rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <table className="border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 min-w-[220px] border-b border-border bg-card px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Process
                  </th>
                  {columns.map(({ item, count }) => (
                    <th key={item.id} className="sticky top-0 z-10 min-w-[64px] border-b border-border bg-card px-2 py-3 text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex flex-col items-center gap-1">
                            {by === 'tools' ? (
                              <ElementIcon name={item.name} image={item.image} icon={item.icon} typeIcon={item.typeIcon} color={item.color} size={22} />
                            ) : (
                              <span
                                className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold"
                                style={{ backgroundColor: tintFor(item.name).bg, color: tintFor(item.name).fg }}
                              >
                                {initialsOf(item.name)}
                              </span>
                            )}
                            <span className="text-[10px] font-normal tabular-nums text-muted-foreground">{count}</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {item.name} · in {count} process{count === 1 ? '' : 'es'}
                        </TooltipContent>
                      </Tooltip>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {processes.map((p) => (
                  <tr key={p.id} className="group cursor-pointer" onClick={() => onOpen(p.id)}>
                    <th className="sticky left-0 z-10 border-b border-border/70 bg-card px-4 py-3 text-left text-sm font-medium transition-colors group-hover:bg-muted">
                      {p.name}
                    </th>
                    {columns.map(({ item }) => (
                      <td key={item.id} className="border-b border-border/70 px-2 py-3 text-center transition-colors group-hover:bg-muted/60">
                        {used(p, item.id) ? (
                          <span
                            className="mx-auto block h-3 w-3 rounded-full"
                            style={{ backgroundColor: by === 'tools' ? 'hsl(var(--primary))' : tintFor(item.name).fg }}
                            aria-label={`${p.name} uses ${item.name}`}
                          />
                        ) : (
                          <span className="mx-auto block h-1 w-1 rounded-full bg-border" aria-hidden="true" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}
