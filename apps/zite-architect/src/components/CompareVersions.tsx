import { useCallback, useEffect, useMemo, useState } from 'react';
import { getProcessGraph, matchVersionSteps, saveVersion, setStepMatch } from 'zitejs/api';
import { X, Zap, ArrowRight, ChevronDown, CornerDownRight, ChevronsUpDown, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Textarea } from '@project/components/ui/textarea';
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
  notes?: string;
}

interface Props {
  processName: string;
  versions: VersionOption[];
  /** Full-screen only: closes the overlay. */
  onClose?: () => void;
  /** Sit inside the Overview instead of covering the screen. */
  embedded?: boolean;
}

interface Side {
  steps: ProcessStep[];
  connections: ProcessConnection[];
}

type Change = 'automated' | 'manual' | 'reassigned' | 'apps' | 'renamed';
type Filter = 'automated' | 'removed' | 'added' | 'moved';

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

interface Stats {
  steps: number;
  byHand: number;
  automated: number;
  handoffs: number;
  tools: number;
}

/** The numbers a side adds up to, so two versions can be read as a before and after. */
function statsOf(side: Side): Stats {
  const apps = new Set<string>();
  let automated = 0;
  for (const s of side.steps) {
    if (isApp(s.performedBy)) {
      automated += 1;
      apps.add(s.performedBy!.id);
    }
    for (const u of s.uses) if (isApp(u)) apps.add(u.id);
  }
  return {
    steps: side.steps.length,
    byHand: side.steps.length - automated,
    automated,
    handoffs: handoffs(side),
    tools: apps.size,
  };
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

const rowKey = (r: Row) => `${r.left?.id ?? ''}|${r.right?.id ?? ''}`;

const matchesFilter = (r: Row, f: Filter) =>
  f === 'automated'
    ? r.changes.includes('automated')
    : f === 'removed'
    ? !!r.left && !r.right
    : f === 'added'
    ? !r.left && !!r.right
    : r.changes.includes('reassigned') || r.changes.includes('manual');

/**
 * Two versions of a process side by side, matched step for step, so you can
 * see at a glance what a future version changes: what gets automated, cut,
 * added, or handed to someone else. Numbers up top, then every step in order;
 * click a step to open its full detail.
 */
export default function CompareVersions({ processName, versions, onClose, embedded }: Props) {
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
  const [filter, setFilter] = useState<Filter | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  /** The note being typed, or null when the "What changes" card is just showing. */
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  /** Notes saved here, so the card updates without reloading the process. */
  const [savedNotes, setSavedNotes] = useState<Record<string, string>>({});

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
    if (embedded || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, embedded]);

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

  // "If Guest", "If Employee": which branch of a decision a step sits on.
  const branchOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const side of [left, right]) {
      if (!side) continue;
      for (const it of buildOutline(side.steps, side.connections).items) {
        if (it.branch?.label) m.set(it.step.id, it.branch.label);
      }
    }
    return m;
  }, [left, right]);

  const summary = useMemo(() => {
    const count = (c: Change) => rows.filter((r) => r.changes.includes(c)).length;
    return {
      automated: count('automated'),
      manual: count('manual'),
      reassigned: count('reassigned'),
      apps: count('apps'),
      removed: rows.filter((r) => r.left && !r.right).length,
      added: rows.filter((r) => !r.left && r.right).length,
    };
  }, [rows]);

  const before = useMemo(() => (left ? statsOf(left) : null), [left]);
  const after = useMemo(() => (right ? statsOf(right) : null), [right]);

  // A plain-language read of the difference, written from the numbers, so the
  // card says something useful before anyone has written a note of their own.
  const story = useMemo(() => {
    if (!before || !after || !right) return '';
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const parts: string[] = [
      before.steps === after.steps
        ? `Both versions have ${plural(after.steps, 'step')}.`
        : `The process goes from ${plural(before.steps, 'step')} to ${after.steps}.`,
    ];
    if (after.automated !== before.automated) {
      const counts = new Map<string, number>();
      for (const s of right.steps) {
        if (isApp(s.performedBy)) counts.set(s.performedBy!.name, (counts.get(s.performedBy!.name) ?? 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      parts.push(
        `${plural(after.automated, 'step')} now run${after.automated === 1 ? 's' : ''} automatically${top ? `, mostly in ${top}` : ''}.`,
      );
    }
    if (after.byHand !== before.byHand) {
      parts.push(
        `Work done by people ${after.byHand < before.byHand ? 'drops' : 'rises'} from ${before.byHand} steps to ${after.byHand}.`,
      );
    }
    if (after.handoffs !== before.handoffs) {
      parts.push(`Handoffs go from ${before.handoffs} to ${after.handoffs}.`);
    }
    if (summary.added > 0 || summary.removed > 0) {
      const bits = [
        summary.added > 0 ? `${plural(summary.added, 'step')} added` : '',
        summary.removed > 0 ? `${plural(summary.removed, 'step')} removed` : '',
      ].filter(Boolean);
      parts.push(`${bits.join(' and ')}.`);
    }
    return parts.join(' ');
  }, [before, after, right, summary]);

  const rightNotes = (savedNotes[rightId] ?? versions.find((v) => v.id === rightId)?.notes ?? '').trim();

  const saveNotes = async () => {
    if (notesDraft === null) return;
    const text = notesDraft.trim();
    try {
      await saveVersion({ id: rightId, notes: text });
      setSavedNotes((prev) => ({ ...prev, [rightId]: text }));
      setNotesDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save that.');
    }
  };

  const changed = (r: Row) => !r.left || !r.right || r.changes.length > 0;
  const anyChange = rows.some(changed);
  const shown = rows.filter((r) => (!onlyChanges || changed(r)) && (!filter || matchesFilter(r, filter)));
  const unmatchedLeft = rows.filter((r) => r.left && !r.right).map((r) => r.left!);
  const unmatchedRight = rows.filter((r) => !r.left && r.right).map((r) => r.right!);
  const version = (id: string) => versions.find((v) => v.id === id);
  const allOpen = shown.length > 0 && shown.every((r) => open.has(rowKey(r)));

  const toggleRow = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleFilter = (f: Filter) => setFilter((cur) => (cur === f ? null : f));

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
    <div
      className={embedded ? 'flex h-full flex-col bg-background' : 'fixed inset-0 z-50 flex flex-col bg-background'}
      role={embedded ? undefined : 'dialog'}
      aria-label={`Compare versions of ${processName}`}
    >
      {!embedded && (
        <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{processName}</p>
            <p className="text-xs text-muted-foreground">Compare versions</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" title="Close (Esc)">
            <X className="h-5 w-5" />
          </Button>
        </header>
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 pb-10 pt-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Compare
            <VersionSelect value={leftId} versions={versions} onChange={setLeftId} />
            with
            <VersionSelect value={rightId} versions={versions} onChange={setRightId} />
            <div className="ml-auto flex items-center gap-4">
              <button
                type="button"
                onClick={() =>
                  setOpen(allOpen ? new Set() : new Set(shown.map((r) => rowKey(r))))
                }
                className="inline-flex items-center gap-1.5 text-sm hover:text-foreground"
              >
                <ChevronsUpDown className="h-3.5 w-3.5" />
                {allOpen ? 'Collapse all' : 'Expand all'}
              </button>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={onlyChanges} onCheckedChange={setOnlyChanges} />
                Only show changes
              </label>
            </div>
          </div>

          {leftId === rightId ? (
            <p className="mt-10 text-sm text-muted-foreground">Pick two different versions to compare.</p>
          ) : loading && !left ? (
            <p className="mt-10 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="mt-5 rounded-xl border border-border bg-card px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    What changes
                  </p>
                  {notesDraft === null && (
                    <button
                      type="button"
                      onClick={() => setNotesDraft(rightNotes)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                      {rightNotes ? 'Edit' : 'Write your own'}
                    </button>
                  )}
                </div>
                {notesDraft !== null ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      rows={3}
                      autoFocus
                      placeholder={story || 'In a sentence or two, what does the new version change?'}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveNotes}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setNotesDraft(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-1.5 text-base leading-relaxed">{rightNotes || story}</p>
                    {rightNotes && story && <p className="mt-2 text-sm text-muted-foreground">{story}</p>}
                  </>
                )}
              </div>

              {before && after && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <StatTile label="Steps" before={before.steps} after={after.steps} better="none" />
                  <StatTile label="Done by people" before={before.byHand} after={after.byHand} better="down" />
                  <StatTile label="Automated" before={before.automated} after={after.automated} better="up" />
                  <StatTile label="Handoffs" before={before.handoffs} after={after.handoffs} better="down" />
                  <StatTile label="Tools used" before={before.tools} after={after.tools} better="none" />
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Jump to:</span>
                {summary.automated > 0 && (
                  <Pill tone="auto" active={filter === 'automated'} onClick={() => toggleFilter('automated')}>
                    <Zap className="mr-0.5 inline h-3 w-3" />
                    {summary.automated} automated
                  </Pill>
                )}
                {summary.added > 0 && (
                  <Pill tone="new" active={filter === 'added'} onClick={() => toggleFilter('added')}>
                    {summary.added} new
                  </Pill>
                )}
                {summary.removed > 0 && (
                  <Pill tone="removed" active={filter === 'removed'} onClick={() => toggleFilter('removed')}>
                    {summary.removed} removed
                  </Pill>
                )}
                {summary.reassigned + summary.manual > 0 && (
                  <Pill tone="moved" active={filter === 'moved'} onClick={() => toggleFilter('moved')}>
                    {summary.reassigned + summary.manual} reassigned
                  </Pill>
                )}
                {summary.apps > 0 && <Pill tone="plain">{summary.apps} with app changes</Pill>}
                {filter && (
                  <button
                    type="button"
                    onClick={() => setFilter(null)}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Show all
                  </button>
                )}
              </div>

              {!anyChange && (
                <p className="mt-4 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
                  No changes yet. These two versions have the same steps, people and apps. Edit the future
                  version and the differences will show here.
                </p>
              )}

              {/* Stays in view while you scroll, so you always know which side is which. */}
              <div className="sticky top-0 z-10 -mx-6 mt-6 border-b border-border bg-background/95 px-6 py-2 backdrop-blur">
                <div className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-3">
                  <span />
                  <ColumnHead name={version(leftId)?.name ?? ''} state={version(leftId)?.state ?? ''} />
                  <ColumnHead name={version(rightId)?.name ?? ''} state={version(rightId)?.state ?? ''} />
                </div>
              </div>

              {shown.length === 0 && (
                <p className="mt-6 text-sm text-muted-foreground">Nothing matches that filter.</p>
              )}

              <ol className="mt-3 space-y-2">
                {shown.map((row, i) => {
                  const key = rowKey(row);
                  const isOpen = open.has(key);
                  return (
                    <li key={key} className="group grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-3">
                      <span className="pt-3 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                      {row.left ? (
                        <StepBox
                          step={row.left}
                          tone={row.right ? 'plain' : 'removed'}
                          open={isOpen}
                          onToggle={() => toggleRow(key)}
                          branch={branchOf.get(row.left.id)}
                        >
                          {!row.right && <Tag tone="removed">Removed</Tag>}
                          {!row.right && unmatchedRight.length > 0 && (
                            <MatchPicker options={unmatchedRight} onPick={(rid) => fixMatch(rid, row.left!.id)} />
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
                          open={isOpen}
                          onToggle={() => toggleRow(key)}
                          branch={branchOf.get(row.right.id)}
                        >
                          {!row.left && <Tag tone="new">New</Tag>}
                          {row.changes.includes('automated') && (
                            <Tag tone="auto">
                              <Zap className="mr-0.5 inline h-3 w-3" />
                              Automated
                            </Tag>
                          )}
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
                  );
                })}
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

function Pill({ tone, active, onClick, children }: {
  tone: Tone;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const base = `rounded-full px-3 py-1 text-sm font-medium ${TONES[tone]}`;
  if (!onClick) return <span className={base}>{children}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className={`${base} transition-shadow hover:shadow-sm ${active ? 'ring-2 ring-foreground/40' : ''}`}
    >
      {children}
    </button>
  );
}

function Tag({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}>{children}</span>;
}

/** One before-and-after number. Green when the change is the good kind. */
function StatTile({ label, before, after, better }: {
  label: string;
  before: number;
  after: number;
  better: 'up' | 'down' | 'none';
}) {
  const delta = after - before;
  const good = better === 'none' || delta === 0 ? null : better === 'down' ? delta < 0 : delta > 0;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5 tabular-nums">
        <span className="text-sm text-muted-foreground">{before}</span>
        <ArrowRight className="h-3 w-3 self-center text-muted-foreground" />
        <span className="text-xl font-semibold leading-none">{after}</span>
        {delta !== 0 && (
          <span
            className={`text-xs font-medium ${
              good === null ? 'text-muted-foreground' : good ? 'text-emerald-600' : 'text-amber-600'
            }`}
          >
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        )}
      </p>
    </div>
  );
}

function ColumnHead({ name, state }: { name: string; state: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate text-sm font-semibold">{name}</span>
      {state && (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {state}
        </span>
      )}
    </div>
  );
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

/**
 * One step in one version: who does it, what it says, which tools it touches.
 * Click to open the rest (checklist, outputs, what changed). Both sides of a
 * row open together, so the before and after stay level.
 */
function StepBox({ step, was, tone, open, onToggle, branch, children }: {
  step: ProcessStep;
  /** The matching step in the other version, to say what changed. */
  was?: ProcessStep | null;
  tone: Tone;
  open: boolean;
  onToggle: () => void;
  /** Which branch of a decision this step sits on, if any. */
  branch?: string;
  children?: React.ReactNode;
}) {
  const who = step.performedBy;
  const before = was?.performedBy;
  const changedHands = !!was && before?.id !== who?.id;
  const apps = appsOf(step);
  const beforeApps = was ? appsOf(was) : [];
  const added = was ? apps.filter((a) => !beforeApps.some((b) => b.id === a.id)) : [];
  const dropped = beforeApps.filter((b) => !apps.some((a) => a.id === b.id));
  const accent = isApp(who) ? 'rgb(16 185 129)' : who?.color || 'hsl(var(--border))';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={onToggle}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToggle())}
      style={{ borderLeftWidth: 4, borderLeftColor: accent }}
      className={`cursor-pointer rounded-lg border bg-card px-3 py-2.5 transition-shadow hover:shadow-md ${BORDERS[tone]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          {isApp(who) && <Zap className="h-3 w-3 text-emerald-600" />}
          <span className={`font-semibold ${changedHands ? 'text-foreground' : ''}`}>{who?.name ?? 'Unassigned'}</span>
          {changedHands && <span>(was {before?.name ?? 'unassigned'})</span>}
          {step.stepType === 'Decision' && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Decision</span>
          )}
          {step.stepType === 'Wait' && (
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium">Wait</span>
          )}
        </p>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </div>

      <p
        className={`mt-1 text-sm font-medium ${
          tone === 'removed' ? 'text-muted-foreground line-through decoration-red-400/60' : ''
        }`}
      >
        {step.title}
      </p>

      {branch && (
        <p className="mt-1 flex items-center gap-1 text-[11px] italic text-muted-foreground">
          <CornerDownRight className="h-3 w-3" />
          {branch}
        </p>
      )}

      {!open && step.description && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{step.description}</p>
      )}

      {apps.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {apps.map((a) => (
            <AppChip key={a.id} app={a} added={added.some((x) => x.id === a.id)} />
          ))}
        </div>
      )}

      {open && (
        <div className="mt-3 border-t border-border pt-3">
          <StepDetails step={step} was={was} changedHands={changedHands} added={added} dropped={dropped} />
        </div>
      )}

      {children && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
}

/** An app by logo and name, outlined in blue when this version added it. */
function AppChip({ app, added }: { app: ElementRef; added?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
        added ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300' : 'border-border text-foreground/80'
      }`}
      title={added ? `${app.name} (added in this version)` : app.name}
    >
      <ElementIcon name={app.name} image={app.image} icon={app.icon} typeIcon={app.typeIcon} color={app.color} size={16} />
      {app.name}
    </span>
  );
}

/** Everything about a step: who, notes, apps and what changed, checklist, outputs. */
function StepDetails({ step, was, changedHands, added, dropped }: {
  step: ProcessStep;
  was?: ProcessStep | null;
  changedHands: boolean;
  added: ElementRef[];
  dropped: ElementRef[];
}) {
  const who = step.performedBy;
  const apps = [who, ...step.uses].filter((e): e is ElementRef => !!e && isApp(e));
  const appName = new Map(apps.map((a) => [a.id, a.name]));
  const others = step.uses.filter((u) => !isApp(u));
  const empty =
    !step.description && step.checklist.length === 0 && step.produces.length === 0 && others.length === 0 && !changedHands && !added.length && !dropped.length;

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">
        {isApp(who) ? `Runs automatically in ${who?.name}` : `Done by ${who?.name ?? 'nobody yet'}`}
        {changedHands && ` · was ${was?.performedBy?.name ?? 'unassigned'}`}
      </p>

      {step.description && <p className="text-muted-foreground">{step.description}</p>}

      {(added.length > 0 || dropped.length > 0) && (
        <div className="space-y-1 text-xs">
          {added.length > 0 && <p><span className="font-semibold text-blue-700 dark:text-blue-300">Now uses</span> {added.map((a) => a.name).join(', ')}</p>}
          {dropped.length > 0 && <p><span className="font-semibold text-red-700 dark:text-red-300">No longer uses</span> {dropped.map((a) => a.name).join(', ')}</p>}
        </div>
      )}

      {others.length > 0 && (
        <p className="text-xs text-muted-foreground">With {others.map((o) => o.name).join(', ')}</p>
      )}

      {step.checklist.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Checklist</p>
          <ul className="space-y-0.5">
            {step.checklist.map((c) => (
              <li key={c.id} className="text-xs">
                · {c.appId && appName.get(c.appId) ? <span className="text-muted-foreground">In {appName.get(c.appId)}: </span> : null}
                {c.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {step.produces.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Produces
          {step.produces.map((p) => (
            <span key={p.id} className="rounded-full border border-border px-2 py-0.5 text-foreground">
              {p.name}
            </span>
          ))}
        </p>
      )}

      {empty && <p className="text-xs text-muted-foreground">No more details on this step yet.</p>}
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
