import { useEffect, useMemo, useState } from 'react';
import { GripVertical, Plus, Trash2, X } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { saveStep, deleteStep, saveConnection, deleteConnection } from 'zitejs/api';
import { toast } from 'sonner';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Textarea } from '@project/components/ui/textarea';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@project/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@project/components/ui/command';
import type {
  ChecklistItem,
  ElementSummary,
  ElementType,
  ProcessConnection,
  ProcessStep,
} from '@/types';
import { TYPE_KEYS } from '@/lib/typeKeys';
import ElementPicker from './ElementPicker';

/**
 * What kind of thing happens here: work, a branch, elapsed time, or another
 * process. An approval isn't a fifth kind — it's a Decision whose branches are
 * approve and reject, or, when nothing branches, just a Task.
 */
const STEP_TYPES = ['Task', 'Decision', 'Wait', 'Sub-process'];

/**
 * A path between this step and a neighbour, in either direction. No id means
 * it hasn't been created yet.
 */
interface Path {
  id?: string;
  /** The step at the other end — the one before, or the one after. */
  otherStepId: string;
  label: string;
}

/**
 * One list of neighbouring steps. Used for both directions so "previous" and
 * "next" read and behave identically: each row is a step, the label names the
 * path to it, and the picker adds one.
 */
function PathList({
  title,
  rows,
  onChange,
  candidates,
  stepById,
  labelPlaceholder,
  prompt,
  emptyText,
}: {
  title: string;
  rows: Path[];
  onChange: (rows: Path[]) => void;
  candidates: ProcessStep[];
  stepById: Map<string, ProcessStep>;
  labelPlaceholder: (otherStepId: string) => string;
  prompt: string;
  emptyText: string;
}) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');

  const matches = candidates.filter((s) =>
    s.title.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{title}</Label>
        <Popover
          modal
          open={adding}
          onOpenChange={(o) => {
            setAdding(o);
            if (!o) setQuery('');
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              disabled={candidates.length === 0}
            >
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="end">
            <Command shouldFilter={false}>
              <CommandInput placeholder={prompt} value={query} onValueChange={setQuery} />
              <CommandList className="max-h-56">
                {matches.length === 0 && (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {query.trim() ? `Nothing matches “${query.trim()}”.` : 'No other steps yet.'}
                  </div>
                )}
                <CommandGroup>
                  {matches.map((s) => (
                    <CommandItem
                      key={s.id}
                      value={s.id}
                      className="text-xs"
                      onSelect={() => {
                        onChange([...rows, { otherStepId: s.id, label: '' }]);
                        setAdding(false);
                        setQuery('');
                      }}
                    >
                      {s.stepType === 'Decision' && (
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 border-[1.5px] border-amber-600 rotate-45 shrink-0 mr-2"
                        />
                      )}
                      <span className="truncate">{s.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground border border-dashed border-border rounded-md px-2.5 py-3 text-center">
          {emptyText}
        </p>
      ) : (
        <div className="border border-border rounded-md max-h-40 overflow-y-auto divide-y divide-border">
          {rows.map((row) => {
            const other = stepById.get(row.otherStepId);
            return (
              <div key={row.otherStepId} className="flex items-center gap-2 px-2.5 py-1.5">
                {other?.stepType === 'Decision' && (
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 border-[1.5px] border-amber-600 rotate-45 shrink-0"
                  />
                )}
                <span className="text-xs truncate flex-1 min-w-0">
                  {other?.title ?? 'Step'}
                </span>
                <Input
                  value={row.label}
                  onChange={(e) =>
                    onChange(
                      rows.map((r) =>
                        r.otherStepId === row.otherStepId
                          ? { ...r, label: e.target.value }
                          : r,
                      ),
                    )
                  }
                  placeholder={labelPlaceholder(row.otherStepId)}
                  className="h-7 w-28 text-[11px] shrink-0"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() =>
                    onChange(rows.filter((r) => r.otherStepId !== row.otherStepId))
                  }
                  aria-label={`Remove ${other?.title ?? 'step'}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A checklist row: drag by the handle, edit in place, remove on the right. */
function ChecklistRow({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: ChecklistItem;
  index: number;
  onChange: (text: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-center gap-1.5 bg-background"
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground hover:text-foreground touch-none shrink-0"
        aria-label={`Reorder item ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="text-[10px] text-muted-foreground w-4 text-right shrink-0">
        {index + 1}.
      </span>
      <Input
        value={item.text}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={onRemove}
        aria-label="Remove checklist item"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

interface Props {
  step: ProcessStep | null;
  versionId: string;
  /** The process being edited, so it can't be its own sub-process. */
  processId: string;
  elements: ElementSummary[];
  types: ElementType[];
  allSteps: ProcessStep[];
  connections: ProcessConnection[];
  onSaved: () => void;
  /** Take the step off the canvas immediately, before the refetch lands. */
  onDeleted: (stepId: string) => void;
  onClose: () => void;
  onCreateElement: (name: string, typeId: string) => Promise<string | null>;
}

export default function StepDialog({
  step,
  versionId,
  processId,
  elements,
  types,
  allSteps,
  connections,
  onSaved,
  onDeleted,
  onClose,
  onCreateElement,
}: Props) {
  const [title, setTitle] = useState(step?.title ?? '');
  const [description, setDescription] = useState(step?.description ?? '');
  const [stepType, setStepType] = useState(step?.stepType || 'Task');
  const [performedBy, setPerformedBy] = useState<string[]>(
    step?.performedBy ? [step.performedBy.id] : [],
  );
  const [uses, setUses] = useState<string[]>(step?.uses.map((u) => u.id) ?? []);
  const [produces, setProduces] = useState<string[]>(step?.produces.map((p) => p.id) ?? []);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(step?.checklist ?? []);
  const [subProcessId, setSubProcessId] = useState<string | null>(
    step?.subProcessId ?? null,
  );
  const [saving, setSaving] = useState(false);

  // The steps either side of this one. Same shape both directions, so both
  // lists look and behave the same.
  const incoming = useMemo(
    () => (step ? connections.filter((c) => c.toStepId === step.id) : []),
    [step, connections],
  );
  const outgoing = useMemo(
    () => (step ? connections.filter((c) => c.fromStepId === step.id) : []),
    [step, connections],
  );

  const initialPrevious = useMemo<Path[]>(
    () => incoming.map((c) => ({ id: c.id, otherStepId: c.fromStepId, label: c.label })),
    [incoming],
  );
  const initialNext = useMemo<Path[]>(
    () => outgoing.map((c) => ({ id: c.id, otherStepId: c.toStepId, label: c.label })),
    [outgoing],
  );

  const [previous, setPrevious] = useState<Path[]>(initialPrevious);
  const [next, setNext] = useState<Path[]>(initialNext);
  useEffect(() => setPrevious(initialPrevious), [initialPrevious]);
  useEffect(() => setNext(initialNext), [initialNext]);

  const stepById = useMemo(() => new Map(allSteps.map((s) => [s.id, s])), [allSteps]);

  // A step can't link to itself, or twice to the same neighbour.
  const candidatesFor = (rows: Path[]) =>
    allSteps.filter(
      (s) => s.id !== step?.id && !rows.some((r) => r.otherStepId === s.id),
    );

  // Elements already in play in this process sort to the top of every picker.
  const recentIds = useMemo(() => {
    const ids: string[] = [];
    for (const s of allSteps) {
      if (s.performedBy) ids.push(s.performedBy.id);
      for (const u of s.uses) ids.push(u.id);
      for (const p of s.produces) ids.push(p.id);
    }
    return ids;
  }, [allSteps]);

  // The panel isn't a Radix dialog any more, so Escape is ours to handle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const checklistSensors = useSensors(
    // A few pixels of travel before a drag starts, so clicking into the text
    // field still works.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleChecklistDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setChecklist((prev) => {
      const from = prev.findIndex((c) => c.id === active.id);
      const to = prev.findIndex((c) => c.id === over.id);
      return from === -1 || to === -1 ? prev : arrayMove(prev, from, to);
    });
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Give the step a title.');
      return;
    }
    if (!performedBy[0]) {
      toast.error(
        stepType === 'Wait'
          ? 'Say who or what is being waited on.'
          : 'Say who or what performs this step.',
      );
      return;
    }
    setSaving(true);
    try {
      const nextSequence =
        step?.sequence ??
        (allSteps.length ? Math.max(...allSteps.map((s) => s.sequence)) + 1 : 1);

      const { id } = await saveStep({
        id: step?.id,
        versionId,
        title: title.trim(),
        description,
        stepType,
        performedById: performedBy[0] ?? null,
        useIds: uses,
        produceIds: produces,
        subProcessId: stepType === 'Sub-process' ? subProcessId : null,
        sequence: nextSequence,
        checklist: checklist.filter((c) => c.text.trim()),
      });

      // Both directions reconcile the same way: drop what was removed, then
      // create or relabel the rest. Edges are written after the step exists,
      // so this works for a step being added as well as one being edited.
      const reconcile = async (
        rows: Path[],
        before: ProcessConnection[],
        endpoints: (otherStepId: string) => { fromStepId: string; toStepId: string },
      ) => {
        for (const c of before) {
          if (!rows.some((r) => r.id === c.id)) await deleteConnection({ id: c.id });
        }
        for (const row of rows) {
          const prior = before.find((c) => c.id === row.id);
          if (prior && prior.label === row.label.trim()) continue;
          await saveConnection({
            id: row.id,
            versionId,
            ...endpoints(row.otherStepId),
            label: row.label.trim(),
            condition: prior?.condition ?? '',
          });
        }
      };

      await reconcile(previous, incoming, (otherStepId) => ({
        fromStepId: otherStepId,
        toStepId: id,
      }));
      await reconcile(next, outgoing, (otherStepId) => ({
        fromStepId: id,
        toStepId: otherStepId,
      }));

      toast.success(step ? 'Step updated' : 'Step added');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the step.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!step) return;
    setSaving(true);
    try {
      const res = await deleteStep({ id: step.id, versionId });
      toast.success(
        res.connectionsRemoved
          ? `Step deleted, ${res.connectionsRemoved} connection${res.connectionsRemoved === 1 ? '' : 's'} cleaned up`
          : 'Step deleted',
      );
      // Off the canvas now; the refetch only confirms it.
      onDeleted(step.id);
      onClose();
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the step.');
    } finally {
      setSaving(false);
    }
  };

  return (
    // A panel rather than a modal: wiring a step to the ones around it is the
    // moment you most need the diagram in view. Docked beside the canvas on a
    // wide screen, overlaid on a narrow one.
    <aside
      role="dialog"
      aria-label={step ? 'Edit step' : 'Add step'}
      className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[26rem] shrink-0 flex-col border-l border-border bg-background shadow-xl lg:static lg:shadow-none"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold">{step ? 'Edit step' : 'Add step'}</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">What happens</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Verify client documents"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={stepType} onValueChange={setStepType}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STEP_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {stepType === 'Sub-process' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Expands into</Label>
              <ElementPicker
                elements={elements}
                types={types}
                typeKeys={[TYPE_KEYS.process]}
                value={subProcessId ? [subProcessId] : []}
                onChange={(ids) => setSubProcessId(ids[0] ?? null)}
                excludeIds={processId ? [processId] : []}
                clearable
                placeholder="Which process runs here?"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">
              {stepType === 'Wait' ? 'Waiting on' : 'Performed by'}
              <span className="text-destructive ml-0.5">*</span>
            </Label>
            <ElementPicker
              elements={elements}
              types={types}
              category="Actor"
              value={performedBy}
              onChange={setPerformedBy}
              recentIds={recentIds}
              onCreate={onCreateElement}
              placeholder={
                stepType === 'Wait'
                  ? 'Who or what are we waiting on?'
                  : 'Who or what does this?'
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Uses</Label>
            <ElementPicker
              elements={elements}
              types={types}
              category="Resource"
              multiple
              value={uses}
              onChange={setUses}
              recentIds={recentIds}
              onCreate={onCreateElement}
              placeholder="Apps, documents, equipment…"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Produces</Label>
            <ElementPicker
              elements={elements}
              types={types}
              category="Output"
              multiple
              value={produces}
              onChange={setProduces}
              recentIds={recentIds}
              onCreate={onCreateElement}
              placeholder="What exists after this step?"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Anything the person doing this needs to know."
              rows={2}
            />
          </div>

          <PathList
            title="Comes before this step"
            rows={previous}
            onChange={setPrevious}
            candidates={candidatesFor(previous)}
            stepById={stepById}
            labelPlaceholder={(otherId) =>
              stepById.get(otherId)?.stepType === 'Decision' ? 'Approved' : 'Label'
            }
            prompt="Which step comes before?"
            emptyText="Nothing comes before this step — it starts the process."
          />

          <PathList
            title="Comes after this step"
            rows={next}
            onChange={setNext}
            candidates={candidatesFor(next)}
            stepById={stepById}
            labelPlaceholder={() => (stepType === 'Decision' ? 'Approved' : 'Label')}
            prompt="Which step comes after?"
            emptyText="Nothing comes after this step — it ends the process."
          />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Checklist</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() =>
                  setChecklist([
                    ...checklist,
                    { id: `c${Date.now()}${checklist.length}`, text: '' },
                  ])
                }
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            <DndContext
              sensors={checklistSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleChecklistDragEnd}
            >
              <SortableContext
                items={checklist.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1.5">
                  {checklist.map((item, idx) => (
                    <ChecklistRow
                      key={item.id}
                      item={item}
                      index={idx}
                      onChange={(text) =>
                        setChecklist((prev) =>
                          prev.map((c) => (c.id === item.id ? { ...c, text } : c)),
                        )
                      }
                      onRemove={() =>
                        setChecklist((prev) => prev.filter((c) => c.id !== item.id))
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
        {step ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={saving}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </aside>
  );
}
