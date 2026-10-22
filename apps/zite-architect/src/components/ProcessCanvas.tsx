import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getProcessGraph,
  getProcesses,
  getTaxonomy,
  saveElement,
  createVersion,
  goLive,
  saveLaneOrder,
  GetProcessGraphOutputType,
  GetProcessesOutputType,
} from 'zitejs/api';
import { ArrowLeft, Share2, Plus, Copy, FilePlus, Layers, Trash2, Settings, Play, GraduationCap, Radio, ChevronDown, ChevronRight, HelpCircle, Check, Columns2, Eye } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
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

// A process opens on the view you used last, so you aren't sent back to By person every time.
const VIEW_KEY = 'bpm_last_process_view';
const storedView = (): 'people' | 'app' | 'overview' | null => {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'people' || v === 'app' || v === 'overview' ? v : null;
  } catch {
    return null;
  }
};
const rememberView = (v: 'people' | 'app' | 'overview') => {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* it just opens on By person next time */
  }
};

// Segmented switches: a soft track with a raised white pill on the active option.
const SEG_TRACK = 'flex shrink-0 rounded-lg bg-muted p-0.5 text-xs';
const segBtn = (active: boolean) =>
  `rounded-md px-3 py-1 font-medium transition-all ${
    active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
  }`;
import SwimlaneDiagram, { type LaneGrouping } from './SwimlaneDiagram';
import LaneDialog from './LaneDialog';
import ProcessTimeline from './ProcessTimeline';
import CompareVersions from './CompareVersions';
import Walkthrough from './Walkthrough';
import Train from './Train';
import PreviewSwitcher from './PreviewSwitcher';
import ShareDialog from './ShareDialog';
import { useMe } from '@/lib/me';
import StepDialog from './StepDialog';
import VersionsDialog from './VersionsDialog';
import DeleteProcessDialog from './DeleteProcessDialog';
import EditProcessDialog from './EditProcessDialog';

type Graph = GetProcessGraphOutputType;
type ProcessRow = GetProcessesOutputType['processes'][number];

export default function ProcessCanvas() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // Viewers can look at everything, but nothing in here changes the process for them.
  const { canEdit, isRealAdmin, viewAs, setViewAs } = useMe();
  const [searchParams, setSearchParams] = useSearchParams();
  const versionParam = searchParams.get('version');

  const [graph, setGraph] = useState<Graph | null>(null);
  const [process, setProcess] = useState<ProcessRow | null>(null);
  const [elements, setElements] = useState<ElementSummary[]>([]);
  const [types, setTypes] = useState<ElementType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editStep, setEditStep] = useState<ProcessStep | null>(null);
  const [addingStep, setAddingStep] = useState(false);
  const [laneGrouping, setLaneGrouping] = useState<LaneGrouping>(() => (storedView() === 'app' ? 'app' : 'people'));
  /** The whole process as one scrolling timeline instead of the map. */
  const [showOverview, setShowOverview] = useState(() => storedView() === 'overview');
  const [allProcesses, setAllProcesses] = useState<ProcessRow[]>([]);
  /** Inside the Overview: one version, or Current and Future side by side. */
  const [overviewMode, setOverviewMode] = useState<'single' | 'side'>('side');
  const [managingVersions, setManagingVersions] = useState(false);
  const [sharing, setSharing] = useState(false);
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
    if (!canEdit) return;
    setEditStep(null);
    setOpenLane(null);
    setAddingStep(true);
  }, [canEdit]);

  const openStep = useCallback((s: ProcessStep) => {
    if (!canEdit) return;
    setAddingStep(false);
    setOpenLane(null);
    setEditStep(s);
  }, [canEdit]);

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
      setAllProcesses(processRes.processes);
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
  const trainViewParam = searchParams.get('view');
  const trainView: 'process' | 'lesson' | 'brief' =
    trainViewParam === 'brief' ? 'brief' : trainViewParam === 'lesson' ? 'lesson' : 'process';
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
          category: '',
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

  const versionId = graph?.version?.id;

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
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-6 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => navigate('/')}
          aria-label="Back to home"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* The name doubles as a switcher, so you can hop to another process without going home. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 max-w-[260px] items-center gap-1 rounded-md px-1.5 py-1 text-[15px] font-semibold transition-colors hover:bg-muted"
              aria-label="Switch process"
            >
              <span className="truncate">{graph?.version?.processName || process?.name || 'Untitled'}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
            {allProcesses.map((p) => (
              <DropdownMenuItem key={p.id} onClick={() => p.id !== id && navigate(`/process/${p.id}`)} className="gap-2">
                <Check className={`h-4 w-4 ${p.id === id ? '' : 'opacity-0'}`} />
                <span className="truncate">{p.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className={SEG_TRACK}>
          {(['people', 'app'] as LaneGrouping[]).map((mode) => (
            <button
              key={mode}
              className={segBtn(!showOverview && laneGrouping === mode)}
              onClick={() => {
                setShowOverview(false);
                setLaneGrouping(mode);
                rememberView(mode);
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
              rememberView('overview');
              setOpenLane(null);
            }}
          >
            Overview
          </button>
        </div>


        {/* Which version you are looking at, right beside how you are looking at it. */}
        {graph?.version && (
          <VersionPill
            state={graph.version.state}
            name={graph.version.name}
            versions={process?.versions ?? []}
            currentId={graph.version.id}
            onPick={(versionId) => setSearchParams({ version: versionId })}
          />
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {viewAs && <PreviewSwitcher />}

          {canEdit && graph?.version?.state === 'Future' && (
            <Button size="sm" variant="outline" className="h-8" onClick={openMakeLive}>
              <Radio className="mr-1.5 h-3.5 w-3.5" /> Make live
            </Button>
          )}

          {canEdit && (
            <Button size="sm" variant="outline" className="h-8" onClick={() => setSharing(true)}>
              <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share
            </Button>
          )}

          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8">
                  Manage <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
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
                {isRealAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setViewAs({ access: 'viewer', label: 'Viewer' })}>
                      <Eye className="h-4 w-4 mr-2" /> Preview as viewer
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeletingProcess(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Delete process…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {canEdit && (
            <Button size="sm" className="h-8" onClick={openNewStep}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add step
            </Button>
          )}

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="How this works"
              >
                <HelpCircle className="h-5 w-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 text-sm leading-relaxed">
              <p className="mb-1.5 font-semibold">How this works</p>
              <p>
                <b className="font-semibold">By person</b> shows who does each step. <b className="font-semibold">By app</b>{' '}
                shows which tool. <b className="font-semibold">Overview</b> is the whole process as a simple list.
              </p>
              <p className="mt-2 text-muted-foreground">
                Switch to another process with the name at the top left. Start training teaches the whole process, then
                your part.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      {/* The things most people come here to do, in one quiet row. */}
      {steps.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-6 py-2.5">
          <Button size="sm" className="h-8 rounded-full px-4" onClick={() => setTrainOpen(true)}>
            <GraduationCap className="mr-1.5 h-4 w-4" /> Start training
          </Button>
          <Button size="sm" variant="outline" className="h-8 rounded-full px-4" onClick={() => setWalkthroughOpen(true)}>
            <Play className="mr-1.5 h-3.5 w-3.5" /> Walkthrough
          </Button>
          {process && process.versions.length > 1 && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-full px-4"
              onClick={() => {
                setShowOverview(true);
                rememberView('overview');
                setOverviewMode('side');
              }}
            >
              <Columns2 className="mr-1.5 h-3.5 w-3.5" /> Compare versions
            </Button>
          )}
        </div>
      )}

      {sharing && process && (
        <ShareDialog
          processId={process.id}
          processName={process.name}
          hasLive={process.versions.some((v) => v.state === 'Current')}
          onClose={() => setSharing(false)}
        />
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
          process={{ id: process.id, name: process.name, ownerId: process.ownerId, backupOwnerId: process.backupOwnerId }}
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
                  <CompareVersions embedded readOnly={!canEdit} processName={process.name} versions={process.versions} />
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
            laneOrder={laneOrder[laneGrouping]}
            onReorderLanes={canEdit ? handleReorderLanes : undefined}
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
            processDescription={process.description}
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
            onEditStep={canEdit ? (s) => setWalkthroughEditId(s.id) : undefined}
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

/**
 * Which version is on screen: green when it's live, amber when it isn't yet.
 * With more than one version it opens a list to switch between them.
 */
function VersionPill({ state, name, versions, currentId, onPick }: {
  state: string;
  name: string;
  versions: { id: string; name: string; state: string }[];
  currentId: string;
  onPick: (versionId: string) => void;
}) {
  const tone =
    state === 'Current'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
      : state === 'Future'
      ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
      : 'bg-muted text-muted-foreground';
  const label = state === 'Current' ? 'Live' : state === 'Future' ? `${name}: not live` : `${name}: retired`;
  const pill = (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
      {versions.length > 1 && <ChevronDown className="h-3.5 w-3.5 opacity-70" />}
    </span>
  );
  if (versions.length <= 1) return pill;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-full" aria-label="Switch version">
          {pill}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {versions.map((v) => (
          <DropdownMenuItem key={v.id} onClick={() => v.id !== currentId && onPick(v.id)} className="gap-2">
            <Check className={`h-4 w-4 ${v.id === currentId ? '' : 'opacity-0'}`} />
            <span className="min-w-0 flex-1 truncate">{v.name}</span>
            <span className="text-[11px] text-muted-foreground">
              {v.state === 'Current' ? 'Live' : v.state === 'Future' ? 'Not live yet' : 'Retired'}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
