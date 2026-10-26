import { useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import { HEAT_PALETTES, heatPalette } from '@/lib/heatPalettes';

export interface HeatProc {
  id: string;
  name: string;
  /** People hours a month, or null until it has runs and minutes. */
  hours: number | null;
  /** Share of its working steps an app does on its own, 0 to 100. */
  autoPct: number;
  /** The team steps that take the longest, longest first. */
  topSteps: string[];
}

export interface HeatDept {
  /** The department's name, or '' for processes with none. */
  name: string;
  hue: number;
  procs: HeatProc[];
}

const HEAT_KEY = 'bpm_heat_color';

const fmt = (h: number) => (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10);
const sumHours = (procs: HeatProc[]) => procs.reduce((n, p) => n + (p.hours ?? 0), 0);

/**
 * Which process eats the most time: every process as a bar, grouped by
 * department, busiest department first. A bar's length and color both show
 * its people hours a month, measured against the biggest process anywhere,
 * so bars compare across departments. Processes with no estimate sit gray at
 * the bottom of their department, so you know what to fill in.
 */
export default function BrainHeat({ depts, palette, onPickPalette, onOpenProcess, onOpenDept }: {
  depts: HeatDept[];
  /** The color scale's id. */
  palette: string;
  /** Admins only: also save the pick as everyone's default. */
  onPickPalette?: (id: string) => void;
  onOpenProcess: (id: string) => void;
  onOpenDept: (name: string) => void;
}) {
  const all = depts.flatMap((d) => d.procs);
  const max = Math.max(0, ...all.map((p) => p.hours ?? 0));
  const level = (h: number) => Math.min(4, Math.max(0, Math.ceil((h / max) * 5) - 1));
  const total = sumHours(all);

  // Anyone can pick a color for themselves; an admin's pick is also the default for everyone.
  const [mine, setMine] = useState<string | null>(() => {
    try {
      return localStorage.getItem(HEAT_KEY);
    } catch {
      return null;
    }
  });
  const current = heatPalette(mine ?? palette);
  const pick = (id: string) => {
    setMine(id);
    try {
      localStorage.setItem(HEAT_KEY, id);
    } catch {
      /* private mode: the pick lasts until the page closes */
    }
    onPickPalette?.(id);
  };
  const SCALE = current.steps;

  const range = (i: number) =>
    i === 0 ? `Up to ${fmt(max / 5)}` : i === 4 ? `${fmt((max * 4) / 5)}+` : `${fmt((max * i) / 5)} to ${fmt((max * (i + 1)) / 5)}`;

  // Busiest department first; inside each, biggest process first and unestimated ones last.
  const groups = depts
    .map((d) => ({
      ...d,
      hours: sumHours(d.procs),
      procs: [...d.procs].sort((a, b) => (b.hours ?? -1) - (a.hours ?? -1) || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));

  return (
    <div data-ui className="absolute inset-0 z-10 cursor-default overflow-y-auto bg-[hsl(220_20%_97.5%)] px-4 pb-8 pt-20 sm:px-6">
      <div className="mx-auto max-w-4xl">
        {/* Top: the total, then the color key with the color picker beside it. */}
        <p className="text-sm text-muted-foreground">
          <span className="mr-1.5 text-3xl font-semibold tabular-nums text-foreground">{fmt(total)}</span>
          people hours a month
        </p>
        {max > 0 && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="flex min-w-[260px] flex-1 gap-0.5">
              {SCALE.map((st, i) => (
                <div key={i} className="flex-1">
                  <span
                    className={`block h-3 ${i === 0 ? 'rounded-l-full' : ''} ${i === 4 ? 'rounded-r-full' : ''}`}
                    style={{ background: st.bg }}
                  />
                  <span className="mt-1 block text-xs tabular-nums text-muted-foreground">{range(i)} hrs</span>
                </div>
              ))}
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Palette className="h-3.5 w-3.5" /> Color
                </button>
              </PopoverTrigger>
              <PopoverContent data-ui align="end" className="w-60 p-2">
                <p className="px-2 pb-1.5 text-xs text-muted-foreground">
                  {onPickPalette ? 'Heat map color (also the default for everyone)' : 'Your heat map color'}
                </p>
                {HEAT_PALETTES.map((pal) => (
                  <button
                    key={pal.id}
                    type="button"
                    onClick={() => pick(pal.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span className="flex overflow-hidden rounded">
                      {pal.steps.map((st) => (
                        <span key={st.bg} className="h-3.5 w-5" style={{ background: st.bg }} />
                      ))}
                    </span>
                    <span className="flex-1">{pal.label}</span>
                    {current.id === pal.id && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        )}

        {max === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">
            No time estimates yet. Add runs per month and minutes per step to see where the hours go.
          </p>
        )}

        {/* One section per department, its processes ranked by hours. */}
        <div className="mt-6 space-y-5">
          {groups.map((d) => (
            <section key={d.name} className="rounded-xl border border-border bg-background p-2 shadow-sm">
              <button
                type="button"
                onClick={() => onOpenDept(d.name)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-semibold hover:bg-muted"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `hsl(${d.hue} 70% 50%)` }} />
                {d.name || 'No department'}
                <span className="ml-auto font-normal tabular-nums text-muted-foreground">{fmt(d.hours)} hrs a month</span>
              </button>
              <ul className="mt-1">
                {d.procs.map((p) => {
                  const st = p.hours ? SCALE[level(p.hours)] : null;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => onOpenProcess(p.id)}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-lg px-2 py-2.5 text-left hover:bg-muted sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_4.5rem_6rem]"
                      >
                        <span className="min-w-0">
                          <span className={`block truncate text-sm font-medium ${st ? 'text-foreground' : 'text-muted-foreground'}`}>{p.name}</span>
                          {st && p.topSteps.length > 0 && (
                            <span className="block truncate text-xs text-muted-foreground">Mostly {p.topSteps.join(' and ').toLowerCase()}</span>
                          )}
                        </span>
                        {/* The bar: on small screens it drops to its own line under the name. */}
                        <span className="order-last col-span-2 block h-3 rounded-full bg-muted sm:order-none sm:col-span-1">
                          {st && (
                            <span
                              className="block h-full rounded-full ring-1 ring-inset ring-black/5"
                              style={{ width: `${Math.max(2, (p.hours! / max) * 100)}%`, background: st.bg }}
                            />
                          )}
                        </span>
                        <span className={`text-right text-sm tabular-nums ${st ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                          {st ? `${fmt(p.hours!)} hrs` : 'No estimate yet'}
                        </span>
                        <span className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">
                          {st ? `${p.autoPct}% by apps` : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
