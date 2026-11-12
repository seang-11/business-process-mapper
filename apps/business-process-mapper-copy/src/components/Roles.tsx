import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBrain, GetBrainOutputType, getTaxonomy } from 'zitejs/api';
import { ArrowRight, FileText, LayoutGrid, Pencil, Plus, Search, Table2, Users } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { roleSummaries, type RoleSummary } from '@/lib/roleBrief';
import { useMe } from '@/lib/me';
import type { ElementSummary, ElementType } from '@/types';
import ElementDialog from './ElementDialog';
import { PageEmpty, PageError, PageLoading } from './PageState';
import RoleAvatar from './RoleAvatar';
import { deptTag } from '@/lib/deptColors';
import { STATUS_TOKENS } from '@/lib/elementTokens';
const plural = (n: number, word: string, many?: string) => `${n} ${n === 1 ? word : many ?? `${word}s`}`;
const fmtHrs = (h: number) => `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10} hrs`;

const VIEW_KEY = 'bpm_roles_view';
// Roles and teams are the work's owners. Named people and clients are elements too, but not roles.
const ROLE_TYPE_KEYS = new Set(['role', 'team']);

/** People hours a month per role: its own steps' minutes, times how often each process runs. */
function hoursByRole(data: GetBrainOutputType) {
  const out = new Map<string, number>();
  for (const p of data.processes) {
    if (!p.runsPerMonth) continue;
    for (const s of p.steps) {
      if (!s.who || !s.minutes || s.stepType === 'Wait' || s.subProcessId) continue;
      out.set(s.who.id, (out.get(s.who.id) ?? 0) + (s.minutes * p.runsPerMonth) / 60);
    }
  }
  return out;
}

/**
 * Every role in the company, and a handover brief for each. Roles, not names:
 * people move on, the work stays, and whoever steps in next needs to know it.
 * Editors also get a table of every role, where they can add one or change
 * any of its details; viewers see the cards.
 */
export default function Roles() {
  const navigate = useNavigate();
  const { canEdit } = useMe();
  const [data, setData] = useState<GetBrainOutputType | null>(null);
  const [taxonomy, setTaxonomy] = useState<{ types: ElementType[]; elements: ElementSummary[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'table' | 'cards'>(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'table' || saved === 'cards') return saved;
    } catch {
      // Falls back to the default below.
    }
    return 'table';
  });
  /** The role being edited, or 'new' while adding one. */
  const [editing, setEditing] = useState<ElementSummary | 'new' | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([getBrain({}), getTaxonomy({})])
      .then(([brain, tax]) => {
        setData(brain);
        setTaxonomy(tax as { types: ElementType[]; elements: ElementSummary[] });
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const pickView = (v: 'table' | 'cards') => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Not remembered; fine for this visit.
    }
  };

  const roles = useMemo(() => (data ? roleSummaries(data) : []), [data]);
  const q = query.trim().toLowerCase();
  const shown = roles.filter((r) => !q || r.who.name.toLowerCase().includes(q) || r.depts.some((d) => d.toLowerCase().includes(q)));
  // The public site keeps Roles simple: cards only, click one to see it.
  const showTable = false;
  void canEdit;
  void view;
  void pickView;

  return (
    <div className="min-h-full bg-[linear-gradient(hsl(var(--border)/0.35)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.35)_1px,transparent_1px)] bg-[size:28px_28px]">
    <div className="mx-auto max-w-[1100px] px-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Roles</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Click a role to see what it does.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(roles.length > 0 || showTable) && (
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a role…" className="h-9 pl-8 text-sm" />
            </div>
          )}
          {false && (
            <>
              <div className="flex rounded-lg border border-border p-0.5 text-xs font-medium">
                {([['table', 'Table', Table2], ['cards', 'Cards', LayoutGrid]] as const).map(([k, label, Icon]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => pickView(k)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 ${
                      view === k ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
              </div>
              <Button size="sm" className="h-9" onClick={() => setEditing('new')} disabled={!taxonomy}>
                <Plus className="mr-1 h-4 w-4" /> New role
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="mt-7">
        {failed ? (
          <PageError onRetry={load} />
        ) : !data || !taxonomy ? (
          <PageLoading blocks={2} height="h-40" />
        ) : showTable ? (
          <RolesTable data={data} taxonomy={taxonomy} summaries={roles} query={q} onEdit={setEditing} onOpen={(id) => navigate(`/roles/${id}`)} />
        ) : roles.length === 0 ? (
          <PageEmpty
            icon={<Users className="h-6 w-6" />}
            title="No roles yet"
            text="Once process steps are done by roles (like Finance Lead or Project Manager), they show up here."
          />
        ) : shown.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No role matches that.</p>
        ) : (
          <RoleCards roles={shown} hues={new Map(data.departments.map((d) => [d.name, d.hue]))} onOpen={(id) => navigate(`/roles/${id}`)} />
        )}
      </div>

      {editing && taxonomy && (
        <ElementDialog
          key={editing === 'new' ? 'new' : editing.id}
          noun="role"
          types={taxonomy.types}
          elements={taxonomy.elements}
          element={editing === 'new' ? null : editing}
          defaultTypeId={taxonomy.types.find((t) => t.key === 'role')?.id}
          onPickExisting={setEditing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
    </div>
  );
}

/**
 * Every role and team, with everything about it in one row: what it does, who
 * it reports to, where it works, how much work it carries. Click a row for its
 * brief, or the pencil to change it.
 */
function RolesTable({ data, taxonomy, summaries, query, onEdit, onOpen }: {
  data: GetBrainOutputType;
  taxonomy: { types: ElementType[]; elements: ElementSummary[] };
  summaries: RoleSummary[];
  query: string;
  onEdit: (el: ElementSummary) => void;
  onOpen: (id: string) => void;
}) {
  const hours = useMemo(() => hoursByRole(data), [data]);
  const deptHues = useMemo(() => new Map(data.departments.map((d) => [d.name, d.hue])), [data]);
  const byId = useMemo(() => new Map(summaries.map((r) => [r.who.id, r])), [summaries]);
  const avatarOf = useMemo(() => new Map(data.people.map((w) => [w.id, w])), [data]);
  // Active roles do work in a process today; everything else (Inactive, Planned, Retired) waits on the other tab.
  const [show, setShow] = useState<'active' | 'inactive' | 'all'>('active');
  const isActive = (e: ElementSummary) => !e.status || e.status === 'Active';
  const allRoles = taxonomy.elements.filter((e) => ROLE_TYPE_KEYS.has(e.typeKey));
  const counts = { active: allRoles.filter(isActive).length, inactive: allRoles.filter((e) => !isActive(e)).length, all: allRoles.length };
  const rows = allRoles
    .filter((e) => show === 'all' || (show === 'active') === isActive(e))
    .filter(
      (e) =>
        !query ||
        e.name.toLowerCase().includes(query) ||
        e.description.toLowerCase().includes(query) ||
        (byId.get(e.id)?.depts ?? []).some((d) => d.toLowerCase().includes(query)),
    )
    .sort((a, b) => (byId.get(b.id)?.steps ?? 0) - (byId.get(a.id)?.steps ?? 0) || a.name.localeCompare(b.name));

  const tabs = (
    <div className="mb-3 flex items-center gap-1 rounded-xl border border-border bg-card p-1 text-sm font-medium shadow-[0_1px_2px_rgba(16,24,40,0.04)] w-fit">
      {([
        ['active', 'Active'],
        ['inactive', 'Inactive'],
        ['all', 'All'],
      ] as const).map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => setShow(k)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${
            show === k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          {k === 'active' && <span className={`h-2 w-2 rounded-full ${show === k ? 'bg-primary-foreground' : 'bg-emerald-500'}`} />}
          {k === 'inactive' && <span className={`h-2 w-2 rounded-full ${show === k ? 'bg-primary-foreground/70' : 'bg-muted-foreground/40'}`} />}
          {label}
          <span className={`text-xs tabular-nums ${show === k ? 'opacity-80' : 'text-muted-foreground'}`}>{counts[k]}</span>
        </button>
      ))}
    </div>
  );

  if (rows.length === 0) {
    return (
      <div>
        {tabs}
        <p className="py-12 text-center text-sm text-muted-foreground">
          {query ? 'No role matches that.' : show === 'inactive' ? 'Every role is in use.' : 'No roles yet. Add the first one.'}
        </p>
      </div>
    );
  }

  const head = 'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';
  return (
    <div>
    {tabs}
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="border-b border-border">
          <tr>
            <th className={`${head} pl-5`}>Role</th>
            <th className={head}>What it does</th>
            <th className={head}>Reports to</th>
            <th className={head}>Departments</th>
            <th className={`${head} text-right`}>Steps</th>
            <th className={`${head} text-right`}>Hrs / month</th>
            <th className={head}>Apps</th>
            <th className={head}>Status</th>
            <th className={head} />
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const r = byId.get(e.id);
            const who = avatarOf.get(e.id);
            const h = hours.get(e.id) ?? 0;
            const outside = e.party === 'External';
            return (
              <tr
                key={e.id}
                onClick={() => (r ? onOpen(e.id) : onEdit(e))}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
              >
                <td className="py-3 pl-5 pr-3">
                  <span className="flex items-center gap-2.5">
                    {who ? <RoleAvatar w={who} size={22} /> : <span className="h-[26px] w-[26px] rounded-full bg-muted" />}
                    <span className="min-w-0">
                      <span className="block font-medium">{e.name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {e.typeName}
                        {outside ? ' · Outside the company' : ''}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="max-w-[260px] px-3 py-3">
                  {e.description ? (
                    <span className="line-clamp-2 text-xs text-muted-foreground">{e.description}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground/60">Not written yet</span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs">{e.ownerName || <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-3">
                  {r && r.depts.length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {r.depts.map((d) => (
                        <span
                          key={d}
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={deptTag(deptHues.get(d))}
                        >
                          {d}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{r ? r.steps : <span className="text-muted-foreground">0</span>}</td>
                <td className="px-3 py-3 text-right tabular-nums">{h > 0 ? fmtHrs(h) : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-3">
                  {r && r.apps.length > 0 ? (
                    <span className="flex flex-wrap items-center gap-1">
                      {r.apps.slice(0, 5).map((a) => (
                        <span key={a.id} title={a.name}>
                          <RoleAvatar w={a} size={13} />
                        </span>
                      ))}
                      {r.apps.length > 5 && <span className="text-[10px] text-muted-foreground">+{r.apps.length - 5}</span>}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      (STATUS_TOKENS[e.status || 'Active'] ?? STATUS_TOKENS.Active).badge
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${(STATUS_TOKENS[e.status || 'Active'] ?? STATUS_TOKENS.Active).dot}`} />
                    {e.status || 'Active'}
                  </span>
                </td>
                <td className="py-3 pl-3 pr-4">
                  <span className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      title={`Edit ${e.name}`}
                      aria-label={`Edit ${e.name}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onEdit(e);
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {r && !outside && (
                      <button
                        type="button"
                        title="Handover brief"
                        aria-label={`Handover brief for ${e.name}`}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onOpen(e.id);
                        }}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-border px-5 py-2.5 text-[11px] text-muted-foreground">
        Click a row for its handover brief, or the pencil to change its name, description, who it reports to, or status. A role
        with no steps yet shows up on a process once someone assigns it a step.
      </p>
    </div>
    </div>
  );
}

/** The cards everyone sees: one per role that does work, with a link to its brief. */
function RoleCards({ roles, hues, onOpen }: { roles: RoleSummary[]; hues: Map<string, number>; onOpen: (id: string) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {roles.map((r) => (
        <button
          key={r.who.id}
          type="button"
          onClick={() => onOpen(r.who.id)}
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
                  style={deptTag(hues.get(d))}
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
            View role
            <ArrowRight className="ml-auto h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>
      ))}
    </div>
  );
}
