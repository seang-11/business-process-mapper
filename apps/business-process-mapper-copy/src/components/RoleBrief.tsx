import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getBrain, GetBrainOutputType } from 'zitejs/api';
import { deptTag } from '@/lib/deptColors';
import { useBack } from '@/lib/backTrail';
import { ArrowLeft, ChevronDown, Users } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { buildBrief, type Neighbour } from '@/lib/roleBrief';
import { PageEmpty, PageError, PageLoading } from './PageState';
import RoleAvatar, { hueFor } from './RoleAvatar';

const plural = (n: number, word: string, many?: string) => `${n} ${n === 1 ? word : many ?? `${word}s`}`;

const PRINT_CSS = `
@media print {
  @page { margin: 16mm; }
  .brief-section { break-inside: avoid; }
  .brief-process { break-inside: auto; }
  .brief-step { break-inside: avoid; }
}
`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="brief-section mt-9">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** "After the Account Executive sends the proposal" style lines for where a step comes from or goes to. */
function Linked({ items, word }: { items: Neighbour[]; word: string }) {
  if (!items.length) return null;
  return (
    <p className="mt-1.5 text-xs text-muted-foreground">
      <span className="font-medium text-foreground/70">{word} </span>
      {items.map((n, i) => (
        <span key={i}>
          {i > 0 && '; '}
          {n.label && <span className="font-medium text-amber-700">if {n.label.toLowerCase()}, </span>}
          {n.who ? (n.who.kind === 'app' ? `${n.who.name} (automatic)` : n.who.name) : 'nobody yet'}: {n.title}
        </span>
      ))}
    </p>
  );
}

/**
 * A handover brief for one role: everything the next person needs to take it
 * over, across every process. Built from the live processes, so it is never out
 * of date. Download it as a PDF to hand over.
 */
export default function RoleBrief() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const back = useBack('/roles', 'Roles');
  const [data, setData] = useState<GetBrainOutputType | null>(null);
  const [failed, setFailed] = useState(false);
  /** The process opened in place. One at a time keeps the page short. */
  const [openId, setOpenId] = useState<string | null>(null);

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

  const brief = useMemo(() => (data && id ? buildBrief(data, id) : null), [data, id]);
  const deptHues = useMemo(() => new Map((data?.departments ?? []).map((d) => [d.name, d.hue])), [data]);

  if (failed) return <div className="mx-auto max-w-3xl px-8 py-10"><PageError onRetry={load} /></div>;
  if (!data) return <div className="mx-auto max-w-3xl px-8 py-10"><PageLoading blocks={3} height="h-32" /></div>;
  if (!brief) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <PageEmpty
          icon={<Users className="h-6 w-6" />}
          title="This role has no steps"
          text="Once a process step is done by this role, its handover brief appears here."
          action={<Button onClick={() => navigate('/roles')}>Back to roles</Button>}
        />
      </div>
    );
  }

  const { who } = brief;
  const hue = hueFor(who.name);

  return (
    <div className="mx-auto max-w-3xl px-8 pb-16 pt-6 print:max-w-none print:px-0 print:pt-0">
      <style>{PRINT_CSS}</style>

      <div className="flex items-center gap-2 print:hidden">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={back.go}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> {back.name === 'Roles' ? 'All roles' : `Back to ${back.name}`}
        </Button>
      </div>

      {/* Cover */}
      <header
        className="mt-5 rounded-2xl border border-border p-7 print:mt-0 print:border-0 print:p-0"
        style={{ background: `linear-gradient(160deg, hsl(${hue} 85% 95%), transparent 70%)` }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Role</p>
        <div className="mt-3 flex items-center gap-4">
          <RoleAvatar w={who} size={48} />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{who.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{brief.depts.join(' · ')}</p>
          </div>
        </div>
        <p className="mt-5 text-[15px] leading-relaxed">
          The {who.name} does {plural(brief.steps, 'step')} across {plural(brief.processes.length, 'process', 'processes')}
          {brief.depts.length ? ` in ${brief.depts.join(', ')}` : ''}. {plural(brief.hand, 'step')}{' '}
          {brief.hand === 1 ? 'is' : 'are'} done by hand, and {plural(brief.decisions, 'decision')}{' '}
          {brief.decisions === 1 ? 'is' : 'are'} made here.
        </p>
        <div className="mt-5 grid grid-cols-4 gap-2 text-center">
          {[
            [brief.processes.length, brief.processes.length === 1 ? 'process' : 'processes'],
            [brief.steps, 'steps'],
            [brief.hand, 'by hand'],
            [brief.decisions, 'decisions'],
          ].map(([n, label]) => (
            <div key={label as string} className="rounded-xl border border-border bg-background/80 px-2 py-3">
              <p className="text-2xl font-semibold tabular-nums">{n as number}</p>
              <p className="text-[11px] text-muted-foreground">{label as string}</p>
            </div>
          ))}
        </div>
      </header>

      {brief.apps.length > 0 && (
        <Section title="Get access to">
          <div className="flex flex-wrap gap-2">
            {brief.apps.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium">
                <RoleAvatar w={a} size={16} /> {a.name}
              </span>
            ))}
          </div>
        </Section>
      )}

      {(brief.from.length > 0 || brief.to.length > 0) && (
        <Section title="Works with">
          <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
            {[
              ['Gets work from', brief.from],
              ['Hands work to', brief.to],
            ].map(([label, list]) => (
              <div key={label as string} className="rounded-2xl border border-border bg-card p-4">
                <p className="text-sm font-semibold">{label as string}</p>
                {(list as typeof brief.from).length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">Nobody. This is where the work starts or ends.</p>
                ) : (
                  <ul className="mt-2.5 space-y-2">
                    {(list as typeof brief.from).map((x) => (
                      <li key={x.who.id} className="flex items-center gap-2 text-sm">
                        <RoleAvatar w={x.who} size={16} />
                        <span className="flex-1">
                          {x.who.name}
                          {x.who.kind === 'app' && <span className="text-xs text-muted-foreground"> (automatic)</span>}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">{plural(x.count, 'time')}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="The work, process by process">
        <p className="-mt-1 mb-3 text-xs text-muted-foreground print:hidden">Click a process to see this role's steps in it.</p>
        <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-1">
          {brief.processes.map(({ p, steps }) => {
            const open = openId === p.id;
            const hand = steps.filter((x) => x.step.stepType !== 'Decision' && x.step.stepType !== 'Wait').length;
            const decide = steps.filter((x) => x.step.stepType === 'Decision').length;
            const apps = [...new Map(steps.flatMap((x) => x.step.uses).filter((u) => u.kind === 'app').map((u) => [u.id, u])).values()];
            return (
              <article
                key={p.id}
                className={`brief-process overflow-hidden rounded-2xl border bg-card transition-shadow print:col-span-1 ${
                  open ? 'border-primary/40 shadow-[0_8px_24px_rgba(16,24,40,0.08)] sm:col-span-2' : 'border-border hover:shadow-[0_4px_14px_rgba(16,24,40,0.06)]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : p.id)}
                  aria-expanded={open}
                  className="flex w-full flex-col gap-2 p-4 text-left"
                >
                  <span className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug tracking-tight">{p.name}</span>
                    <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform print:hidden ${open ? 'rotate-180' : ''}`} />
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {p.department && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={deptTag(deptHues.get(p.department))}
                      >
                        {p.department}
                      </span>
                    )}
                    {steps.length} of {p.stepCount} steps
                    {hand > 0 && ` · ${hand} by hand`}
                    {decide > 0 && ` · ${plural(decide, 'decision')}`}
                  </span>
                  {apps.length > 0 && (
                    <span className="flex flex-wrap items-center gap-1">
                      {apps.slice(0, 7).map((u) => (
                        <span key={u.id} title={u.name} className="rounded-md border border-border bg-background p-1">
                          <RoleAvatar w={u} size={12} />
                        </span>
                      ))}
                      {apps.length > 7 && <span className="text-[10px] text-muted-foreground">+{apps.length - 7}</span>}
                    </span>
                  )}
                </button>
                {/* Closed cards still print their steps, so the PDF has everything. */}
                <div className={open ? 'border-t border-border' : 'hidden border-t border-border print:block'}>
              <ol className="divide-y divide-border">
                {steps.map(({ step: s, number, before, after }) => (
                  <li key={s.id} className="brief-step px-5 py-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums">
                        {number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug">
                          {s.title}
                          {s.stepType === 'Decision' && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">A decision</span>
                          )}
                          {s.stepType === 'Wait' && (
                            <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">A wait</span>
                          )}
                        </p>
                        <Linked items={before} word="Starts after" />
                        {s.description && <p className="mt-2 text-sm leading-relaxed text-foreground/80">{s.description}</p>}
                        {s.uses.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {s.uses.map((u) => (
                              <span key={u.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium">
                                <RoleAvatar w={u} size={12} /> {u.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {s.checklist.length > 0 && (
                          <ul className="mt-3 space-y-1.5">
                            {s.checklist.map((c, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm">
                                <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-foreground/30" />
                                <span className="flex-1">
                                  {c.text}
                                  {c.app && <span className="text-xs text-muted-foreground"> in {c.app.name}</span>}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {s.produces.length > 0 && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground/70">Produces </span>
                            {s.produces.join(', ')}
                          </p>
                        )}
                        <Linked items={after} word={s.stepType === 'Decision' ? 'Then' : 'Then it goes to'} />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
                </div>
              </article>
            );
          })}
        </div>
      </Section>



    </div>
  );
}
