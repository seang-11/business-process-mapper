import { useState } from 'react';
import { Check, Flame, Palette } from 'lucide-react';
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

const fmt = (h: number) => (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10);

/**
 * The company as a heat map: every process in its department, colored by how
 * many people hours it takes a month, with a bar for how much apps already do.
 * A hot card with a short bar is the next thing worth automating.
 */
export default function BrainHeat({ depts, palette, onPickPalette, onOpenProcess, onOpenDept }: {
  depts: HeatDept[];
  /** The color scale's id. */
  palette: string;
  /** Admins only: pick the color scale for everyone. */
  onPickPalette?: (id: string) => void;
  onOpenProcess: (id: string) => void;
  onOpenDept: (name: string) => void;
}) {
  const all = depts.flatMap((d) => d.procs);
  const max = Math.max(0, ...all.map((p) => p.hours ?? 0));
  const level = (h: number) => Math.min(4, Math.max(0, Math.ceil((h / max) * 5) - 1));
  const total = all.reduce((n, p) => n + (p.hours ?? 0), 0);
  const deptHours = (d: HeatDept) => d.procs.reduce((n, p) => n + (p.hours ?? 0), 0);
  const sorted = [...depts].sort((x, y) => deptHours(y) - deptHours(x));
  const hottestDept = sorted[0];
  const hottest = [...all].sort((x, y) => (y.hours ?? 0) - (x.hours ?? 0))[0];
  const SCALE = heatPalette(palette).steps;
  const [focus, setFocus] = useState<HeatProc | null>(null);

  return (
    <div data-ui className="absolute inset-0 z-10 cursor-default overflow-y-auto bg-[hsl(220_20%_97.5%)]">
      <div className="mx-auto max-w-6xl px-6 pb-10 pt-20">
        {max === 0 ? (
          <p className="mt-16 text-center text-sm text-muted-foreground">
            No time estimates yet. Add runs per month and minutes per step to see where the hours go.
          </p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
              <div className="grid flex-1 grid-cols-3 gap-3">
                <Tile label="People hours a month" value={`${fmt(total)}`} />
                <Tile
                  label="Hottest department"
                  value={hottestDept.name || 'No department'}
                  extra={`${fmt(deptHours(hottestDept))} hrs`}
                />
                <Tile label="Biggest single drain" value={hottest.name} extra={`${fmt(hottest.hours ?? 0)} hrs`} />
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-background px-4 py-3">
              <span className="text-sm font-semibold">Hours a month</span>
              <div className="flex items-end gap-1">
                {SCALE.map((st, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span className="h-5 w-16 rounded-md" style={{ background: st.bg }} />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {i === 0 ? `Up to ${fmt(max / 5)}` : i === 4 ? `${fmt((max * 4) / 5)}+` : `${fmt((max * i) / 5)} to ${fmt((max * (i + 1)) / 5)}`}
                    </span>
                  </div>
                ))}
              </div>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-muted">
                  <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-foreground/60" />
                </span>
                Bar = share done by apps
              </span>
              {onPickPalette && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Palette className="h-3.5 w-3.5" /> Color
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-60 p-2">
                    <p className="px-2 pb-1.5 text-xs text-muted-foreground">Heat map color, for everyone</p>
                    {HEAT_PALETTES.map((pal) => (
                      <button
                        key={pal.id}
                        type="button"
                        onClick={() => onPickPalette(pal.id)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <span className="flex overflow-hidden rounded">
                          {pal.steps.map((st) => (
                            <span key={st.bg} className="h-3.5 w-5" style={{ background: st.bg }} />
                          ))}
                        </span>
                        <span className="flex-1">{pal.label}</span>
                        {heatPalette(palette).id === pal.id && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              )}
            </div>

            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
              {sorted.map((d) => (
                <div key={d.name} className="rounded-2xl border border-border bg-background p-3">
                  <button
                    type="button"
                    onClick={() => onOpenDept(d.name)}
                    className="mb-2 flex w-full items-center justify-between gap-2 rounded-md px-1 text-left text-sm hover:bg-muted"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <span className="h-2 w-2 rounded-full" style={{ background: `hsl(${d.hue} 70% 50%)` }} />
                      {d.name || 'No department'}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">{fmt(deptHours(d))} hrs/mo</span>
                  </button>
                  <div className="flex flex-col gap-1.5">
                    {[...d.procs]
                      .sort((x, y) => (y.hours ?? -1) - (x.hours ?? -1))
                      .map((p) => {
                        const s = p.hours ? SCALE[level(p.hours)] : null;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => onOpenProcess(p.id)}
                            onMouseEnter={() => setFocus(p)}
                            onFocus={() => setFocus(p)}
                            className={`rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-foreground/40 ${
                              s ? '' : 'bg-muted text-muted-foreground'
                            }`}
                            style={s ? { background: s.bg, color: s.fg } : undefined}
                          >
                            <span className="flex items-start justify-between gap-2">
                              <span className="text-[13px] font-semibold leading-snug">{p.name}</span>
                              {p.hours !== null && level(p.hours) === 4 && <Flame className="h-4 w-4 shrink-0" />}
                            </span>
                            {p.hours !== null ? (
                              <>
                                <span className="mt-0.5 block text-xl font-semibold tabular-nums">
                                  {fmt(p.hours)} <span className="text-xs font-normal">hrs a month</span>
                                </span>
                                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/55">
                                  <span className="block h-full rounded-full" style={{ width: `${p.autoPct}%`, background: s!.fg }} />
                                </span>
                                <span className="mt-1 block text-[11px]">{p.autoPct}% done by apps</span>
                              </>
                            ) : (
                              <span className="mt-1 block text-xs">No time estimate yet</span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
              {focus ? (
                focus.hours !== null ? (
                  <>
                    <span className="font-semibold text-foreground">{focus.name}</span> takes {fmt(focus.hours)} people hours a month.
                    {focus.topSteps.length > 0 && <> Most of it goes to {focus.topSteps.join(' and ').toLowerCase()}.</>}{' '}
                    {focus.autoPct < 30 ? (
                      <span className="font-medium text-amber-700">Mostly done by hand, a good one to automate.</span>
                    ) : (
                      'Apps already do a good share of it.'
                    )}
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-foreground">{focus.name}</span> has no time estimate yet.
                  </>
                )
              ) : (
                'Point at a process to see where its hours go. Click it to open it.'
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, extra }: { label: string; value: string; extra?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-background px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-lg font-semibold">
        {value} {extra && <span className="text-sm font-normal text-muted-foreground">{extra}</span>}
      </p>
    </div>
  );
}
