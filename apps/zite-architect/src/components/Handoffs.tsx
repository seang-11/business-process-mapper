import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getHandoffs, GetHandoffsOutputType } from 'zitejs/api';
import { ArrowLeftRight, ArrowRight } from 'lucide-react';
import { PageEmpty, PageError, PageLoading } from './PageState';
import ElementIcon from './ElementIcon';

type Row = GetHandoffsOutputType['processes'][number];
type Who = Row['pairs'][number]['from'];

const PERSON_ARROW = 'hsl(38 92% 45%)';
const MAX_RELAY = 7;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Chip({ who }: { who: Who }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium">
      <ElementIcon name={who.name} image={who.image} icon={who.icon} typeIcon={who.typeIcon} color={who.color} size={14} />
      {who.name}
    </span>
  );
}

/** One line showing who holds the work from start to finish, with an amber arrow where it passes between two people. */
function Relay({ relay }: { relay: Row['relay'] }) {
  const shown = relay.slice(0, MAX_RELAY);
  const hidden = relay.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-y-2">
      {shown.map((r, i) => (
        <span key={`${r.who.id}-${i}`} className="inline-flex items-center">
          <Chip who={r.who} />
          {(i < shown.length - 1 || hidden > 0) && (
            <ArrowRight
              className="mx-1.5 h-3.5 w-3.5 shrink-0"
              style={{ color: r.nextIsPerson ? PERSON_ARROW : 'hsl(var(--muted-foreground))' }}
              strokeWidth={r.nextIsPerson ? 2.5 : 1.75}
            />
          )}
        </span>
      ))}
      {hidden > 0 && <span className="text-xs text-muted-foreground">and {hidden} more</span>}
    </div>
  );
}

/**
 * Who passes work to whom. A handoff is when work moves from one person to the
 * next. Each one is a chance for work to wait or get dropped, so the processes
 * with the most handoffs are listed first.
 */
export default function Handoffs() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    setRows(null);
    getHandoffs({})
      .then((r) => setRows(r.processes))
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const ranked = useMemo(
    () =>
      [...(rows ?? [])]
        .filter((r) => r.handoffs > 0)
        .sort((a, b) => b.personToPerson - a.personToPerson || b.handoffs - a.handoffs || a.name.localeCompare(b.name)),
    [rows],
  );
  const total = ranked.reduce((n, r) => n + r.handoffs, 0);
  const betweenPeople = ranked.reduce((n, r) => n + r.personToPerson, 0);

  // The same pair across every process, so a handoff that keeps coming up stands out.
  const topPairs = useMemo(() => {
    const map = new Map<string, { from: Who; to: Who; count: number; processes: Set<string> }>();
    for (const r of rows ?? []) {
      for (const p of r.pairs) {
        if (p.kind !== 'people') continue;
        const key = `${p.from.id}|${p.to.id}`;
        const cur = map.get(key);
        if (cur) {
          cur.count += p.count;
          cur.processes.add(r.name);
        } else map.set(key, { from: p.from, to: p.to, count: p.count, processes: new Set([r.name]) });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  }, [rows]);

  return (
    <div className="mx-auto max-w-[1000px] px-8 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Handoffs</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
        A handoff is when work moves from one person to the next. Each one is a chance for work to sit waiting or get
        dropped. The fewer handoffs, the faster work gets done.
      </p>

      {failed ? (
        <div className="mt-8">
          <PageError onRetry={load} />
        </div>
      ) : rows === null ? (
        <div className="mt-8">
          <PageLoading blocks={3} height="h-24" />
        </div>
      ) : ranked.length === 0 ? (
        <div className="mt-8">
          <PageEmpty
            icon={<ArrowLeftRight className="h-6 w-6" />}
            title="No handoffs yet"
            text="Once a process has steps done by different people, you will see how work moves between them here."
          />
        </div>
      ) : (
        <>
          <p className="mt-7 text-lg">
            Work changes hands <b className="font-semibold">{total} times</b> across{' '}
            <b className="font-semibold">{plural(ranked.length, 'process')}</b>
            {betweenPeople > 0 && (
              <>
                , and <b className="font-semibold" style={{ color: PERSON_ARROW }}>{betweenPeople}</b> of those are straight from one
                person to another
              </>
            )}
            .
          </p>

          <h2 className="mt-8 text-sm font-semibold">Process by process</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Each line shows who holds the work, in order. An{' '}
            <span className="font-semibold" style={{ color: PERSON_ARROW }}>amber arrow</span> means it passes straight to
            another person.
          </p>
          <ul className="mt-3 space-y-3">
            {ranked.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/process/${r.id}`)}
                  className="group w-full rounded-2xl border border-border bg-card p-5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]"
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.name}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        r.live ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {r.live ? 'Live' : 'Draft'}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{plural(r.handoffs, 'handoff')}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="mt-3 block">
                    <Relay relay={r.relay} />
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {topPairs.length > 0 && (
            <>
              <h2 className="mt-10 text-sm font-semibold">Handoffs between people that come up most</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                If one of these keeps stalling, it is worth giving that handoff a clear trigger or automating it.
              </p>
              <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {topPairs.map((p) => (
                  <li key={`${p.from.id}|${p.to.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5">
                    <Chip who={p.from} />
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: PERSON_ARROW }} strokeWidth={2.5} />
                    <Chip who={p.to} />
                    <span className="ml-auto text-xs text-muted-foreground">
                      {plural(p.count, 'time')} in {[...p.processes].join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
