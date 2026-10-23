import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBrain, GetBrainOutputType } from 'zitejs/api';
import { ArrowRight, FileText, Search, Users } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import { roleSummaries } from '@/lib/roleBrief';
import { PageEmpty, PageError, PageLoading } from './PageState';
import RoleAvatar, { hueFor } from './RoleAvatar';

const plural = (n: number, word: string, many?: string) => `${n} ${n === 1 ? word : many ?? `${word}s`}`;

/**
 * Every role in the company, and a handover brief for each. Roles, not names:
 * people move on, the work stays, and whoever steps in next needs to know it.
 */
export default function Roles() {
  const navigate = useNavigate();
  const [data, setData] = useState<GetBrainOutputType | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    setFailed(false);
    setData(null);
    getBrain({})
      .then(setData)
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const roles = useMemo(() => (data ? roleSummaries(data) : []), [data]);
  const q = query.trim().toLowerCase();
  const shown = roles.filter(
    (r) => !q || r.who.name.toLowerCase().includes(q) || r.depts.some((d) => d.toLowerCase().includes(q)),
  );

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Roles</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            People move on, the work stays. Pick a role to get its handover brief: every process it is part of, every
            step it does, the tools it needs, and who it works with. Ready to give to whoever steps in next.
          </p>
        </div>
        {roles.length > 0 && (
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a role…" className="h-9 pl-8 text-sm" />
          </div>
        )}
      </div>

      <div className="mt-7">
        {failed ? (
          <PageError onRetry={load} />
        ) : !data ? (
          <PageLoading blocks={2} height="h-40" />
        ) : roles.length === 0 ? (
          <PageEmpty
            icon={<Users className="h-6 w-6" />}
            title="No roles yet"
            text="Once process steps are done by roles (like Finance Lead or Project Manager), they show up here."
          />
        ) : shown.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No role matches that.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((r) => (
              <button
                key={r.who.id}
                type="button"
                onClick={() => navigate(`/roles/${r.who.id}`)}
                className="group flex flex-col rounded-2xl border border-border bg-card p-5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]"
              >
                <span className="flex items-center gap-3">
                  <RoleAvatar w={r.who} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold tracking-tight">{r.who.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {plural(r.steps, 'step')} in {plural(r.processes, 'process', 'processes')}
                    </span>
                  </span>
                </span>
                {r.depts.length > 0 && (
                  <span className="mt-3 flex flex-wrap gap-1">
                    {r.depts.map((d) => (
                      <span
                        key={d}
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ backgroundColor: `hsl(${hueFor(d)} 80% 93%)`, color: `hsl(${hueFor(d)} 45% 32%)` }}
                      >
                        {d}
                      </span>
                    ))}
                  </span>
                )}
                <span className="mt-3 text-[11px] text-muted-foreground">
                  {plural(r.hand, 'step')} by hand · {plural(r.decisions, 'decision')}
                </span>
                {r.apps.length > 0 && (
                  <span className="mt-3 flex flex-wrap items-center gap-1">
                    {r.apps.slice(0, 8).map((a) => (
                      <span key={a.id} title={a.name} className="rounded-md border border-border bg-background p-1">
                        <RoleAvatar w={a} size={13} />
                      </span>
                    ))}
                    {r.apps.length > 8 && <span className="text-[10px] text-muted-foreground">+{r.apps.length - 8}</span>}
                  </span>
                )}
                <span className="mt-5 flex items-center gap-1.5 border-t border-border pt-3 text-sm font-medium text-primary">
                  <FileText className="h-4 w-4" /> Handover brief
                  <ArrowRight className="ml-auto h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
