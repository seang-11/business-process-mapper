import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Zap } from 'lucide-react';

export interface HeatStep {
  id: string;
  title: string;
  /** Minutes a person spends on it each run, or null until estimated. */
  minutes: number | null;
  /** Someone on the team spends time on it (not an app, a client, a wait, or another process). */
  team: boolean;
  automated: boolean;
  who: string;
  whoId: string;
  apps: string[];
}

export interface HeatDetail {
  id: string;
  name: string;
  dept: string;
  hue: number;
  hours: number | null;
  autoPct: number;
  runsPerMonth: number | null;
  steps: HeatStep[];
}

const fmt = (h: number) => (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10);

/** '#378ADD' and 0.4 → 'rgba(55,138,221,0.4)', so the heat color can show at any strength. */
const tint = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/**
 * One process seen the heat map's way: where its hours go, step by step and
 * person by person, what to automate first, and how the total is worked out.
 * Kept plain and on brand: a light card, a faint grid, the heat color only where it means something.
 */
export default function HeatProcess({ p, color, onClose }: { p: HeatDetail; color: string; onClose: () => void }) {
  // Everything grows in a beat after it opens.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const runs = p.runsPerMonth ?? 0;
  const perMonth = (min: number) => (min * runs) / 60;
  const team = p.steps.filter((s) => s.team);
  const timed = team.filter((s) => (s.minutes ?? 0) > 0);
  const missing = team.filter((s) => !s.minutes);
  const perRun = timed.reduce((n, s) => n + s.minutes!, 0);
  const biggest = Math.max(1, ...timed.map((s) => s.minutes!));

  // Hours by person.
  const byWho = new Map<string, { name: string; min: number }>();
  for (const s of timed) {
    const w = byWho.get(s.whoId) ?? { name: s.who, min: 0 };
    w.min += s.minutes!;
    byWho.set(s.whoId, w);
  }
  const people = [...byWho.values()].sort((a, b) => b.min - a.min);
  const topPerson = Math.max(1, ...people.map((w) => w.min));

  // What to automate: the hand-done steps that take the most time.
  const automate = [...timed].filter((s) => !s.automated).sort((a, b) => b.minutes! - a.minutes!).slice(0, 3);
  const freed = automate.reduce((n, s) => n + s.minutes!, 0);

  const [focus, setFocus] = useState<HeatStep | null>(null);

  const accent = { color };
  const label = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground';

  // Drawn on the page itself, so nothing on the Brain (like the view switcher) can sit on top of it.
  return createPortal(
    <div
      data-ui
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px] transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={p.name}
        onClick={(e) => e.stopPropagation()}
        className={`relative max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-background text-foreground shadow-2xl transition-transform duration-300 ${shown ? 'scale-100' : 'scale-95'}`}
      >
        {/* A faint grid, nothing more. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: 'linear-gradient(black 1px, transparent 1px), linear-gradient(90deg, black 1px, transparent 1px)', backgroundSize: '28px 28px' }}
        />

        <div className="relative p-6 sm:p-8">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <p className={`${label} flex items-center gap-2`}>
            <span className="h-2 w-2 rounded-full" style={{ background: `hsl(${p.hue} 70% 50%)` }} />
            {p.dept || 'No department'}
          </p>
          <h2 className="mt-1 pr-10 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{p.name}</h2>

          {/* The readout. */}
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-5xl font-semibold tabular-nums leading-none" style={accent}>{p.hours ? fmt(p.hours) : '–'}</p>
              <p className="mt-2 text-xs text-muted-foreground">people hours a month</p>
            </div>
            <div>
              <p className="text-3xl font-semibold tabular-nums leading-none text-foreground">{p.autoPct}%</p>
              <p className="mt-2 text-xs text-muted-foreground">done by apps</p>
            </div>
            <div>
              <p className="text-3xl font-semibold tabular-nums leading-none text-foreground">{runs || '–'}</p>
              <p className="mt-2 text-xs text-muted-foreground">runs a month</p>
            </div>
            <div>
              <p className="text-3xl font-semibold tabular-nums leading-none text-foreground">{p.steps.length}</p>
              <p className="mt-2 text-xs text-muted-foreground">steps</p>
            </div>
          </div>

          {/* Time ribbon: every step in order, as wide as the time it takes. */}
          <section className="mt-8">
            <p className={label}>Where the time goes, step by step</p>
            <div className="mt-3 flex h-12 w-full gap-[3px]" onMouseLeave={() => setFocus(null)}>
              {p.steps.map((s, i) => {
                const min = s.team ? s.minutes ?? 0 : 0;
                const heat = min / biggest;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onMouseEnter={() => setFocus(s)}
                    onFocus={() => setFocus(s)}
                    aria-label={s.title}
                    className={`h-full rounded-md transition-all duration-700 ease-out ${focus?.id === s.id ? 'ring-2 ring-foreground' : ''}`}
                    style={{
                      flexGrow: shown ? (min > 0 ? min : 0) : 0,
                      flexBasis: min > 0 ? 0 : 8,
                      minWidth: 6,
                      transitionDelay: `${i * 25}ms`,
                      background: min > 0 ? tint(color, 0.2 + heat * 0.8) : s.automated ? 'rgba(16,185,129,0.45)' : 'rgba(15,23,42,0.08)',
                    }}
                  />
                );
              })}
            </div>
            <p className="mt-2 min-h-[40px] text-sm text-muted-foreground">
              {focus ? (
                <>
                  <span className="font-semibold text-foreground">{focus.title}</span>
                  {focus.who && <span className="text-muted-foreground"> · {focus.who}</span>}
                  <br />
                  {focus.automated ? (
                    <span className="text-emerald-700">An app does this on its own.</span>
                  ) : !focus.team ? (
                    <span className="text-muted-foreground">No team time: a wait, a client, or another process.</span>
                  ) : focus.minutes ? (
                    <>
                      {focus.minutes} min each run{runs ? <> · <span style={{ color }}>{fmt(perMonth(focus.minutes))} hrs a month</span></> : ''}
                    </>
                  ) : (
                    <span className="text-amber-700">No time estimate yet.</span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">Point at a step. Wider and brighter means more time. Green is done by an app.</span>
              )}
            </p>
          </section>

          <div className="mt-6 grid gap-8 sm:grid-cols-2">
            {/* Hours by person. */}
            <section>
              <p className={label}>Hours by person</p>
              {people.length ? (
                <ul className="mt-3 space-y-3">
                  {people.map((w, i) => (
                    <li key={w.name}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="truncate text-foreground">{w.name}</span>
                        <span className="tabular-nums text-foreground">{runs ? `${fmt(perMonth(w.min))} hrs` : `${w.min} min/run`}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{ width: shown ? `${(w.min / topPerson) * 100}%` : 0, transitionDelay: `${150 + i * 60}ms`, background: color }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No timed steps yet.</p>
              )}
            </section>

            {/* What to automate first. */}
            <section>
              <p className={label}>Automate these first</p>
              {automate.length ? (
                <>
                  <ol className="mt-3 space-y-2">
                    {automate.map((s, i) => (
                      <li key={s.id} className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: color }}>
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{s.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {s.who}
                            {s.apps.length > 0 && ` · in ${s.apps.slice(0, 3).join(', ')}`}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-xs font-semibold text-emerald-700">
                          {runs ? `frees ${fmt(perMonth(s.minutes!))} hrs` : `${s.minutes} min/run`}
                        </span>
                      </li>
                    ))}
                  </ol>
                  {runs > 0 && perRun > 0 && (
                    <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Zap className="h-3.5 w-3.5 text-emerald-700" />
                      Together: <span className="font-semibold text-emerald-700">{fmt(perMonth(freed))} hrs a month</span> ({Math.round((freed / perRun) * 100)}% of this process)
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Nothing done by hand with a time estimate.</p>
              )}
            </section>
          </div>

          {/* The math behind the big number. */}
          <section className="mt-8 rounded-xl border border-border bg-muted/40 p-4">
            <p className={label}>The math</p>
            {runs && perRun ? (
              <p className="mt-2 font-mono text-sm text-muted-foreground">
                <span className="text-foreground">{runs}</span> runs a month × <span className="text-foreground">{perRun}</span> min per run ÷ 60 ={' '}
                <span className="font-semibold" style={accent}>{fmt(perMonth(perRun))} hrs a month</span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-amber-700">
                {!runs ? 'No runs-per-month estimate yet, so hours can’t be worked out.' : 'No step has a time estimate yet.'}
              </p>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              Counts {timed.length} timed team {timed.length === 1 ? 'step' : 'steps'}. Apps, clients, waits and other processes take no team time.
            </p>
            {missing.length > 0 && (
              <p className="mt-1.5 text-xs text-amber-700">
                Missing a time estimate, so not counted yet: {missing.map((s) => s.title).join(', ')}.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
