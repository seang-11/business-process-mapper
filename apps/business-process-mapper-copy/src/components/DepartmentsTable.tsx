import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteDepartment, getBrain, GetBrainOutputType, saveDepartment } from 'zitejs/api';
import { ArrowRight, Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DEPT_PALETTE, deptTag } from '@/lib/deptColors';
import { useMe } from '@/lib/me';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
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
  const { canEdit } = useMe();
  /** The department being edited, or 'new' for one being added. */
  const [editing, setEditing] = useState<Dept | 'new' | null>(null);
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
      .sort((x, y) => x.name.localeCompare(y.name));
  }, [data]);

  if (failed) return <PageError onRetry={load} />;
  if (!data) return <PageLoading blocks={2} height="h-24" />;
  const dialog = editing && (
    <DepartmentDialog
      dept={editing === 'new' ? null : editing}
      people={data.people}
      taken={data.departments.map((d) => d.name)}
      onClose={() => setEditing(null)}
      onSaved={() => {
        setEditing(null);
        load();
      }}
    />
  );
  const addButton = canEdit && (
    <div className="mb-3 flex justify-end">
      <Button size="sm" onClick={() => setEditing('new')}>
        <Plus className="mr-1.5 h-4 w-4" /> New department
      </Button>
    </div>
  );
  if (rows.length === 0) {
    return (
      <>
        {addButton}
        <PageEmpty
          icon={<Building2 className="h-6 w-6" />}
          title="No departments yet"
          text={canEdit ? 'Add your first department, then give processes a department in their settings.' : 'Departments show up here once processes have one.'}
        />
        {dialog}
      </>
    );
  }

  const head = 'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';
  const open = (name: string) => navigate(`/brain?dept=${encodeURIComponent(name)}`);
  return (
    <>
    {addButton}
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
                {d.procs.length > 0 ? (
                  <>
                    <span className="font-medium">{d.procs.length}</span>
                    <span className="block truncate text-xs text-muted-foreground">{d.procs.map((p) => p.name).join(', ')}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">No processes yet</span>
                )}
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
                <span className="inline-flex items-center gap-3">
                  {canEdit && (
                    <button
                      type="button"
                      title={`Edit ${d.name}`}
                      aria-label={`Edit ${d.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(d);
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <span className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-primary">
                    View in Brain <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {dialog}
    </>
  );
}

type Dept = Data['departments'][number] & { procs: Proc[] };

/** Add a department, or change its name, color, lead and description. Admins only. */
function DepartmentDialog({ dept, people, taken, onClose, onSaved }: {
  dept: Dept | null;
  people: Data['people'];
  taken: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(dept?.name ?? '');
  const [hue, setHue] = useState<number | null>(dept ? dept.hue : null);
  const [leadId, setLeadId] = useState(dept?.lead?.id ?? '');
  const [description, setDescription] = useState(dept?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Roles first, then named people, so a lead is usually a role that outlasts whoever holds it.
  const leads = [...people].sort((a, b) => Number(a.humanKind !== 'Position') - Number(b.humanKind !== 'Position') || a.name.localeCompare(b.name));
  const trimmed = name.trim();
  const clash = taken.find((t) => t.toLowerCase() === trimmed.toLowerCase() && t !== dept?.name);

  const save = async () => {
    if (!trimmed || clash) return;
    setSaving(true);
    try {
      await saveDepartment({ originalName: dept?.name, name: trimmed, hue, leadId: leadId || null, description });
      toast.success(dept ? 'Department saved' : `${trimmed} added`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the department.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!dept) return;
    setSaving(true);
    try {
      await deleteDepartment({ name: dept.name });
      toast.success(`${dept.name} removed`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the department.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{dept ? `Edit ${dept.name}` : 'New department'}</DialogTitle>
          <DialogDescription>
            {dept && dept.procs.length > 0
              ? `Renaming moves its ${dept.procs.length === 1 ? 'process' : `${dept.procs.length} processes`} with it.`
              : 'Give processes this department in their settings to fill it.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="dept-name" className="text-sm font-medium">Name</label>
            <Input id="dept-name" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Operations" />
            {clash && <p className="text-xs text-destructive">There's already a department called {clash}.</p>}
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Color</p>
            <div className="flex flex-wrap items-center gap-2">
              {DEPT_PALETTE.map((c) => (
                <button
                  key={c.hue}
                  type="button"
                  title={c.name}
                  aria-label={c.name}
                  aria-pressed={hue === c.hue}
                  onClick={() => setHue(c.hue)}
                  className={`h-7 w-7 rounded-full transition-transform hover:scale-110 ${hue === c.hue ? 'ring-2 ring-foreground ring-offset-2' : ''}`}
                  style={{ backgroundColor: `hsl(${c.hue} 60% 55%)` }}
                />
              ))}
              <button
                type="button"
                onClick={() => setHue(null)}
                className={`rounded-full border px-2.5 py-1 text-xs ${hue === null ? 'border-foreground font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}
              >
                Let the app choose
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Picking a color another department has moves that one to a free color.</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="dept-lead" className="text-sm font-medium">Lead</label>
            <select
              id="dept-lead"
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">No lead</option>
              {leads.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="dept-desc" className="text-sm font-medium">Description</label>
            <Textarea
              id="dept-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What this department does and what it's responsible for."
            />
          </div>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          {dept ? (
            confirmDelete ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">
                  {dept.procs.length ? `Its ${dept.procs.length === 1 ? 'process' : 'processes'} will have no department.` : 'Remove it?'}
                </span>
                <Button size="sm" variant="destructive" disabled={saving} onClick={remove}>
                  Remove
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Remove department
              </Button>
            )
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={saving || !trimmed || !!clash} onClick={save}>
              {saving ? 'Saving…' : dept ? 'Save' : 'Add department'}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
