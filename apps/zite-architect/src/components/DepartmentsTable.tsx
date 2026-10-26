import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBrain, GetBrainOutputType } from 'zitejs/api';
import { ArrowRight, Building2 } from 'lucide-react';
import { deptTag } from '@/lib/deptColors';
import { PageEmpty, PageError, PageLoading } from './PageState';
import RoleAvatar from './RoleAvatar';

type Data = GetBrainOutputType;
type Proc = Data['processes'][number];
const fmtHrs = (h: number) => `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10} hrs`;

/** People hours a month for one process: the team's own steps, times how often it runs. */
function hoursOf(p: Proc) {
  if (!p.runsPerMonth) return 0;
  const minutes = p.steps.reduce(
    (n, s) => n + (s.who?.kind === 'person' && s.who.party !== 'External' && s.stepType !== 'Wait' && !s.subProcessId ? s.minutes ?? 0 : 0),
    0,
  );
  return (minutes * p.runsPerMonth) / 60;
}

/**
 * Every department in one table, for admins on Home: its color, lead,
 * processes, people, apps, how much runs on its own, and its hours. Each row
 * opens that department on the Brain.
 */
export default function DepartmentsTable() {
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    getBrain({}).then(setData).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.departments
      .map((d) => {
        const procs = data.processes.filter((p) => p.department === d.name);
        const people = new Map(procs.flatMap((p) => p.people).map((w) => [w.id, w]));
        const apps = new Map(procs.flatMap((p) => p.apps).map((a) => [a.id, a]));
        const a = procs.reduce((n, p) => n + p.automated, 0);
        const work = procs.reduce((n, p) => n + p.automated + p.review + p.manual, 0);
        return {
          ...d,
          procs,
          people: [...people.values()],
          apps: [...apps.values()],
          automated: work ? Math.round((a / work) * 100) : 0,
          hours: procs.reduce((n, p) => n + hoursOf(p), 0),
        };
      })
      .filter((d) => d.procs.length > 0)
      .sort((x, y) => x.name.localeCompare(y.name));
  }, [data]);

  if (failed) return <PageError onRetry={load} />;
  if (!data) return <PageLoading blocks={2} height="h-24" />;
  if (rows.length === 0) {
    return (
      <PageEmpty
        icon={<Building2 className="h-6 w-6" />}
        title="No departments yet"
        text="Give a process a department in its settings, and it shows up here."
      />
    );
  }

  const head = 'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';
  const open = (name: string) => navigate(`/brain?dept=${encodeURIComponent(name)}`);
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="border-b border-border">
          <tr>
            <th className={`${head} pl-5`}>Department</th>
            <th className={head}>Lead</th>
            <th className={head}>Processes</th>
            <th className={head}>People</th>
            <th className={head}>Apps</th>
            <th className={`${head} text-right`}>On its own</th>
            <th className={`${head} text-right`}>Hrs / month</th>
            <th className={head} />
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.name} onClick={() => open(d.name)} className="group cursor-pointer border-b border-border last:border-0 hover:bg-muted/40">
              <td className="py-3.5 pl-5 pr-3">
                <span className="rounded-full px-2.5 py-1 text-[13px] font-semibold" style={deptTag(d.hue)}>
                  {d.name}
                </span>
              </td>
              <td className="px-3 py-3.5 text-[13px]">
                {d.lead ? (
                  <span className="flex items-center gap-2">
                    <RoleAvatar w={d.lead} size={16} /> {d.lead.name}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No lead yet</span>
                )}
              </td>
              <td className="max-w-[240px] px-3 py-3.5 text-[13px]">
                <span className="font-medium">{d.procs.length}</span>
                <span className="block truncate text-xs text-muted-foreground">{d.procs.map((p) => p.name).join(', ')}</span>
              </td>
              <td className="px-3 py-3.5">
                <span className="flex items-center -space-x-1">
                  {d.people.slice(0, 5).map((w) => (
                    <span key={w.id} title={w.name} className="rounded-full ring-2 ring-card">
                      <RoleAvatar w={w} size={18} />
                    </span>
                  ))}
                  {d.people.length > 5 && <span className="pl-2 text-[11px] text-muted-foreground">+{d.people.length - 5}</span>}
                </span>
              </td>
              <td className="px-3 py-3.5">
                <span className="flex flex-wrap items-center gap-1">
                  {d.apps.slice(0, 6).map((a) => (
                    <span key={a.id} title={a.name}>
                      <RoleAvatar w={a} size={14} />
                    </span>
                  ))}
                  {d.apps.length > 6 && <span className="text-[11px] text-muted-foreground">+{d.apps.length - 6}</span>}
                </span>
              </td>
              <td className="px-3 py-3.5 text-right tabular-nums">{d.automated}%</td>
              <td className="px-3 py-3.5 text-right tabular-nums">{d.hours > 0 ? fmtHrs(d.hours) : <span className="text-muted-foreground">—</span>}</td>
              <td className="py-3.5 pl-3 pr-5 text-right">
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-primary">
                  View in Brain <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
