import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { GetBrainOutputType } from 'zitejs/api';
import { deptTag } from '@/lib/deptColors';
import { processIcon } from '@/lib/processIcon';

/** The Brain on a phone: every department as a tappable section, each process one tap from its steps. */
export default function MobileBrain({ data }: { data: GetBrainOutputType }) {
  const navigate = useNavigate();
  const hues = new Map(data.departments.map((d) => [d.name, d.hue]));
  const depts = [...new Set(data.processes.map((p) => p.department || ''))].sort((a, b) =>
    a === '' ? 1 : b === '' ? -1 : a.localeCompare(b),
  );
  const [open, setOpen] = useState<string | null>(depts[0] ?? null);
  const apps = new Set(data.processes.flatMap((p) => p.apps.map((a) => a.id))).size;
  const steps = data.processes.reduce((n, p) => n + p.stepCount, 0);

  return (
    <div className="space-y-4 px-4 py-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">The Brain</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every department and the processes it runs. Tap one to see its steps.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          ['Processes', data.processes.length],
          ['Steps', steps],
          ['Apps', apps],
        ].map(([label, n]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-lg font-semibold">{n}</p>
            <p className="text-[11px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      {depts.map((d) => {
        const procs = data.processes.filter((p) => (p.department || '') === d).sort((a, b) => a.name.localeCompare(b.name));
        const isOpen = open === d;
        const hue = d ? hues.get(d) : undefined;
        return (
          <section key={d || '~'} className="overflow-hidden rounded-xl border border-border bg-card">
            <button type="button" onClick={() => setOpen(isOpen ? null : d)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
              <span className="rounded-full px-2.5 py-0.5 text-[13px] font-semibold" style={deptTag(hue)}>{d || 'Other'}</span>
              <span className="text-xs text-muted-foreground">{procs.length}</span>
              <ChevronDown className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <ul className="divide-y divide-border border-t border-border">
                {procs.map((p) => {
                  const Icon = processIcon(p);
                  return (
                    <li key={p.id}>
                      <button type="button" onClick={() => navigate(`/view/${p.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted/60">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={deptTag(hue)}>
                          <Icon className="h-4 w-4" strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{p.name}</span>
                          <span className="block text-xs text-muted-foreground">{p.stepCount} steps</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
