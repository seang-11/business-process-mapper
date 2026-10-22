import { useCallback, useEffect, useMemo, useState } from 'react';
import { getProcessGraph, matchVersionSteps, setStepMatch } from 'zitejs/api';
import { X, Zap, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Switch } from '@project/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import type { ElementRef, ProcessConnection, ProcessStep } from '@/types';
import { buildOutline } from '@/lib/walkthrough';
import ElementIcon from './ElementIcon';

interface VersionOption {
  id: string;
  name: string;
  state: string;
  lastEdited: string;
}

interface Props {
  processName: string;
  versions: VersionOption[];
  onClose: () => void;
}

interface Side {
  steps: ProcessStep[];
  connections: ProcessConnection[];
}

type Change = 'automated' | 'manual' | 'reassigned' | 'apps' | 'renamed';

interface Row {
  left: ProcessStep | null;
  right: ProcessStep | null;
  changes: Change[];
}

const isApp = (e: ElementRef | null | undefined): boolean => e?.actorClass === 'System';
const appsOf = (s: ProcessStep) => s.uses.filter((u) => isApp(u) && u.id !== s.performedBy?.id);

/** Handoffs: arrows where the work passes from one person or app to another. */
function handoffs(side: Side) {
  const byId = new Map(side.steps.map((s) => [s.id, s]));
  return side.connections.filter((c) => {
    const a = byId.get(c.fromStepId);
    const b = byId.get(c.toStepId);
    return a && b && a.performedBy?.id !== b.performedBy?.id;
  }).length;
}

function changesBetween(l: ProcessStep, r: ProcessStep): Change[] {
  const out: Change[] = [];
  const lp = l.performedBy;
  const rp = r.performedBy;
  if (!isApp(lp) && isApp(rp)) out.push('automated');
  else if (isApp(lp) && !isApp(rp)) out.push('manual');
  else if (lp?.id !== rp?.id) out.push('reassigned');
  const la = new Set(appsOf(l).map((a) => a.id));
  const ra = new Set(appsOf(r).map((a) => a.id));
  if (la.size !== ra.size || [...la].some((id) => !ra.has(id))) out.push('apps');
  if (l.title.trim() !== r.title.trim()) out.push('renamed');
  return out;
}

/**
 * Two versions of a process side by side, matched step for step, so you can
 * see at a glance what a future version changes: what gets automated, cut,
 * added, or handed to someone else.
 */
export default function CompareVersions({ processName, versions, onClose }: Props) {
  const defaults = useMemo(() => {
    const current = versions.find((v) => v.state === 'Current') ?? versions[0];
    const future =
      versions
        .filter((v) => v.id !== current?.id && /future/i.test(v.state))
        .sort((a, b) => b.lastEdited.localeCompare(a.lastEdited))[0] ??
      versions.find((v) => v.id !== current?.id);
    return { left: current?.id ?? '', right: future?.id ?? '' };
  }, [versions]);

  const [leftId, setLeftId] = useState(defaults.left);
  const [rightId, setRightId] = useState(defaults.right);
  const [left, setLeft] = useState<Side | null>(null);
  const [right, setRight] = useState<Side | null>(null);
  const [matches, setMatches] = useState<{ leftId: string; rightId: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyChanges, setOnlyChanges] = useState(false);

  const load = useCallback(async () => {
    if (!leftId || !rightId || leftId === rightId) return;
    setLoading(true);
    try {
      const [l, r, m] = await Promise.all([
        getProcessGraph({ versionId: leftId }),
        getProcessGraph({ versionId: rightId }),
        matchVersionSteps({ leftVersionId: leftId, rightVersionId: rightId }),
      ]);
      setLeft({ steps: l.steps as ProcessStep[], connections: l.connections });
      setRight({ steps: r.steps as ProcessStep[], connections: r.connections });
      setMatches(m.matches);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load the versions.');
    } finally {
      setLoading(false);
    }
  }, [leftId, rightId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = useMemo<Row[]>(() => {
    if (!left || !right) return [];
    const leftOrder = buildOutline(left.steps, left.connections).items.map((i) => i.step);
    const rightOrder = buildOutline(right.steps, right.connections).items.map((i) => i.step);
    const rightById = new Map(rightOrder.map((s) => [s.id, s]));
    const toRight = new Map(matches.map((m) => [m.leftId, m.rightId]));

    // The current version's order is the spine; matched steps sit beside it.
    const rows: Row[] = leftOrder.map((l) => {
      const r = rightById.get(toRight.get(l.id) ?? '') ?? null;
      return { left: l, right: r, changes: r ? changesBetween(l, r) : [] };
    });
    // New steps go in just after whatever comes before them in their version.
    const rowOfRight = new Map(rows.filter((r) => r.right).map((r, i) => [r.right!.id, r]));
    let after: Row | null = null;
    for (const r of rightOrder) {
      const existing = rowOfRight.get(r.id);
      if (existing) {
        after = existing;
        continue;
      }
      const row: Row = { left: null, right: r, changes: [] };
      const at = after ? rows.indexOf(after) + 1 : 0;
      rows.splice(at, 0, row);
      after = row;
    }
    return rows;
  }, [left, right, matches]);

  const summary = useMemo(() => {
    const count = (c: Change) => rows.filter((r) => r.changes.includes(c)).length;
    return {
      leftSteps: left?.steps.length ?? 0,
      rightSteps: right?.steps.length ?? 0,
      automated: count('automated'),
      manual: count('manual'),
      reassigned: count('reassigned'),
      apps: count('apps'),
      removed: rows.filter((r) => r.left && !r.right).length,
      added: rows.filter((r) => !r.left && r.right).length,
      handoffDelta: left && right ? handoffs(right) - handoffs(left) : 0,
    };
  }, [rows, left, right]);

  const changed = (r: Row) => !r.left || !r.right || r.changes.length > 0;
  const anyChange = rows.some(changed);
  const shown = onlyChanges ? rows.filter(changed) : rows;
  const unmatchedLeft = rows.filter((r) => r.left && !r.right).map((r) => r.left!);
  const unmatchedRight = rows.filter((r) => !r.left && r.right).map((r) => r.right!);
  const versionName = (id: string) => versions.find((v) => v.id === id)?.name ?? '';

  const fixMatch = async (rightStepId: string, leftStepId: string | null, alsoClear?: string) => {
    try {
      await setStepMatch({ stepId: rightStepId, matchStepId: leftStepId });
      if (alsoClear) await setStepMatch({ stepId: alsoClear, matchStepId: null });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the match.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background" role="dialog" aria-label={`Compare versions of ${processName}`}>
      <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{processName}</p>
          <p className="text-xs text-muted-foreground">Compare versions</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" title="Close (Esc)">
          <X className="h-5 w-5" />
        </Button>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Compare
            <VersionSelect value={leftId} versions={versions} onChange={setLeftId} />
            with
            <VersionSelect value={rightId} versions={versions} onChange={setRightId} />
            <label className="ml-auto flex items-center gap-2 text-sm">
              <Switch checked={onlyChanges} onCheckedChange={setOnlyChanges} />
              Only show changes
            </label>
          </div>

          {leftId === rightId ? (
            <p className="mt-10 text-sm text-muted-foreground">Pick two different versions to compare.</p>
          ) : loading && !left ? (
            <p className="mt-10 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                <Pill tone="plain">
                  {summary.leftSteps} steps <ArrowRight className="mx-0.5 inline h-3 w-3" /> {summary.rightSteps} steps
                </Pill>
                {summary.automated > 0 && <Pill tone="auto"><Zap className="mr-0.5 inline h-3 w-3" />{summary.automated} automated</Pill>}
                {summary.removed > 0 && <Pill tone="removed">{summary.removed} removed</Pill>}
                {summary.added > 0 && <Pill tone="new">{summary.added} new</Pill>}
                {summary.reassigned > 0 && <Pill tone="moved">{summary.reassigned} reassigned</Pill>}
                {summary.manual > 0 && <Pill tone="moved">{summary.manual} now done by hand</Pill>}
                {summary.apps > 0 && <Pill tone="plain">{summary.apps} with app changes</Pill>}
                {summary.handoffDelta !== 0 && (
                  <Pill tone="plain">
                    {Math.abs(summary.handoffDelta)} {summary.handoffDelta < 0 ? 'fewer' : 'more'} handoff
                    {Math.abs(summary.handoffDelta) === 1 ? '' : 's'}
                  </Pill>
                )}
              </div>

              {!anyChange && (
                <p className="mt-4 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
                  No changes yet. These two versions have the same steps, people and apps. Edit the future
                  version and the differences will show here.
                </p>
              )}

              <div className="mt-6 grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span />
                <span className="truncate">{versionName(leftId)}</span>
                <span className="truncate">{versionName(rightId)}</span>
              </div>

              <ol className="mt-2 space-y-2">
                {shown.map((row, i) => (
                  <li
                    key={`${row.left?.id ?? ''}|${row.right?.id ?? ''}`}
                    className="group grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-3"
                  >
                    <span className="pt-3 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                    {row.left ? (
                      <StepBox step={row.left} tone={row.right ? 'plain' : 'removed'}>
                        {!row.right && <Tag tone="removed">Removed</Tag>}
                        {!row.right && unmatchedRight.length > 0 && (
                          <MatchPicker
                            options={unmatchedRight}
                            onPick={(rid) => fixMatch(rid, row.left!.id)}
                          />
                        )}
                      </StepBox>
                    ) : (
                      <Gap>Not in this version</Gap>
                    )}
                    {row.right ? (
                      <StepBox
                        step={row.right}
                        was={row.left}
                        tone={!row.left ? 'new' : row.changes.includes('automated') ? 'auto' : 'plain'}
                      >
                        {!row.left && <Tag tone="new">New</Tag>}
                        {row.changes.includes('automated') && <Tag tone="auto"><Zap className="mr-0.5 inline h-3 w-3" />Automated</Tag>}
                        {row.changes.includes('manual') && <Tag tone="moved">Now done by hand</Tag>}
                        {row.changes.includes('reassigned') && <Tag tone="moved">Reassigned</Tag>}
                        {row.changes.includes('apps') && <Tag tone="plain">Apps changed</Tag>}
                        {row.changes.includes('renamed') && <Tag tone="plain">Renamed</Tag>}
                        {!row.left && unmatchedLeft.length > 0 && (
                          <MatchPicker options={unmatchedLeft} onPick={(lid) => fixMatch(row.right!.id, lid)} />
                        )}
                        {row.left && (
                          <button
                            type="button"
                            onClick={() => fixMatch(row.right!.id, null, row.left!.id)}
                            className="ml-auto text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground hover:underline group-hover:opacity-100"
                          >
                            Not the same step
                          </button>
                        )}
                      </StepBox>
                    ) : (
                      <Gap>Removed</Gap>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// --- Pieces ---

const TONES = {
  plain: 'bg-muted text-muted-foreground',
  auto: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  removed: 'bg-red-50 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  new: 'bg-blue-50 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
  moved: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
} as const;
type Tone = keyof typeof TONES;

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`rounded-full px-3 py-1 text-sm font-medium ${TONES[tone]}`}>{children}</span>;
}

function Tag({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}>{children}</span>;
}

function Gap({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[64px] items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
      {children}
    </div>
  );
}

const BORDERS: Record<Tone, string> = {
  plain: 'border-border',
  auto: 'border-emerald-400/70',
  removed: 'border-red-300/70 bg-red-50/40 dark:bg-red-500/5',
  new: 'border-blue-400/70',
  moved: 'border-amber-400/70',
};

function StepBox({ step, was, tone, children }: {
  step: ProcessStep;
  /** The matching step in the other version, to say who did it before. */
  was?: ProcessStep | null;
  tone: Tone;
  children?: React.ReactNode;
}) {
  const who = step.performedBy;
  const before = was?.performedBy;
  const changedHands = was && before?.id !== who?.id;
  return (
    <div className={`rounded-lg border bg-card px-3 py-2.5 ${BORDERS[tone]}`}>
      <p className={`text-sm font-medium ${tone === 'removed' ? 'text-muted-foreground line-through decoration-red-400/60' : ''}`}>
        {step.title}
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
        {isApp(who) && <Zap className="h-3 w-3 text-emerald-600" />}
        <span className={changedHands ? 'font-semibold text-foreground' : ''}>{who?.name ?? 'Unassigned'}</span>
        {changedHands && <span>(was {before?.name ?? 'unassigned'})</span>}
        {appsOf(step).length > 0 && (
          <span className="ml-1 inline-flex items-center gap-1">
            {appsOf(step).map((a) => (
              <span key={a.id} title={a.name}>
                <ElementIcon name={a.name} image={a.image} icon={a.icon} typeIcon={a.typeIcon} color={a.color} size={12} />
              </span>
            ))}
          </span>
        )}
      </p>
      {children && <div className="mt-2 flex flex-wrap items-center gap-1.5">{children}</div>}
    </div>
  );
}

function VersionSelect({ value, versions, onChange }: {
  value: string;
  versions: VersionOption[];
  onChange: (id: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[200px] text-sm text-foreground">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {versions.map((v) => (
          <SelectItem key={v.id} value={v.id}>
            {v.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Pair an unmatched step with one from the other side, when the guess missed it. */
function MatchPicker({ options, onPick }: { options: ProcessStep[]; onPick: (id: string) => void }) {
  return (
    <Select value="" onValueChange={onPick}>
      <SelectTrigger className="ml-auto h-6 w-auto gap-1 border-none px-1.5 text-xs text-muted-foreground opacity-0 shadow-none transition-opacity hover:text-foreground group-hover:opacity-100 focus:opacity-100">
        <span>Same as…</span>
      </SelectTrigger>
      <SelectContent>
        {options.map((s) => (
          <SelectItem key={s.id} value={s.id} className="text-xs">
            {s.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
