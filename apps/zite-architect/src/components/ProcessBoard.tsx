import { useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { GetProcessesOutputType, goLive, createVersion } from 'zitejs/api';
import { GraduationCap, Radio, Workflow, GitBranchPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@project/components/ui/dialog';
import { tintFor, initialsOf } from '@/lib/tints';
import ElementIcon from './ElementIcon';

type ProcessRow = GetProcessesOutputType['processes'][number];
type ColumnKey = 'draft' | 'next' | 'live';

interface Props {
  processes: ProcessRow[];
  onOpen: (id: string) => void;
  onTrain: (id: string) => void;
  /** Editors can drag cards between columns. Viewers just look. */
  canMove: boolean;
  /** Called after a move, so the list can reload. */
  onChanged: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const today = () => new Date().toLocaleDateString('en-CA');

const isLive = (p: ProcessRow) => p.versions.some((v) => v.state === 'Current');
const hasNext = (p: ProcessRow) => p.versions.some((v) => v.state === 'Future');
const columnOf = (p: ProcessRow): ColumnKey => (!isLive(p) ? 'draft' : hasNext(p) ? 'next' : 'live');

/** The newest version waiting to go live, or the newest one if none is waiting. */
const versionToLaunch = (p: ProcessRow) => {
  const byRecent = [...p.versions].sort((a, b) => b.lastEdited.localeCompare(a.lastEdited));
  return byRecent.find((v) => v.state === 'Future') ?? byRecent.find((v) => v.state !== 'Current') ?? null;
};

const COLUMNS: { key: ColumnKey; title: string; hint: string; dot: string }[] = [
  { key: 'draft', title: 'Draft', hint: 'Not live yet', dot: 'hsl(38 92% 50%)' },
  { key: 'next', title: 'Update on the way', hint: 'Live now, with a newer version being prepared', dot: 'hsl(217 80% 55%)' },
  { key: 'live', title: 'Live', hint: 'How the work is done today', dot: 'hsl(152 55% 42%)' },
];

interface PendingMove {
  process: ProcessRow;
  to: ColumnKey;
}

/**
 * Processes in columns by where they stand, with Live on the right. Editors can
 * drag a card on: Draft or Update on the way into Live makes that version live,
 * and Live into Update on the way starts a new version from the live one.
 * A move always asks first, because it changes what the whole team is trained on.
 */
export default function ProcessBoard({ processes, onOpen, onTrain, canMove, onChanged }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [liveDay, setLiveDay] = useState(today());
  const [busy, setBusy] = useState(false);
  // Letting go of a drag can register as a click on the card, which would open the process.
  const justDragged = useRef(false);

  // A small drag distance, so a plain click still opens the process.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const columns = COLUMNS.map((c) => ({ ...c, items: processes.filter((p) => columnOf(p) === c.key) }));
  const active = processes.find((p) => p.id === activeId) ?? null;

  const handleStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const handleEnd = (e: DragEndEvent) => {
    setActiveId(null);
    justDragged.current = true;
    setTimeout(() => {
      justDragged.current = false;
    }, 200);
    const process = processes.find((p) => p.id === String(e.active.id));
    const to = e.over?.id as ColumnKey | undefined;
    if (!process || !to) return;
    const from = columnOf(process);
    if (from === to) return;

    if (to === 'live') {
      if (!versionToLaunch(process)) {
        toast.error('There is no newer version to make live.');
        return;
      }
      setLiveDay(today());
      setPending({ process, to });
    } else if (to === 'next' && from === 'live') {
      setPending({ process, to });
    } else {
      toast.error(
        to === 'draft'
          ? "A process can't go back to draft from here. Use Manage versions inside the process."
          : 'Drag a live process to "Update on the way" to start a new version of it.',
      );
    }
  };

  const confirm = async () => {
    if (!pending) return;
    const { process, to } = pending;
    setBusy(true);
    try {
      if (to === 'live') {
        const version = versionToLaunch(process);
        if (!version) return;
        await goLive({ versionId: version.id, date: liveDay });
        toast.success(`${process.name} is live on ${version.name}`);
      } else {
        const current = process.versions.find((v) => v.state === 'Current');
        if (!current) return;
        await createVersion({ sourceVersionId: current.id, name: 'Future state', state: 'Future', notes: '' });
        toast.success(`A new version of ${process.name} is ready to change`);
      }
      setPending(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not make that change.');
    } finally {
      setBusy(false);
    }
  };

  const launching = pending?.to === 'live' && pending ? versionToLaunch(pending.process) : null;
  const replaced = pending?.to === 'live' ? pending.process.versions.find((v) => v.state === 'Current') ?? null : null;

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleStart} onDragEnd={handleEnd} onDragCancel={() => setActiveId(null)}>
        <div className="grid gap-4 lg:grid-cols-3">
          {columns.map((col) => (
            <BoardColumn key={col.key} column={col} dragging={!!active} canMove={canMove}>
              {col.items.length === 0 && (
                <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
                  {canMove && active ? 'Drop here' : 'Nothing here right now.'}
                </p>
              )}
              {col.items.map((p) => (
                <BoardCard
                  key={p.id}
                  process={p}
                  canMove={canMove}
                  hidden={p.id === activeId}
                  onOpen={(id) => {
                    if (!justDragged.current) onOpen(id);
                  }}
                  onTrain={onTrain}
                />
              ))}
            </BoardColumn>
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {active ? <CardBody process={active} onTrain={() => {}} floating /> : null}
        </DragOverlay>
      </DndContext>

      {pending && (
        <Dialog open onOpenChange={(o) => !o && !busy && setPending(null)}>
          <DialogContent className="max-w-md">
            {pending.to === 'live' ? (
              <>
                <DialogHeader>
                  <DialogTitle className="text-base">Make {launching?.name ?? 'this version'} live?</DialogTitle>
                  <DialogDescription>
                    {pending.process.name} moves to Live.
                    {replaced ? ` ${replaced.name} is retired on the day you pick, and kept with the dates it ran.` : ''} From
                    then on, new people are trained on it.
                  </DialogDescription>
                </DialogHeader>
                <label className="flex items-center gap-3 text-sm">
                  Goes live on
                  <Input type="date" value={liveDay} onChange={(e) => setLiveDay(e.target.value)} className="h-9 w-[11rem]" />
                </label>
                <DialogFooter>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPending(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" disabled={busy || !liveDay} onClick={confirm}>
                    <Radio className="mr-1.5 h-3.5 w-3.5" /> Make it live
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="text-base">Start a new version of {pending.process.name}?</DialogTitle>
                  <DialogDescription>
                    This copies the live version as "Future state", so you can change it without touching what the team uses
                    today. Nothing changes for anyone until you make it live.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPending(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" disabled={busy} onClick={confirm}>
                    <GitBranchPlus className="mr-1.5 h-3.5 w-3.5" /> Start new version
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function BoardColumn({ column, dragging, canMove, children }: {
  column: { key: ColumnKey; title: string; hint: string; dot: string; items: ProcessRow[] };
  dragging: boolean;
  canMove: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key, disabled: !canMove });
  return (
    <section
      ref={setNodeRef}
      className={`rounded-2xl p-3 transition-colors ${
        isOver ? 'bg-primary/10 ring-2 ring-primary/30' : dragging && canMove ? 'bg-muted/80' : 'bg-muted/50'
      }`}
    >
      <header className="flex items-center gap-2 px-1.5 pb-3 pt-1">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: column.dot }} />
        <h3 className="text-sm font-semibold">{column.title}</h3>
        <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {column.items.length}
        </span>
        <span className="ml-auto hidden truncate text-[11px] text-muted-foreground xl:inline">{column.hint}</span>
      </header>
      <div className="min-h-[96px] space-y-3">{children}</div>
    </section>
  );
}

function BoardCard({ process, canMove, hidden, onOpen, onTrain }: {
  process: ProcessRow;
  canMove: boolean;
  hidden: boolean;
  onOpen: (id: string) => void;
  onTrain: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: process.id, disabled: !canMove });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(process.id)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(process.id)}
      className={`${canMove ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${hidden ? 'opacity-30' : ''}`}
      title={canMove ? 'Click to open, or drag to change where it stands' : undefined}
    >
      <CardBody process={process} onTrain={() => onTrain(process.id)} />
    </div>
  );
}

function CardBody({ process: p, onTrain, floating }: { process: ProcessRow; onTrain: () => void; floating?: boolean }) {
  const tint = tintFor(p.name);
  return (
    <article
      className={`group rounded-xl border border-border bg-card p-3.5 transition-all ${
        floating
          ? 'rotate-1 shadow-[0_12px_32px_rgba(16,24,40,0.18)]'
          : 'shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_6px_18px_rgba(16,24,40,0.08)]'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: tint.bg, color: tint.fg }}
        >
          <Workflow className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-tight">{p.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {p.stepCount > 0 ? `${plural(p.stepCount, 'step')} · ${plural(p.people.length, 'role')}` : 'No steps yet'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex -space-x-1.5">
          {p.people.slice(0, 4).map((person) => {
            const t = tintFor(person.name);
            return (
              <span
                key={person.id}
                title={person.name}
                className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold ring-2 ring-card"
                style={{ backgroundColor: t.bg, color: t.fg }}
              >
                {initialsOf(person.name)}
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          {p.apps.slice(0, 4).map((a) => (
            <span key={a.id} title={a.name} className="rounded border border-border bg-background p-0.5">
              <ElementIcon name={a.name} image={a.image} icon={a.icon} typeIcon={a.typeIcon} color={a.color} size={12} />
            </span>
          ))}
          {p.apps.length > 4 && <span className="text-[10px] text-muted-foreground">+{p.apps.length - 4}</span>}
        </div>
      </div>

      {p.stepCount > 0 && !floating && (
        <Button
          variant="ghost"
          size="sm"
          className="-mb-1 mt-2 h-7 w-full justify-start px-1 text-xs text-muted-foreground hover:text-primary"
          // The card is draggable, so stop the press here from starting a drag or opening the process.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onTrain();
          }}
        >
          <GraduationCap className="mr-1.5 h-3.5 w-3.5" /> Start training
        </Button>
      )}
    </article>
  );
}
