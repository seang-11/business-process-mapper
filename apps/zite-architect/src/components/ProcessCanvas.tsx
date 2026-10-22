import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getProcessGraph,
  getProcesses,
  getTaxonomy,
  saveElement,
  createVersion,
  goLive,
  moveStep,
  saveLaneOrder,
  GetProcessGraphOutputType,
  GetProcessesOutputType,
} from 'zitejs/api';
import { ArrowLeft, Plus, Copy, FilePlus, MoreHorizontal, Layers, Trash2, Settings, Play, GraduationCap, Radio } from 'lucide-react';
import { Input } from '@project/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@project/components/ui/dialog';
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
import type { ElementRef, ElementSummary, ElementType, ProcessConnection, ProcessStep } from '@/types';

const NO_LANE_ORDER = { people: [] as string[], app: [] as string[] };

// Segmented switches: a soft track with a raised white pill on the active option.
const SEG_TRACK = 'flex shrink-0 rounded-lg bg-muted p-0.5 text-xs';
const segBtn = (active: boolean) =>
  `rounded-md px-3 py-1 font-medium transition-all ${
    active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
  }`;
import SwimlaneDiagram, { type LaneGrouping, type StepMove } from './SwimlaneDiagram';
import LaneDialog from './LaneDialog';
import ProcessTimeline from './ProcessTimeline';
import CompareVersions from './CompareVersions';
import Walkthrough from './Walkthrough';
import Train from './Train';
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
  /** The whole process as one scrolling timeline instead of the map. */
  const [showOverview, setShowOverview] = useState(false);
  /** Inside the Overview: one version, or Current and Future side by side. */
  const [overviewMode, setOverviewMode] = useState<'single' | 'side'>('side');
  const [managingVersions, setManagingVersions] = useState(false);
  const [deletingProcess, setDeletingProcess] = useState(false);
  const [editingProcess, setEditingProcess] = useState(false);
  /** The lane whose panel is open, in the current view. */
  const [openLane, setOpenLane] = useState<string | null>(null);
  // The walkthrough plays the version open on the map. A step edited from it
  // opens in an editor docked inside the walkthrough, keyed by id so it picks
  // up the saved version after each reload.
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  /** Role training for the version on screen. */
  const [trainOpen, setTrainOpen] = useState(false);
  /** The "make this version live" confirmation, and the day it goes live. */
  const [makeLiveOpen, setMakeLiveOpen] = useState(false);
  const [liveDay, setLiveDay] = useState('');
  const [goingLive, setGoingLive] = useState(false);
  const [walkthroughEditId, setWalkthroughEditId] = useState<string | null>(null);

  // The panel shows one thing at a time, so opening either view closes the
  // other — otherwise "Add Step" while a step is open changes nothing.
  const openNewStep = useCallback(() => {
    setEditStep(null);
    setOpenLane(null);
    setAddingStep(true);
  }, []);

  const openStep = useCallback((s: ProcessStep) => {
    setAddingStep(false);
    setOpenLane(null);
    setEditStep(s);
  }, []);

  const closeEditor = useCallback(() => {
    setEditStep(null);
    setAddingStep(false);
    setOpenLane(null);
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

  // A shared link can open the process straight to one person's view.
  const laneParam = searchParams.get('lane');
  const byParam = searchParams.get('by');
  useEffect(() => {
    if (!laneParam) return;
    setShowOverview(false);
    setLaneGrouping(byParam === 'app' ? 'app' : 'people');
    setOpenLane(laneParam);
  }, [laneParam, byParam]);

  // A shared link can open training straight to one role, or its handover brief.
  const trainParam = searchParams.get('train');
  const trainView = searchParams.get('view') === 'brief' ? 'brief' : 'lesson';
  useEffect(() => {
    if (trainParam) setTrainOpen(true);
  }, [trainParam]);

  const closeTrain = useCallback(() => {
    setTrainOpen(false);
    // Drop the link's role so a reload doesn't reopen it.
    if (searchParams.has('train') || searchParams.has('view')) {
      const next = new URLSearchParams(searchParams);
      next.delete('train');
      next.delete('view');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const closeLane = useCallback(() => {
    setOpenLane(null);
    // Drop the link's lane so a reload doesn't reopen it.
    if (searchParams.has('lane')) {
      const next = new URLSearchParams(searchParams);
      next.delete('lane');
      next.delete('by');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const copyLaneLink = useCallback(() => {
    if (!openLane) return;
    const params = new URLSearchParams(searchParams);
    params.set('lane', openLane);
    params.set('by', laneGrouping);
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success('Link copied'),
      () => toast.error('Could not copy the link'),
    );
  }, [openLane, laneGrouping, searchParams]);

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


  const openMakeLive = () => {
    setLiveDay(new Date().toLocaleDateString('en-CA'));
    setMakeLiveOpen(true);
  };

  // The version that is live today, which this one would replace.
  const replacedVersion =
    process?.versions.find((v) => v.state === 'Current' && v.id !== graph?.version?.id) ?? null;

  const confirmMakeLive = async () => {
    const v = graph?.version;
    if (!v || !liveDay) return;
    setGoingLive(true);
    try {
      const res = await goLive({ versionId: v.id, date: liveDay });
      toast.success(
        res.retired ? `${v.name} is live. The old version is retired.` : `${v.name} is live`,
      );
      setMakeLiveOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not make that version live.');
    } finally {
      setGoingLive(false);
    }
  };

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

        <div className={SEG_TRACK}>
          {(['people', 'app'] as LaneGrouping[]).map((mode) => (
            <button
              key={mode}
              className={segBtn(!showOverview && laneGrouping === mode)}
              onClick={() => {
                setShowOverview(false);
                setLaneGrouping(mode);
                // Lanes mean something else in the other view.
                setOpenLane(null);
              }}
            >
              {mode === 'people' ? 'By person' : 'By app'}
            </button>
          ))}
          <button
            className={segBtn(showOverview)}
            onClick={() => {
              setShowOverview(true);
              setOpenLane(null);
            }}
          >
            Overview
          </button>
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
                    {v.name} · {v.state === 'Current' ? 'Live' : v.state === 'Future' ? 'Not live yet' : 'Retired'}
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

          {steps.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setTrainOpen(true)}>
              <GraduationCap className="h-3.5 w-3.5 mr-1.5" /> Train
            </Button>
          )}

          {steps.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setWalkthroughOpen(true)}>
              <Play className="h-3.5 w-3.5 mr-1.5" /> Play walkthrough
            </Button>
          )}

          <Button size="sm" onClick={openNewStep}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add step
          </Button>
        </div>
      </header>

      {/* A version that isn't live yet says so, wherever you are, with the way to change that. */}
      {graph?.version?.state === 'Future' && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="font-semibold">{graph.version.name} isn't live yet.</span>
          <span className="text-xs opacity-90">
            {replacedVersion
              ? `${replacedVersion.name} is still how the work is done today.`
              : 'No version is live yet.'}
          </span>
          <Button size="sm" className="ml-auto h-7 text-xs" onClick={openMakeLive}>
            <Radio className="mr-1.5 h-3 w-3" /> Make live
          </Button>
        </div>
      )}

      {makeLiveOpen && graph?.version && (
        <Dialog open onOpenChange={(o) => !o && !goingLive && setMakeLiveOpen(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Make {graph.version.name} live?</DialogTitle>
              <DialogDescription>
                {replacedVersion
                  ? `${replacedVersion.name} is retired on the day you pick, and kept with the dates it ran. `
                  : ''}
                From then on, new people are trained on {graph.version.name}.
              </DialogDescription>
            </DialogHeader>
            <label className="flex items-center gap-3 text-sm">
              Goes live on
              <Input
                type="date"
                value={liveDay}
                onChange={(e) => setLiveDay(e.target.value)}
                className="h-9 w-[11rem]"
              />
            </label>
            <DialogFooter>
              <Button variant="ghost" size="sm" disabled={goingLive} onClick={() => setMakeLiveOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!liveDay || goingLive} onClick={confirmMakeLive}>
                <Radio className="mr-1.5 h-3.5 w-3.5" /> Make it live
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

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
          {showOverview ? (
            <div className="flex h-full flex-col">
              {/* Only worth showing once there is a second version to put beside the first. */}
              {process && process.versions.length > 1 && (
                <div className="flex shrink-0 justify-center border-b border-border bg-background px-6 py-2.5">
                  <div className={SEG_TRACK}>
                    <button
                      className={segBtn(overviewMode === 'side')}
                      onClick={() => setOverviewMode('side')}
                    >
                      Side by side
                    </button>
                    {/* Each version is its own tab, so the one on screen is always named. */}
                    {process.versions.map((v) => {
                      const active = overviewMode === 'single' && graph?.version?.id === v.id;
                      return (
                        <button
                          key={v.id}
                          className={segBtn(active)}
                          onClick={() => {
                            setOverviewMode('single');
                            if (graph?.version?.id !== v.id) setSearchParams({ version: v.id });
                          }}
                        >
                          {v.state === 'Current' && (
                            <span
                              className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle"
                              title="Live: how the work is done today"
                            />
                          )}
                          {v.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="min-h-0 flex-1">
                {overviewMode === 'side' && process && process.versions.length > 1 ? (
                  <CompareVersions embedded processName={process.name} versions={process.versions} />
                ) : (
                  <ProcessTimeline steps={steps} connections={connections} onOpenStep={openStep} />
                )}
              </div>
            </div>
          ) : (
          <SwimlaneDiagram
            steps={steps}
            connections={connections}
            grouping={laneGrouping}
            elements={elements}
            onClickStep={openStep}
            onOpenSubProcess={(processId) => navigate(`/process/${processId}`)}
            onMoveStep={handleMoveStep}
            laneOrder={laneOrder[laneGrouping]}
            onReorderLanes={handleReorderLanes}
            viewKey={graph?.version?.id ?? id}
            onOpenLane={(lane) => {
              setEditStep(null);
              setAddingStep(false);
              setOpenLane((current) => (current === lane ? null : lane));
            }}
          />
          )}
        </div>

        {trainOpen && process && graph?.version && (
          <Train
            processName={process.name}
            versions={process.versions}
            // Training teaches the live version unless a shared link names another.
            initialVersionId={
              trainParam
                ? graph.version.id
                : process.versions.find((v) => v.state === 'Current')?.id ?? graph.version.id
            }
            initialRole={trainParam}
            initialView={trainView}
            onClose={closeTrain}
            onOpenStep={(s, versionOfStep) => {
              if (versionOfStep === graph.version.id) {
                closeTrain();
                openStep(s);
              } else {
                // The step lives in another version: show that version on the map.
                setTrainOpen(false);
                setSearchParams({ version: versionOfStep });
              }
            }}
          />
        )}

        {walkthroughOpen && graph?.version && (
          <Walkthrough
            processName={process?.name ?? 'This process'}
            processDescription={process?.description ?? ''}
            versionName={graph.version.name}
            steps={steps}
            connections={connections}
            onClose={() => {
              setWalkthroughOpen(false);
              setWalkthroughEditId(null);
            }}
            onEditStep={(s) => setWalkthroughEditId(s.id)}
            editor={
              walkthroughEditId && steps.some((s) => s.id === walkthroughEditId) ? (
                <StepDialog
                  key={walkthroughEditId}
                  step={steps.find((s) => s.id === walkthroughEditId)!}
                  versionId={graph.version.id}
                  processId={id ?? ''}
                  elements={elements}
                  types={types}
                  allSteps={steps}
                  connections={connections}
                  onSaved={load}
                  onDeleted={(stepId) => {
                    removeStepLocally(stepId);
                    setWalkthroughEditId(null);
                  }}
                  onClose={() => setWalkthroughEditId(null)}
                  onCreateElement={handleCreateElement}
                />
              ) : null
            }
          />
        )}

        {openLane && !addingStep && !editStep && (
          <LaneDialog
            lane={openLane}
            grouping={laneGrouping}
            steps={steps}
            connections={connections}
            onClose={closeLane}
            onOpenStep={openStep}
            onCopyLink={copyLaneLink}
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
