import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getProcessGraph,
  getProcesses,
  getTaxonomy,
  saveElement,
  createVersion,
  moveStep,
  saveLaneOrder,
  GetProcessGraphOutputType,
  GetProcessesOutputType,
} from 'zitejs/api';
import { ArrowLeft, Plus, Copy, FilePlus, MoreHorizontal, Layers, Trash2, Settings } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@project/components/ui/dropdown-menu';
import { Button } from '@project/components/ui/button';
import { Skeleton } from '@project/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@project/components/ui/select';
import { toast } from 'sonner';
import type { ElementRef, ElementSummary, ElementType, Phase, ProcessStep } from '@/types';
import PhasesDialog from './PhasesDialog';

const NO_LANE_ORDER = { people: [] as string[], app: [] as string[] };
import SwimlaneDiagram, { type LaneGrouping, type StepMove } from './SwimlaneDiagram';
import StepDialog from './StepDialog';
import VersionsDialog from './VersionsDialog';
import DeleteProcessDialog from './DeleteProcessDialog';
import EditProcessDialog from './EditProcessDialog';

type Graph = GetProcessGraphOutputType;
type ProcessRow = GetProcessesOutputType['processes'][number];

export default function ProcessCanvas() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const versionParam = searchParams.get('version');

  const [graph, setGraph] = useState<Graph | null>(null);
  const [process, setProcess] = useState<ProcessRow | null>(null);
  const [elements, setElements] = useState<ElementSummary[]>([]);
  const [types, setTypes] = useState<ElementType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editStep, setEditStep] = useState<ProcessStep | null>(null);
  const [addingStep, setAddingStep] = useState(false);
  const [laneGrouping, setLaneGrouping] = useState<LaneGrouping>('people');
  const [managingVersions, setManagingVersions] = useState(false);
  const [deletingProcess, setDeletingProcess] = useState(false);
  const [editingProcess, setEditingProcess] = useState(false);
  const [editingPhases, setEditingPhases] = useState(false);

  // The panel shows one thing at a time, so opening either view closes the
  // other — otherwise "Add Step" while a step is open changes nothing.
  const openNewStep = useCallback(() => {
    setEditStep(null);
    setAddingStep(true);
  }, []);

  const openStep = useCallback((s: ProcessStep) => {
    setAddingStep(false);
    setEditStep(s);
  }, []);

  const closeEditor = useCallback(() => {
    setEditStep(null);
    setAddingStep(false);
  }, []);

  /**
   * Drop a deleted step from the canvas straight away rather than waiting on a
   * refetch. The server removes the edges touching it too, so mirror that.
   */
  const removeStepLocally = useCallback((stepId: string) => {
    setGraph((g) => {
      // The empty graph is a separate shape in the union, and has nothing to
      // remove anyway.
      if (!g || !g.version) return g;
      return {
        ...g,
        steps: g.steps.filter((s) => s.id !== stepId),
        connections: g.connections.filter(
          (c) => c.fromStepId !== stepId && c.toStepId !== stepId,
        ),
      };
    });
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [processRes, taxonomy, graphRes] = await Promise.all([
        getProcesses({}),
        getTaxonomy({}),
        getProcessGraph(
          versionParam ? { versionId: versionParam } : { processId: id },
        ),
      ]);
      const p = processRes.processes.find((row) => row.id === id);
      if (!p) {
        navigate('/');
        return;
      }
      setProcess(p);
      setElements(taxonomy.elements);
      setTypes(taxonomy.types);
      setGraph(graphRes);
    } catch (err) {
      // Without this a failed refetch left the old diagram on screen looking
      // current, with nothing to say it was stale.
      toast.error(
        err instanceof Error ? err.message : 'Could not load the latest version.',
      );
    } finally {
      setLoading(false);
    }
  }, [id, versionParam, navigate]);

  // Drilling into a sub-process keeps this component mounted, so without this
  // the previous process's diagram sits there looking current until the new
  // one arrives.
  useEffect(() => {
    setLoading(true);
    closeEditor();
  }, [id, closeEditor]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateElement = useCallback(
    async (name: string, typeId: string) => {
      try {
        const { id: newId } = await saveElement({ name, typeId });

        // Everything a fresh element looks like is already known here, so add
        // it to the list rather than refetching the whole taxonomy to learn it.
        const type = types.find((t) => t.id === typeId);
        const created: ElementSummary = {
          id: newId,
          name,
          description: '',
          icon: '',
          image: '',
          typeId,
          typeName: type?.name ?? '',
          typeKey: type?.key ?? '',
          typeHumanKind: type?.humanKind ?? '',
          typeIcon: type?.icon ?? '',
          typeColor: type?.color ?? '',
          categories: type?.categories ?? [],
          actorClass: type?.actorClass ?? 'Not an actor',
          party: '',
          status: 'Active',
          ownerId: null,
          ownerName: '',
          usageCount: 0,
          ownsCount: 0,
        };
        setElements((prev) =>
          [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
        );

        toast.success(`Created ${name}`);
        return newId;
      } catch {
        toast.error(`Could not create ${name}`);
        return null;
      }
    },
    [types],
  );

  const handleCreateVersion = useCallback(
    async (mode: 'duplicate' | 'blank') => {
      if (!id) return;
      const source = graph?.version;
      if (mode === 'duplicate' && !source) return;
      try {
        const res = await createVersion(
          mode === 'duplicate'
            ? {
                sourceVersionId: source!.id,
                name: `${source!.name} copy`,
                state: 'Future',
                notes: '',
              }
            : { processId: id, name: 'New version', state: 'Future', notes: '' },
        );
        toast.success(
          mode === 'duplicate'
            ? `Copied ${res.stepsCopied} step${res.stepsCopied === 1 ? '' : 's'}`
            : 'Blank version created',
        );
        setSearchParams({ version: res.versionId });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not create a version.');
      }
    },
    [id, graph, setSearchParams],
  );

  const steps = useMemo(() => (graph?.steps ?? []) as ProcessStep[], [graph]);

  /**
   * A card dropped in another lane. The map moves it at once and the server
   * catches up; the refetch afterwards puts things right either way.
   */
  const versionId = graph?.version?.id;
  const handleMoveStep = useCallback(
    async (step: ProcessStep, move: StepMove) => {
      if (!versionId) return;
      const refOf = (elementId: string): ElementRef | null => {
        const e = elements.find((x) => x.id === elementId);
        return e
          ? {
              id: e.id,
              name: e.name,
              typeName: e.typeName,
              image: e.image,
              icon: e.icon,
              typeIcon: e.typeIcon,
              color: e.typeColor,
              actorClass: e.actorClass,
              party: e.party,
            }
          : null;
      };

      setGraph((g) => {
        if (!g || !g.version) return g;
        return {
          ...g,
          steps: g.steps.map((s) =>
            s.id !== step.id
              ? s
              : {
                  ...s,
                  performedBy: refOf(move.performedById) ?? s.performedBy,
                  phaseId: move.phaseId !== undefined ? move.phaseId : s.phaseId,
                  uses: move.useIds
                    .map((uid) => s.uses.find((u) => u.id === uid) ?? refOf(uid))
                    .filter((u): u is ElementRef => u !== null),
                },
          ),
        };
      });

      try {
        await moveStep({
          id: step.id,
          versionId,
          performedById: move.performedById,
          useIds: move.useIds,
          phaseId: move.phaseId,
        });
        toast.success(`Moved "${step.title}" to ${move.destination}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not move that step.');
      } finally {
        load();
      }
    },
    [versionId, elements, load],
  );
  const connections = useMemo(() => graph?.connections ?? [], [graph]);
  const phases = useMemo(() => (graph?.phases ?? []) as Phase[], [graph]);
  const laneOrder = graph?.laneOrder ?? NO_LANE_ORDER;

  // The new order shows at once; everyone else sees it on their next load.
  const handleReorderLanes = useCallback(
    async (order: string[]) => {
      if (!id) return;
      const grouping = laneGrouping;
      setGraph((g) => {
        if (!g || !g.version) return g;
        return { ...g, laneOrder: { ...g.laneOrder, [grouping]: order } };
      });
      try {
        await saveLaneOrder({ processId: id, grouping, order });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save the lane order.');
        load();
      }
    },
    [id, laneGrouping, load],
  );
  const phaseStepCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of steps) if (s.phaseId) m.set(s.phaseId, (m.get(s.phaseId) ?? 0) + 1);
    return m;
  }, [steps]);


  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Skeleton className="w-96 h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="border-b border-border px-6 py-3 flex items-center gap-3 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => navigate('/')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* Fixed width so the controls beside it don't move with the name. */}
        <h1 className="font-semibold text-sm truncate w-[220px] shrink-0">
          {graph?.version?.processName || process?.name || 'Untitled'}
        </h1>

        <span className="h-5 w-px bg-border shrink-0" aria-hidden="true" />

        <div className="flex border border-border rounded-md overflow-hidden text-xs shrink-0">
          {(['people', 'app'] as LaneGrouping[]).map((mode) => (
            <button
              key={mode}
              className={`px-3 py-1.5 font-medium transition-colors ${
                laneGrouping === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setLaneGrouping(mode)}
            >
              {mode === 'people' ? 'By person' : 'By app'}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* One version is the normal case, and a picker with one option is noise */}
          {process && process.versions.length > 1 && (
            <Select
              value={graph?.version?.id ?? ''}
              onValueChange={(v) => setSearchParams({ version: v })}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {process.versions.map((v) => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">
                    {v.name} · {v.state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditingProcess(true)}>
                <Settings className="h-4 w-4 mr-2" /> Process settings…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleCreateVersion('duplicate')}>
                <Copy className="h-4 w-4 mr-2" /> Duplicate version
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreateVersion('blank')}>
                <FilePlus className="h-4 w-4 mr-2" /> Create blank version
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setManagingVersions(true)}>
                <Layers className="h-4 w-4 mr-2" /> Manage versions…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeletingProcess(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete process…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" onClick={openNewStep}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add step
          </Button>
        </div>
      </header>

      {managingVersions && process && (
        <VersionsDialog
          versions={process.versions}
          currentVersionId={graph?.version?.id ?? null}
          onChanged={(nextVersionId) => {
            if (nextVersionId) setSearchParams({ version: nextVersionId });
            else load();
          }}
          onClose={() => setManagingVersions(false)}
        />
      )}

      {editingProcess && process && (
        <EditProcessDialog
          process={{ id: process.id, name: process.name, ownerId: process.ownerId }}
          elements={elements}
          types={types}
          onClose={() => setEditingProcess(false)}
          onSaved={() => {
            setEditingProcess(false);
            load();
          }}
        />
      )}

      {deletingProcess && process && (
        <DeleteProcessDialog
          process={process}
          onClose={() => setDeletingProcess(false)}
          onDeleted={() => {
            setDeletingProcess(false);
            // The process this view is about is gone, so there is nothing to
            // return to but the list.
            navigate('/');
          }}
        />
      )}

      {/* The editor docks beside the diagram, so the canvas stays in view. */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Depth comes from the gap between this and the white cards on it. */}
        <div className="flex-1 bg-muted overflow-hidden min-w-0">
          <SwimlaneDiagram
            steps={steps}
            connections={connections}
            grouping={laneGrouping}
            elements={elements}
            onClickStep={openStep}
            onOpenSubProcess={(processId) => navigate(`/process/${processId}`)}
            onMoveStep={handleMoveStep}
            phases={phases}
            onEditPhases={() => setEditingPhases(true)}
            laneOrder={laneOrder[laneGrouping]}
            onReorderLanes={handleReorderLanes}
            viewKey={graph?.version?.id ?? id}
          />
        </div>

        {editingPhases && id && (
          <PhasesDialog
            processId={id}
            phases={phases}
            stepCounts={phaseStepCounts}
            onClose={() => setEditingPhases(false)}
            onSaved={load}
          />
        )}

        {(addingStep || editStep) && graph?.version && (
          <StepDialog
            key={editStep?.id ?? 'new'}
            step={editStep}
            versionId={graph.version.id}
            processId={id ?? ''}
            elements={elements}
            types={types}
            allSteps={steps}
            connections={connections}
            onSaved={load}
            onDeleted={removeStepLocally}
            onClose={closeEditor}
            onCreateElement={handleCreateElement}
          />
        )}
      </div>
    </div>
  );
}
