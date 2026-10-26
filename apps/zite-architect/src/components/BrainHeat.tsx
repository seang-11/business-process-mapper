import { useLayoutEffect, useRef, useState } from 'react';
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
/** Room for a department's name above its blocks. */
const HEAD = 28;
const GAP = 4;

const fmt = (h: number) => (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10);

interface Rect { x: number; y: number; w: number; h: number }

/**
 * Lay out blocks so each one's area matches its value, keeping them as close to
 * square as it can (the "squarified" treemap): fill a row along the short side
 * until adding another block would make the row's shapes worse, then start a new row.
 */
function squarify<T>(items: { v: number; item: T }[], box: Rect): (Rect & { item: T })[] {
  const total = items.reduce((n, i) => n + i.v, 0);
  if (!total || box.w <= 0 || box.h <= 0) return [];
  const scale = (box.w * box.h) / total;
  let rest = [...items].sort((a, b) => b.v - a.v).map((i) => ({ ...i, a: i.v * scale }));
  let { x, y, w, h } = box;
  const out: (Rect & { item: T })[] = [];
  while (rest.length) {
    const side = Math.min(w, h);
    let row: typeof rest = [];
    let best = Infinity;
    for (const it of rest) {
      const next = [...row, it];
      const sum = next.reduce((n, i) => n + i.a, 0);
      const big = Math.max(...next.map((i) => i.a));
      const small = Math.min(...next.map((i) => i.a));
      const worst = Math.max((side * side * big) / (sum * sum), (sum * sum) / (side * side * small));
      if (worst > best) break;
      best = worst;
      row = next;
    }
    const sum = row.reduce((n, i) => n + i.a, 0);
    if (w >= h) {
      const cw = sum / h;
      let cy = y;
      for (const i of row) {
        out.push({ x, y: cy, w: cw, h: i.a / cw, item: i.item });
        cy += i.a / cw;
      }
      x += cw;
      w -= cw;
    } else {
      const rh = sum / w;
      let cx = x;
      for (const i of row) {
        out.push({ x: cx, y, w: i.a / rh, h: rh, item: i.item });
        cx += i.a / rh;
      }
      y += rh;
      h -= rh;
    }
    rest = rest.slice(row.length);
  }
  return out;
}

/**
 * Where the people hours go, as blocks: every process is a block whose size and
 * color show its hours a month, grouped by department, with a bar for how much
 * apps already do. A big, dark block with a short bar is the next thing to automate.
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
  const total = all.reduce((n, p) => n + (p.hours ?? 0), 0);
  const unestimated = all.filter((p) => !p.hours);

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
  const [focus, setFocus] = useState<HeatProc | null>(null);

  // The blocks fill whatever room the screen gives them.
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [max]);

  const groups = squarify(
    depts
      .map((d) => ({ d, procs: d.procs.filter((p) => p.hours) }))
      .filter((g) => g.procs.length)
      .map((g) => ({ v: g.procs.reduce((n, p) => n + p.hours!, 0), item: g })),
    { x: 0, y: 0, w: size.w, h: size.h },
  );

  const range = (i: number) =>
    i === 0 ? `Up to ${fmt(max / 5)}` : i === 4 ? `${fmt((max * 4) / 5)}+` : `${fmt((max * i) / 5)} to ${fmt((max * (i + 1)) / 5)}`;

  return (
    <div data-ui className="absolute inset-0 z-10 flex cursor-default flex-col bg-[hsl(220_20%_97.5%)] px-6 pb-5 pt-20">
      {max === 0 ? (
        <p className="mt-16 text-center text-sm text-muted-foreground">
          No time estimates yet. Add runs per month and minutes per step to see where the hours go.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              <span className="mr-1.5 text-3xl font-semibold tabular-nums text-foreground">{fmt(total)}</span>
              people hours a month
            </p>
            <p className="text-sm text-muted-foreground">Bigger and darker = more hours</p>
          </div>

          <div ref={box} className="relative min-h-[320px] flex-1">
            {groups.map((g) => {
              const { d, procs } = g.item;
              const inner = { w: g.w - 2 * GAP, h: g.h - 2 * GAP - HEAD };
              const blocks = squarify(procs.map((p) => ({ v: p.hours!, item: p })), { x: 0, y: 0, ...inner });
              return (
                <div
                  key={d.name}
                  className="absolute"
                  style={{ left: g.x + GAP, top: g.y + GAP, width: g.w - 2 * GAP, height: g.h - 2 * GAP }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenDept(d.name)}
                    className="flex max-w-full items-center gap-2 overflow-hidden whitespace-nowrap rounded-md px-1 text-sm font-semibold hover:bg-muted"
                    style={{ height: HEAD - 4 }}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `hsl(${d.hue} 70% 50%)` }} />
                    {d.name || 'No department'}
                    <span className="font-normal tabular-nums text-muted-foreground">{fmt(procs.reduce((n, p) => n + p.hours!, 0))} hrs</span>
                  </button>
                  {blocks.map((b) => {
                    const p = b.item;
                    const s = SCALE[level(p.hours!)];
                    const roomy = b.w > 170 && b.h > 110;
                    const fits = b.w > 80 && b.h > 44;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        title={`${p.name} · ${fmt(p.hours!)} hrs a month`}
                        onClick={() => onOpenProcess(p.id)}
                        onMouseEnter={() => setFocus(p)}
                        onFocus={() => setFocus(p)}
                        className="absolute overflow-hidden rounded-xl text-left transition-[filter,transform] duration-150 hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
                        style={{ left: b.x + 1.5, top: HEAD + b.y + 1.5, width: b.w - 3, height: b.h - 3, background: s.bg, color: s.fg }}
                      >
                        {fits && (
                          <span className={`block ${roomy ? 'p-4' : 'p-2.5'}`}>
                            <span className={`block font-semibold leading-snug ${roomy ? 'text-[15px]' : 'text-xs'}`}>{p.name}</span>
                            {b.h > 72 && (
                              <span className={`mt-1 block font-semibold tabular-nums ${roomy ? 'text-3xl' : 'text-lg'}`}>
                                {fmt(p.hours!)}
                                <span className="ml-1 text-xs font-normal">hrs/mo</span>
                              </span>
                            )}
                          </span>
                        )}
                        {roomy && (
                          <span className="absolute inset-x-4 bottom-3 block text-[11px]">
                            <span className="mb-1 block h-1 overflow-hidden rounded-full bg-white/45">
                              <span className="block h-full rounded-full" style={{ width: `${p.autoPct}%`, background: s.fg }} />
                            </span>
                            {p.autoPct}% done by apps
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div className="flex min-w-[280px] flex-1 gap-0.5">
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

          <p className="mt-3 min-h-[20px] text-sm text-muted-foreground">
            {focus ? (
              <>
                <span className="font-semibold text-foreground">{focus.name}</span> takes {fmt(focus.hours!)} people hours a month
                {focus.topSteps.length > 0 ? <>, mostly {focus.topSteps.join(' and ').toLowerCase()}.</> : '.'}{' '}
                {focus.autoPct < 30 ? (
                  <span className="font-medium text-amber-700">Mostly done by hand. A good one to automate.</span>
                ) : (
                  'Apps already do a good share of it.'
                )}
              </>
            ) : (
              'Point at a block to see where its hours go. Click it to open it.'
            )}
            {unestimated.length > 0 && !focus && (
              <span className="ml-1">No time estimate yet: {unestimated.map((p) => p.name).join(', ')}.</span>
            )}
          </p>
        </>
      )}
    </div>
  );
}
