import { useMemo } from 'react';
import { Bot, ChevronRight, GitBranch, Workflow } from 'lucide-react';
import type { GetBrainOutputType } from 'zitejs/api';

type Step = GetBrainOutputType['processes'][number]['steps'][number];
type Link = { from: string; to: string; label: string };

/** Steps in the order they happen: follow the arrows from the start, then anything left over. */
function ordered(steps: Step[], links: Link[]) {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const incoming = new Set(links.map((l) => l.to));
  const queue = steps.filter((s) => !incoming.has(s.id)).map((s) => s.id);
  const seen = new Set<string>();
  const out: Step[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    out.push(byId.get(id)!);
    for (const l of links) if (l.from === id && !seen.has(l.to)) queue.push(l.to);
  }
  for (const s of steps) if (!seen.has(s.id)) out.push(s);
  return out;
}

/** A phone-friendly version of the process map: one tappable card per step, top to bottom. */
export default function MobileSteps({ steps, links, onOpen }: { steps: Step[]; links: Link[]; onOpen: (id: string) => void }) {
  const list = useMemo(() => ordered(steps, links), [steps, links]);
  const titles = useMemo(() => new Map(steps.map((s) => [s.id, s.title])), [steps]);
  return (
    <ol className="relative space-y-3 pb-8">
      <span className="absolute bottom-8 left-[19px] top-4 w-px bg-border" aria-hidden="true" />
      {list.map((s, i) => {
        const branches = links.filter((l) => l.from === s.id && l.label);
        return (
          <li key={s.id} className="relative flex gap-3">
            <span className={`z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-background text-sm font-semibold shadow-sm ${s.stepType === 'Decision' ? 'bg-amber-100 text-amber-800' : s.automated ? 'bg-primary/15 text-primary' : 'bg-card text-foreground ring-1 ring-border'}`}>
              {s.stepType === 'Decision' ? <GitBranch className="h-4 w-4" /> : s.automated ? <Bot className="h-4 w-4" /> : i + 1}
            </span>
            <button
              type="button"
              onClick={() => onOpen(s.id)}
              className="min-w-0 flex-1 rounded-xl border border-border bg-card p-3.5 text-left shadow-sm active:bg-muted/60"
            >
              <span className="flex items-start gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium leading-snug">{s.title || 'Untitled step'}</span>
                  <span className="mt-1 block text-[13px] text-muted-foreground">
                    {s.who ? s.who.name : 'Not assigned'}
                    {s.minutes ? ` · ${s.minutes} min` : ''}
                  </span>
                </span>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              </span>
              {s.uses.length > 0 && (
                <span className="mt-2 flex flex-wrap gap-1">
                  {s.uses.map((u) => (
                    <span key={u.id} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium">{u.name}</span>
                  ))}
                </span>
              )}
              {s.subProcessId && (
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary"><Workflow className="h-3.5 w-3.5" /> Runs another process</span>
              )}
              {branches.length > 0 && (
                <span className="mt-2 block space-y-0.5 border-t border-border pt-2 text-xs text-muted-foreground">
                  {branches.map((b) => (
                    <span key={b.to + b.label} className="block truncate">
                      <span className="font-medium text-foreground">{b.label}</span> → {titles.get(b.to) || 'next step'}
                    </span>
                  ))}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
