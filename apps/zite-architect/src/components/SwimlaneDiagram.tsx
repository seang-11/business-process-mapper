import { useMemo, useState, useRef, useEffect, useLayoutEffect, useCallback, forwardRef } from 'react';
import {
  Play, Flag, ListChecks, CornerDownRight, ArrowRight, Workflow, Zap, Minus, Plus, Maximize2,
} from 'lucide-react';
import type {
  ElementSummary,
  ProcessStep,
  ProcessConnection,
  ProcessLoop,
} from '@/types';
import { HUMAN_KIND } from '@/lib/typeKeys';
import {
  placeEdgeLabels,
  labelGutterWidth,
  LABEL_FONT_SIZE,
  LABEL_FONT_WEIGHT,
  LABEL_LINE_H,
  LABEL_PAD_Y,
  type EdgeGeometry,
} from '@/lib/labelPlacement';
import ElementIcon from './ElementIcon';

/**
 * Two ways to read a process: who does the work, or what runs it.
 *
 * 'people' lanes by the performer itself, whether that is a person, a role or
 * a team, so one view answers who does what — the lane header names the person
 * behind a role where there is one. 'app' lanes by the system involved.
 *
 * Neither names a type: 'people' follows actorClass Human, 'app' follows
 * actorClass System, so a custom type slots in by declaring its capability.
 */
export type LaneGrouping = 'people' | 'app';

interface Props {
  steps: ProcessStep[];
  connections: ProcessConnection[];
  grouping: LaneGrouping;
  /** The taxonomy, for resolving a performer up its owner chain. */
  elements: ElementSummary[];
  onClickStep: (step: ProcessStep) => void;
  /** Drill into the process a sub-process step expands into. */
  onOpenSubProcess: (processId: string) => void;
}

/** Longest owner chain worth following before calling it a cycle. */
const MAX_OWNER_HOPS = 6;

/**
 * The performer of a step may not be the kind we're grouping by — a step done
 * by a Role still belongs in its person's lane. Walk the owner links up until
 * a match turns up.
 */
function resolveByKind(
  performerId: string,
  kind: string,
  byId: Map<string, ElementSummary>,
): ElementSummary | null {
  let current = byId.get(performerId);
  for (let hop = 0; current && hop < MAX_OWNER_HOPS; hop += 1) {
    if (current.typeHumanKind === kind) return current;
    current = current.ownerId ? byId.get(current.ownerId) : undefined;
  }
  return null;
}

// Build set of backward-path connections implied by loops (last step → reentry)
function getLoopBackwardPairs(loops: ProcessLoop[]): Set<string> {
  const set = new Set<string>();
  for (const loop of loops) {
    if (loop.stepIds.length < 2) continue;
    const lastStepId = loop.stepIds[loop.stepIds.length - 1];
    set.add(`${lastStepId}->${loop.reentryStepId}`);
  }
  return set;
}

// Detect back-edges in a directed graph via DFS so cycles are broken
// even when no explicit loops array is provided.
function detectBackEdges(
  stepIds: Set<string>,
  adj: Map<string, string[]>
): Set<string> {
  const backEdges = new Set<string>();
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const id of stepIds) color.set(id, WHITE);

  const dfs = (u: string) => {
    color.set(u, GRAY);
    for (const v of adj.get(u) || []) {
      if (color.get(v) === GRAY) {
        // v is an ancestor of u — this is a back-edge
        backEdges.add(`${u}->${v}`);
      } else if (color.get(v) === WHITE) {
        dfs(v);
      }
    }
    color.set(u, BLACK);
  };

  for (const id of stepIds) {
    if (color.get(id) === WHITE) dfs(id);
  }
  return backEdges;
}

// Loops used to be authored by hand. Now every back-edge in the graph implies one:
// its members are the steps that sit on a path from the re-entry point back to the
// step that closes the cycle.
function deriveLoops(steps: ProcessStep[], connections: ProcessConnection[]): ProcessLoop[] {
  const stepIds = new Set(steps.map(s => s.id));
  const adj = new Map<string, string[]>();
  const rev = new Map<string, string[]>();
  for (const s of steps) { adj.set(s.id, []); rev.set(s.id, []); }
  for (const c of connections) {
    if (!stepIds.has(c.fromStepId) || !stepIds.has(c.toStepId)) continue;
    adj.get(c.fromStepId)!.push(c.toStepId);
    rev.get(c.toStepId)!.push(c.fromStepId);
  }

  const backEdges = detectBackEdges(stepIds, adj);
  const titleById = new Map(steps.map(s => [s.id, s.title]));
  const orderById = new Map(steps.map((s, i) => [s.id, i]));

  const walk = (start: string, edges: Map<string, string[]>, skip: string): Set<string> => {
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length) {
      const node = queue.shift()!;
      for (const next of edges.get(node) || []) {
        const forward = edges === adj ? `${node}->${next}` : `${next}->${node}`;
        if (forward === skip) continue;
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return seen;
  };

  const loops: ProcessLoop[] = [];
  for (const edge of backEdges) {
    const [closing, reentry] = edge.split('->');
    if (!closing || !reentry) continue;
    // A step belongs to the loop when it is reachable from the re-entry point
    // AND can still reach the step that closes the cycle.
    const forward = walk(reentry, adj, edge);
    const backward = walk(closing, rev, edge);
    const members = [...stepIds].filter(id => forward.has(id) && backward.has(id));
    if (members.length < 2) continue;
    members.sort((a, b) => (orderById.get(a) ?? 0) - (orderById.get(b) ?? 0));
    loops.push({
      id: edge,
      name: `Loops back to ${titleById.get(reentry) ?? 'earlier step'}`,
      stepIds: members,
      reentryStepId: reentry,
    });
  }
  return loops;
}

// Topological sort — longest-path BFS assigns each step to a column.
// Connections that are backward paths of loops OR back-edges in cycles
// are excluded so the layout always proceeds left-to-right.
function assignColumns(steps: ProcessStep[], connections: ProcessConnection[], loops: ProcessLoop[] = []): Map<string, number> {
  const backwardPairs = getLoopBackwardPairs(loops);
  const stepIds = new Set(steps.map(s => s.id));

  // First pass: build raw adjacency (minus explicit loop-backwards) to detect cycles
  const rawAdj = new Map<string, string[]>();
  for (const s of steps) rawAdj.set(s.id, []);
  for (const c of connections) {
    if (!stepIds.has(c.fromStepId) || !stepIds.has(c.toStepId)) continue;
    if (backwardPairs.has(`${c.fromStepId}->${c.toStepId}`)) continue;
    rawAdj.get(c.fromStepId)!.push(c.toStepId);
  }
  const cycleBackEdges = detectBackEdges(stepIds, rawAdj);

  // Second pass: build clean in/out edges excluding both loop-backwards and cycle back-edges
  const inEdges = new Map<string, string[]>();
  const outEdges = new Map<string, string[]>();
  for (const s of steps) {
    inEdges.set(s.id, []);
    outEdges.set(s.id, []);
  }
  for (const c of connections) {
    if (!stepIds.has(c.fromStepId) || !stepIds.has(c.toStepId)) continue;
    const key = `${c.fromStepId}->${c.toStepId}`;
    if (backwardPairs.has(key) || cycleBackEdges.has(key)) continue;
    outEdges.get(c.fromStepId)!.push(c.toStepId);
    inEdges.get(c.toStepId)!.push(c.fromStepId);
  }

  const col = new Map<string, number>();
  const visited = new Set<string>();
  const queue: string[] = [];

  for (const s of steps) {
    if (inEdges.get(s.id)!.length === 0) {
      queue.push(s.id);
      col.set(s.id, 0);
    }
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const myCol = col.get(id) ?? 0;
    for (const next of outEdges.get(id) || []) {
      const existing = col.get(next) ?? 0;
      col.set(next, Math.max(existing, myCol + 1));
      queue.push(next);
    }
  }

  for (const s of steps) {
    if (!col.has(s.id)) col.set(s.id, 0);
  }

  // Second pass: push non-loop exit paths to the right of loop boxes
  if (loops.length > 0) {
    const loopMemberIds = new Set<string>();
    for (const loop of loops) {
      for (const sid of loop.stepIds) {
        loopMemberIds.add(sid);
      }
    }

    let maxLoopColumn = -1;
    for (const sid of loopMemberIds) {
      const c = col.get(sid) ?? 0;
      if (c > maxLoopColumn) maxLoopColumn = c;
    }

    if (maxLoopColumn >= 0) {
      const minExitColumn = maxLoopColumn + 1;

      const needsPush = new Set<string>();
      for (const c of connections) {
        if (backwardPairs.has(`${c.fromStepId}->${c.toStepId}`)) continue;
        if (loopMemberIds.has(c.fromStepId) && !loopMemberIds.has(c.toStepId)) {
          needsPush.add(c.toStepId);
        }
      }

      const pushDownstream = (startId: string) => {
        const toPush = [startId];
        const pushed = new Set<string>();

        while (toPush.length > 0) {
          const id = toPush.shift()!;
          if (pushed.has(id)) continue;
          pushed.add(id);

          if (needsPush.has(id)) {
            const currentCol = col.get(id) ?? 0;
            col.set(id, Math.max(currentCol, minExitColumn));
          }

          const myCol = col.get(id) ?? 0;
          for (const next of outEdges.get(id) || []) {
            if (!loopMemberIds.has(next)) {
              const nextCol = col.get(next) ?? 0;
              if (nextCol <= myCol) {
                col.set(next, myCol + 1);
              }
              toPush.push(next);
            }
          }
        }
      };

      for (const id of needsPush) {
        pushDownstream(id);
      }
    }
  }

  return col;
}

/**
 * The people view only has lanes for people. A step an app runs on its own
 * (Zapier creating a record, Stripe clearing a payment) shares one lane, so
 * the view still answers "who does what" without apps posing as teammates.
 */
const AUTOMATED_LANE = 'Automated';

function getLaneKey(step: ProcessStep, grouping: LaneGrouping): string {
  if (grouping === 'people') {
    if (step.performedBy?.actorClass === 'System') return AUTOMATED_LANE;
    return step.performedBy?.name || 'Unassigned';
  }

  // The app view: a step run by a system belongs to it, otherwise the first
  // system it uses. A step can touch several apps but a lane holds one, so the
  // primary one wins.
  if (step.performedBy?.actorClass === 'System') return step.performedBy.name;
  const app = step.uses.find((u) => u.actorClass === 'System');
  return app ? app.name : 'No app';
}

// Layout constants
const LANE_LABEL_W = 176;
const CARD_W = 208;
const COL_GAP = 16;
const PAD_X = 24;

// Minimum drag distance (px) before it counts as a pan (suppresses click)
const DRAG_THRESHOLD = 5;

// Arrows stay neutral at rest so the cards carry the colour; the accent is
// saved for the paths of whatever the reader is hovering. Dashes are kept for
// loop-backs only, so a dashed line always means "this goes back a step".
const EDGE_COLOR = 'hsl(var(--muted-foreground) / 0.45)';
const EDGE_COLOR_HI = 'hsl(var(--primary))';
/** Softest bend a cross-lane edge is allowed, in px of control-point reach. */
const EDGE_MIN_BEND = 48;
/** Flowing dots: px per second, clamped so nothing crawls or races. */
const EDGE_DOT_SPEED = 70;
const EDGE_DOT_MIN_S = 1.8;
const EDGE_DOT_MAX_S = 6;
/** Past this length an edge gets a second dot so it never looks empty. */
const EDGE_SECOND_DOT_PX = 220;

// Zoom. Each button press is one step; Cmd/Ctrl + scroll (and trackpad pinch,
// which browsers report the same way) zooms smoothly around the cursor.
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;
const ZOOM_STEP = 1.2;
/** Scroll-wheel sensitivity, and a cap so one mouse notch isn't a leap. */
const ZOOM_WHEEL_RATE = 0.01;
const ZOOM_WHEEL_MAX_DELTA = 30;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

const ZOOM_BTN =
  'h-7 w-7 inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent';

/** Follows the OS "reduce motion" setting, live. */
function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduce, setReduce] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduce;
}

export default function SwimlaneDiagram({
  steps,
  connections,
  grouping,
  elements,
  onClickStep,
  onOpenSubProcess,
}: Props) {
  const elementsById = useMemo(
    () => new Map(elements.map((e) => [e.id, e])),
    [elements],
  );
  const reduceMotion = usePrefersReducedMotion();
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null);
  // Tracked separately from hover: the panel outlives the hover by a moment as
  // it fades, and it has to stay above its neighbours for the whole of it.
  const [detailStepId, setDetailStepId] = useState<string | null>(null);

  const handleDetailChange = useCallback((stepId: string, open: boolean) => {
    setDetailStepId((prev) => (open ? stepId : prev === stepId ? null : prev));
  }, []);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [positions, setPositions] = useState<Map<string, DOMRect>>(new Map());

  // Click-and-drag panning state
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef<{ active: boolean; startX: number; startY: number; scrollX: number; scrollY: number; moved: boolean } | null>(null);
  const didDragRef = useRef(false);

  // The ref leads the state: wheel events arrive faster than React renders, and
  // each one has to build on the zoom the last one asked for.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const contentRef = useRef<HTMLDivElement>(null);
  /**
   * The content point that should stay put on screen through a zoom, and where
   * on screen it sits. Applied once the new size has been laid out.
   */
  const zoomAnchor = useRef<{ cx: number; cy: number; mx: number; my: number } | null>(null);

  const zoomTo = useCallback((next: number, at?: { x: number; y: number }) => {
    const el = containerRef.current;
    if (!el) return;
    const z = zoomRef.current;
    const target = clampZoom(next);
    if (target === z) return;
    const mx = at?.x ?? el.clientWidth / 2;
    const my = at?.y ?? el.clientHeight / 2;
    // A burst of wheel events can land before the last zoom was laid out, when
    // scrollLeft is still stale. Keep the point already being held instead.
    const pending = zoomAnchor.current;
    zoomAnchor.current = pending
      ? { ...pending, mx, my }
      : { cx: (el.scrollLeft + mx) / z, cy: (el.scrollTop + my) / z, mx, my };
    zoomRef.current = target;
    setZoom(target);
  }, []);

  useLayoutEffect(() => {
    const a = zoomAnchor.current;
    const el = containerRef.current;
    if (!a || !el) return;
    zoomAnchor.current = null;
    el.scrollLeft = a.cx * zoom - a.mx;
    el.scrollTop = a.cy * zoom - a.my;
  }, [zoom]);

  const loops = useMemo(() => deriveLoops(steps, connections), [steps, connections]);

  const columnMap = useMemo(
    () => assignColumns(steps, connections, loops),
    [steps, connections, loops]
  );

  const totalColumns = useMemo(() => {
    if (steps.length === 0) return 0;
    return Math.max(...Array.from(columnMap.values())) + 1;
  }, [columnMap, steps.length]);

  // Labels sit in the gutter between two columns, so the gutter has to be wide
  // enough to hold them. Reserving that space up front is what makes placement
  // solvable at all — no search finds room for a 120px chip in a 16px gap.
  const columnGaps = useMemo(() => {
    const labelsByGap = new Map<number, string[]>();
    for (const c of connections) {
      if (!c.label) continue;
      const from = columnMap.get(c.fromStepId);
      const to = columnMap.get(c.toStepId);
      if (from == null || to == null) continue;
      // Only edges between neighbouring columns are pinned to a gutter. A
      // longer edge crosses whole cells and finds its own room; a backward
      // edge is drawn as a loop and does not belong to a gutter at all.
      if (to !== from + 1) continue;
      const list = labelsByGap.get(from) ?? [];
      list.push(c.label);
      labelsByGap.set(from, list);
    }
    return Array.from({ length: Math.max(0, totalColumns - 1) }, (_, i) =>
      labelGutterWidth(labelsByGap.get(i) ?? [], COL_GAP),
    );
  }, [connections, columnMap, totalColumns]);

  const gridMinWidth =
    LANE_LABEL_W +
    totalColumns * CARD_W +
    columnGaps.reduce((sum, g) => sum + g, 0) +
    PAD_X * 2;

  const { lanes, stepsByLane } = useMemo(() => {
    const laneOrder: string[] = [];
    const map = new Map<string, ProcessStep[]>();
    for (const s of steps) {
      const key = getLaneKey(s, grouping);
      if (!map.has(key)) {
        laneOrder.push(key);
        map.set(key, []);
      }
      map.get(key)!.push(s);
    }
    // The automated lane sits under the people, as support rather than cast.
    const automatedAt = laneOrder.indexOf(AUTOMATED_LANE);
    if (grouping === 'people' && automatedAt >= 0) {
      laneOrder.splice(automatedAt, 1);
      laneOrder.push(AUTOMATED_LANE);
    }
    return { lanes: laneOrder, stepsByLane: map };
  }, [steps, grouping]);

  const stepLaneMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of steps) m.set(s.id, getLaneKey(s, grouping));
    return m;
  }, [steps, grouping]);

  const isCrossLane = useCallback(
    (c: ProcessConnection) => {
      const fl = stepLaneMap.get(c.fromStepId);
      const tl = stepLaneMap.get(c.toStepId);
      return fl !== tl;
    },
    [stepLaneMap]
  );

  const highlightedConnections = useMemo(() => {
    if (!hoveredStepId) return new Set<string>();
    const set = new Set<string>();
    for (const c of connections) {
      if (c.fromStepId === hoveredStepId || c.toStepId === hoveredStepId) {
        set.add(`${c.fromStepId}->${c.toStepId}`);
      }
    }
    return set;
  }, [hoveredStepId, connections]);

  const highlightedSteps = useMemo(() => {
    if (!hoveredStepId) return new Set<string>();
    const set = new Set<string>([hoveredStepId]);
    for (const c of connections) {
      if (c.fromStepId === hoveredStepId) set.add(c.toStepId);
      if (c.toStepId === hoveredStepId) set.add(c.fromStepId);
    }
    return set;
  }, [hoveredStepId, connections]);

  const { startStepIds, endStepIds } = useMemo(() => {
    const hasIncoming = new Set<string>();
    const hasOutgoing = new Set<string>();
    for (const c of connections) {
      hasIncoming.add(c.toStepId);
      hasOutgoing.add(c.fromStepId);
    }
    const startIds = new Set<string>();
    const endIds = new Set<string>();
    for (const s of steps) {
      if (!hasIncoming.has(s.id)) startIds.add(s.id);
      if (!hasOutgoing.has(s.id)) endIds.add(s.id);
    }
    return { startStepIds: startIds, endStepIds: endIds };
  }, [steps, connections]);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cr = container.getBoundingClientRect();
    const sl = container.scrollLeft;
    const st = container.scrollTop;
    const next = new Map<string, DOMRect>();
    cardRefs.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      // The arrows are drawn inside the zoomed content, so they want unzoomed
      // coordinates; the browser reports everything at its on-screen size.
      const z = zoomRef.current;
      next.set(
        id,
        new DOMRect((r.x - cr.x + sl) / z, (r.y - cr.y + st) / z, r.width / z, r.height / z),
      );
    });
    setPositions(next);
  }, []);

  useEffect(() => {
    const t = setTimeout(measure, 50);
    const obs = new ResizeObserver(measure);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => { clearTimeout(t); obs.disconnect(); };
  }, [measure, steps, connections, grouping, totalColumns, zoom]);

  // Fit shows the whole process at once, but never blows a small one up past
  // its real size.
  const fitToScreen = useCallback(() => {
    const el = containerRef.current;
    const inner = contentRef.current;
    if (!el || !inner) return;
    const z = zoomRef.current;
    const height = inner.getBoundingClientRect().height / z;
    const next = clampZoom(Math.min(el.clientWidth / gridMinWidth, el.clientHeight / height, 1));
    zoomAnchor.current = { cx: 0, cy: 0, mx: 0, my: 0 };
    zoomRef.current = next;
    setZoom(next);
  }, [gridMinWidth]);

  // Listened for by hand: React's onWheel is passive, so it can't stop the page
  // from zooming itself instead.
  const hasSteps = steps.length > 0;
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = Math.max(-ZOOM_WHEEL_MAX_DELTA, Math.min(ZOOM_WHEEL_MAX_DELTA, e.deltaY));
      const rect = el.getBoundingClientRect();
      zoomTo(zoomRef.current * Math.exp(-delta * ZOOM_WHEEL_RATE), {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomTo, hasSteps]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => measure();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [measure]);

  const setCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  // Edge labels are placed against the measured cards rather than dropped at
  // the midpoint of the line, which is frequently on top of an unrelated card.
  // Highlighted edges go first so the ones the reader is looking at get the
  // best spots, and the rest arrange themselves around those.
  const labelPlacements = useMemo(() => {
    const withGeometry = connections
      .filter((c) => c.label)
      .map((c) => {
        const fromRect = positions.get(c.fromStepId);
        const toRect = positions.get(c.toStepId);
        if (!fromRect || !toRect) return null;
        const key = `${c.fromStepId}->${c.toStepId}`;
        return {
          key,
          label: c.label as string,
          x1: fromRect.x + fromRect.width,
          y1: fromRect.y + fromRect.height / 2,
          x2: toRect.x,
          y2: toRect.y + toRect.height / 2,
          priority: highlightedConnections.has(key) ? 0 : 1,
        };
      })
      .filter(Boolean) as (EdgeGeometry & { priority: number })[];

    withGeometry.sort((a, b) => a.priority - b.priority);

    const cards = Array.from(positions.values(), (r) => ({
      x: r.x, y: r.y, w: r.width, h: r.height,
    }));

    return placeEdgeLabels(withGeometry, cards);
  }, [connections, positions, highlightedConnections]);

  // --- Click-and-drag panning handlers ---
  // Pointer capture is deferred until the drag threshold is crossed so that
  // short clicks and hovers on step cards are never swallowed.
  const pointerIdRef = useRef<number | null>(null);

  const resetDrag = useCallback(() => {
    dragState.current = null;
    pointerIdRef.current = null;
    setIsDragging(false);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, [role="button"], [data-step-card]')) return;

    const el = containerRef.current;
    if (!el) return;

    didDragRef.current = false;
    pointerIdRef.current = e.pointerId;
    dragState.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollX: el.scrollLeft,
      scrollY: el.scrollTop,
      moved: false,
    };
    // Do NOT capture yet — capture only once movement passes the threshold.
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragState.current;
    if (!ds?.active) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (!ds.moved && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
      ds.moved = true;
      setIsDragging(true);
      // Now that we know it's a real drag, capture so we track movement
      // even if the pointer leaves the container.
      const el = containerRef.current;
      if (el && pointerIdRef.current != null) {
        try { el.setPointerCapture(pointerIdRef.current); } catch { /* already released */ }
      }
    }
    if (!ds.moved) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollLeft = ds.scrollX - dx;
    el.scrollTop = ds.scrollY - dy;
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragState.current;
    if (!ds?.active) { resetDrag(); return; }
    if (ds.moved) didDragRef.current = true;
    const el = containerRef.current;
    if (el && pointerIdRef.current != null) {
      try { el.releasePointerCapture(pointerIdRef.current); } catch { /* ok */ }
    }
    resetDrag();
    if (ds.moved) setTimeout(() => { didDragRef.current = false; }, 0);
  }, [resetDrag]);

  const handlePointerCancel = useCallback(() => {
    const el = containerRef.current;
    if (el && pointerIdRef.current != null) {
      try { el.releasePointerCapture(pointerIdRef.current); } catch { /* ok */ }
    }
    resetDrag();
  }, [resetDrag]);

  const handleLostPointerCapture = useCallback(() => {
    // The browser took capture away — make sure local state is clean.
    resetDrag();
  }, [resetDrag]);

  const handleClickStep = useCallback((step: ProcessStep) => {
    if (didDragRef.current) return;
    onClickStep(step);
  }, [onClickStep]);

  if (steps.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No steps yet — click &quot;Add Step&quot; to begin
      </div>
    );
  }

  return (
    // The controls live outside the scroller so they stay pinned to the corner.
    <div className="relative h-full">
    <div
      ref={containerRef}
      className={`h-full overflow-auto relative ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handleLostPointerCapture}
    >
      {/* CSS zoom rather than a transform: it changes layout size, so the
          scrollbars, sticky lane labels and panning all keep working. */}
      <div ref={contentRef} style={{ minWidth: gridMinWidth, zoom }} className="relative">
        {/* SVG overlay for arrows + loop boxes — BEHIND all lane content (z-0)
            so it can never intercept pointer events on the cards. */}
        <svg
          className="absolute inset-0 pointer-events-none z-0"
          style={{ width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
        >
          <defs>
            {/* Open chevrons rather than filled triangles: they read as direction
                without adding weight. One marker per colour, since marker fill
                can't follow the line it sits on in every browser. */}
            <marker id="loop-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse">
              <path className="pointer-events-none" d="M 2 1.5 L 8 5 L 2 8.5" fill="none" stroke="hsl(var(--primary) / 0.5)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto" markerUnits="userSpaceOnUse">
              <path className="pointer-events-none" d="M 2 1.5 L 8 5 L 2 8.5" fill="none" stroke={EDGE_COLOR} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id="flow-arrow-hi" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="10" markerHeight="10" orient="auto" markerUnits="userSpaceOnUse">
              <path className="pointer-events-none" d="M 2 1.5 L 8 5 L 2 8.5" fill="none" stroke={EDGE_COLOR_HI} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>

          {loops.map(loop => {
            if (loop.stepIds.length < 2) return null;
            const rects = loop.stepIds.map(sid => positions.get(sid)).filter(Boolean) as DOMRect[];
            if (rects.length < 2) return null;
            const pad = 12;
            const minX = Math.min(...rects.map(r => r.x)) - pad;
            const minY = Math.min(...rects.map(r => r.y)) - pad - 24;
            const maxX = Math.max(...rects.map(r => r.x + r.width)) + pad;
            const maxY = Math.max(...rects.map(r => r.y + r.height)) + pad;
            const w = maxX - minX;
            const h = maxY - minY;

            const lastStepId = loop.stepIds[loop.stepIds.length - 1];
            const lastRect = positions.get(lastStepId);
            const reentryRect = positions.get(loop.reentryStepId);

            return (
              <g key={loop.id} className="pointer-events-none">
                <rect
                  className="pointer-events-none"
                  x={minX} y={minY} width={w} height={h}
                  rx={12} ry={12}
                  fill="hsl(var(--primary) / 0.04)"
                  stroke="hsl(var(--primary) / 0.25)"
                  strokeWidth={2}
                  strokeDasharray="8 4"
                />
                <text
                  className="pointer-events-none"
                  x={minX + 14} y={minY + 16}
                  fill="hsl(var(--primary) / 0.7)"
                  fontSize={11} fontWeight={600}
                >
                  {loop.name}
                </text>

                {lastRect && reentryRect && (
                  (() => {
                    const x1 = lastRect.x + lastRect.width / 2;
                    const y1 = maxY;
                    const x2 = reentryRect.x + reentryRect.width / 2;
                    const y2 = maxY;
                    const drop = 24;
                    const path = `M ${x1} ${y1 - pad} L ${x1} ${y1 + drop} C ${x1} ${y1 + drop + 12}, ${x2} ${y1 + drop + 12}, ${x2} ${y2 + drop} L ${x2} ${y2 - pad}`;
                    return (
                      <path
                        className="pointer-events-none"
                        d={path}
                        fill="none"
                        stroke="hsl(var(--primary) / 0.4)"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        markerEnd="url(#loop-arrow)"
                      />
                    );
                  })()
                )}
              </g>
            );
          })}

          {connections.map(c => {
            const fromRect = positions.get(c.fromStepId);
            const toRect = positions.get(c.toStepId);
            if (!fromRect || !toRect) return null;

            const key = `${c.fromStepId}->${c.toStepId}`;
            const highlighted = highlightedConnections.has(key);
            const dimmed = hoveredStepId !== null && !highlighted;

            const x1 = fromRect.x + fromRect.width;
            const y1 = fromRect.y + fromRect.height / 2;
            const x2 = toRect.x;
            const y2 = toRect.y + toRect.height / 2;

            const dx = Math.abs(x2 - x1);
            const dy = Math.abs(y2 - y1);
            // A handoff between lanes with little horizontal room would kink into
            // a near-vertical S, so give the bend a floor that grows with the drop.
            // Same-row edges keep a plain proportional curve and never overshoot.
            const cpOffset = Math.max(dx * 0.5, Math.min(EDGE_MIN_BEND, dy * 0.4));
            const path = `M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}`;

            // Dots travel at a steady pace, so a long edge takes longer rather
            // than its dots racing to keep up with a short one.
            const length = Math.hypot(dx, dy);
            const dur = Math.min(EDGE_DOT_MAX_S, Math.max(EDGE_DOT_MIN_S, length / EDGE_DOT_SPEED));
            const dotCount = length > EDGE_SECOND_DOT_PX ? 2 : 1;
            const color = highlighted ? EDGE_COLOR_HI : EDGE_COLOR;

            return (
              <g
                key={c.id || key}
                className="pointer-events-none transition-opacity duration-200"
                opacity={dimmed ? 0.12 : 1}
              >
                <path
                  className="pointer-events-none"
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={highlighted ? 2 : 1.5}
                  strokeLinecap="round"
                  markerEnd={highlighted ? 'url(#flow-arrow-hi)' : 'url(#flow-arrow)'}
                />
                {/* Where the work leaves the card. */}
                <circle className="pointer-events-none" cx={x1} cy={y1} r={2.5} fill={color} />
                {/* Dots only run on the paths of the hovered step: motion is an
                    answer to "where does this go?", not wallpaper. */}
                {!reduceMotion && highlighted &&
                  Array.from({ length: dotCount }, (_, i) => (
                    <circle
                      key={i}
                      className="pointer-events-none"
                      r={3}
                      fill={EDGE_COLOR_HI}
                    >
                      <animateMotion
                        path={path}
                        dur={`${dur}s`}
                        begin={`${(dur / dotCount) * i}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  ))}
              </g>
            );
          })}
        </svg>

        {/* Edge labels — also BEHIND the lane content (z-[1]) so they can
            never block pointer events on cards. A chip with nowhere clear to
            go tucks behind a card rather than covering it. */}
        <svg
          className="absolute inset-0 pointer-events-none z-[1]"
          style={{ width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
        >
          {labelPlacements.map((l) => {
            const highlighted = highlightedConnections.has(l.key);
            const dimmed = hoveredStepId !== null && !highlighted;
            return (
              <g
                key={l.key}
                opacity={dimmed ? 0.12 : 1}
                className="pointer-events-none transition-opacity duration-200"
              >
                <rect
                  className="pointer-events-none"
                  x={l.x} y={l.y} width={l.w} height={l.h}
                  rx={Math.min(8, l.h / 2)} ry={Math.min(8, l.h / 2)}
                  fill="hsl(var(--background))"
                  stroke={highlighted ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                  strokeWidth={1}
                />
                <text
                  className="pointer-events-none"
                  textAnchor="middle"
                  fill={highlighted ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'}
                  fontSize={LABEL_FONT_SIZE}
                  fontWeight={LABEL_FONT_WEIGHT}
                >
                  {l.lines.map((line, i) => (
                    <tspan
                      className="pointer-events-none"
                      key={i}
                      x={l.x + l.w / 2}
                      y={l.y + LABEL_PAD_Y + LABEL_LINE_H * i + LABEL_LINE_H / 2}
                      dominantBaseline="central"
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Lanes — wrapped in relative z-10 so lane content (including step
            cards) stacks above both SVG background layers. */}
        <div className="relative z-10">
          {lanes.map((lane, laneIdx) => {
            const laneSteps = stepsByLane.get(lane) || [];
            if (laneSteps.length === 0) return null;

            // Two steps can share a lane AND a column — two starts, or the
            // branches of a decision landing on the same performer. They sit at
            // the same depth, so stack them into sub-rows rather than letting one
            // overwrite the other or shunting it rightwards into a false sequence.
            const laneRows: (ProcessStep | null)[][] = [];
            for (const s of laneSteps) {
              const col = columnMap.get(s.id) ?? 0;
              let row = laneRows.find((r) => r[col] == null);
              if (!row) {
                row = Array.from({ length: totalColumns }, () => null);
                laneRows.push(row);
              }
              row[col] = s;
            }

            // Whichever element the lane is named after — the performer in the
            // people view, the app in the app view.
            const first = laneSteps[0];
            const isAutomated = grouping === 'people' && lane === AUTOMATED_LANE;
            const laneRef = isAutomated
              ? null
              : grouping === 'people'
              ? first?.performedBy
              : first?.performedBy?.actorClass === 'System'
              ? first.performedBy
              : first?.uses.find((u) => u.actorClass === 'System') ?? null;

            const laneType = isAutomated
              ? 'Run by apps'
              : grouping === 'people'
              ? laneRef?.typeName || ''
              : '';
            const laneColor = laneRef?.color || '';
            const isExternal = laneRef?.party === 'External';

            // A role or team lane says who is actually in it, so one view answers
            // who does what. Only for human lanes: walking the owner chain from an
            // app finds whoever owns the tool, who is not the one doing the step.
            const person =
              grouping === 'people' && laneRef?.actorClass === 'Human'
                ? resolveByKind(laneRef.id, HUMAN_KIND.individual, elementsById)
                : null;
            const personName = person && person.name !== lane ? person.name : '';

            return (
              <div key={lane} className="border-b border-border flex">
                <div className="w-44 shrink-0 border-r border-border bg-card px-4 py-4 sticky left-0 z-[15]">
                  <div className="flex items-center gap-1.5">
                    {isAutomated && <Zap className="h-3 w-3 shrink-0 text-muted-foreground" />}
                    {laneColor && (
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: laneColor }}
                      />
                    )}
                    <span className="text-xs font-semibold truncate">{lane}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {laneType ? `${laneType} · ` : ''}
                    {personName ? `${personName} · ` : ''}
                    {laneSteps.length} step{laneSteps.length !== 1 ? 's' : ''}
                    {isExternal ? ' · external' : ''}
                  </p>
                </div>

                {/* Faint banding so a row stays trackable across a wide diagram. */}
                <div
                  className={`flex-1 px-6 py-5 ${
                    laneIdx % 2 === 1 ? 'bg-foreground/[0.025]' : ''
                  }`}
                >
                  <div className="space-y-3">
                    {laneRows.map((colSlots, rowIdx) => (
                      <div key={rowIdx} className="flex">
                    {colSlots.map((step, colIdx) => (
                      <div
                        key={colIdx}
                        className={`shrink-0 min-h-[80px] flex items-center relative ${
                          step && detailStepId === step.id
                            ? 'z-[20]'
                            : hoveredStepId && step?.id === hoveredStepId
                            ? 'z-[10]'
                            : 'z-[3]'
                        }`}
                        style={{
                          width: CARD_W,
                          marginRight: colIdx < totalColumns - 1 ? columnGaps[colIdx] : 0,
                        }}
                      >
                        {step ? (
                          <StepCard
                            step={step}
                            onClick={() => handleClickStep(step)}
                            onOpenSubProcess={onOpenSubProcess}
                            onHover={setHoveredStepId}
                            onDetailChange={handleDetailChange}
                            isHighlighted={hoveredStepId === step.id}
                            isDimmed={hoveredStepId !== null && !highlightedSteps.has(step.id)}
                            isStart={startStepIds.has(step.id)}
                            isEnd={endStepIds.has(step.id)}
                            hasCrossLaneDep={connections.some(
                              c => isCrossLane(c) && (c.fromStepId === step.id || c.toStepId === step.id)
                            )}
                            ref={(el) => setCardRef(step.id, el)}
                          />
                        ) : (
                          <div className="w-full" />
                        )}
                      </div>
                    ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          <div className="h-2" />
        </div>
      </div>
    </div>

    <div className="absolute bottom-4 right-4 z-30 flex items-center gap-0.5 rounded-full border border-border bg-card/95 p-1 shadow-md backdrop-blur">
      <button
        type="button"
        className={ZOOM_BTN}
        onClick={() => zoomTo(zoomRef.current / ZOOM_STEP)}
        disabled={zoom <= ZOOM_MIN}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="h-7 min-w-[48px] rounded-full px-2 text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => zoomTo(1)}
        title="Reset to 100%"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className={ZOOM_BTN}
        onClick={() => zoomTo(zoomRef.current * ZOOM_STEP)}
        disabled={zoom >= ZOOM_MAX}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
      <button
        type="button"
        className={ZOOM_BTN}
        onClick={fitToScreen}
        aria-label="Fit to screen"
        title="Fit to screen"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
    </div>
    </div>
  );
}

// --- Step Card ---

interface StepCardProps {
  step: ProcessStep;
  onClick: () => void;
  onOpenSubProcess: (processId: string) => void;
  onHover: (id: string | null) => void;
  /** Lets the grid keep this column above its neighbours while the panel shows. */
  onDetailChange: (stepId: string, open: boolean) => void;
  isHighlighted: boolean;
  isDimmed: boolean;
  isStart: boolean;
  isEnd: boolean;
  hasCrossLaneDep: boolean;
}

const PANEL_W = 256;
/** Logos shown beside a step's main app before the rest fold into "+N". */
const MAX_USE_BADGES = 3;
const PANEL_FADE_MS = 150;

const StepCard = forwardRef<HTMLDivElement, StepCardProps>(
  (
    {
      step,
      onClick,
      onOpenSubProcess,
      onHover,
      onDetailChange,
      isHighlighted,
      isDimmed,
      isStart,
      isEnd,
      hasCrossLaneDep,
    },
    ref,
  ) => {
    const checklistItems = step.checklist || [];
    const [showDetail, setShowDetail] = useState(false);
    const [side, setSide] = useState<'right' | 'left'>('right');
    const closeTimeout = useRef<ReturnType<typeof setTimeout>>();
    const layerTimeout = useRef<ReturnType<typeof setTimeout>>();
    const cardEl = useRef<HTMLDivElement | null>(null);

    // The grid also wants this node for drawing arrows, so hand it on.
    const setRefs = (node: HTMLDivElement | null) => {
      cardEl.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    };

    useEffect(
      () => () => {
        clearTimeout(closeTimeout.current);
        clearTimeout(layerTimeout.current);
      },
      [],
    );

    const openDetail = () => {
      clearTimeout(closeTimeout.current);
      clearTimeout(layerTimeout.current);
      // Open away from the edge of the window rather than off it.
      const rect = cardEl.current?.getBoundingClientRect();
      if (rect) {
        setSide(window.innerWidth - rect.right >= PANEL_W + 24 ? 'right' : 'left');
      }
      setShowDetail(true);
      onDetailChange(step.id, true);
    };

    const scheduleCloseDetail = () => {
      clearTimeout(closeTimeout.current);
      closeTimeout.current = setTimeout(() => {
        setShowDetail(false);
        // Drop back down only once the fade is done, otherwise the panel spends
        // its last frames behind the card it is covering.
        layerTimeout.current = setTimeout(
          () => onDetailChange(step.id, false),
          PANEL_FADE_MS + 30,
        );
      }, 200);
    };

    const isDecision = step.stepType === 'Decision';
    const performer = step.performedBy;
    const color = performer?.color || '';
    const primaryUse = step.uses[0];
    const extraUses = step.uses.slice(1);
    const shownExtras = extraUses.slice(0, MAX_USE_BADGES);
    const hiddenExtras = extraUses.length - shownExtras.length;
    const hasDetail = checklistItems.length > 0 || step.uses.length > 1 || step.produces.length > 0;

    return (
      <div
        ref={setRefs}
        data-step-card
        className={`w-52 shrink-0 rounded-lg bg-card p-3 cursor-pointer pointer-events-auto transition-all duration-200 relative ${
          isHighlighted
            ? 'border-2 border-primary shadow-sm'
            : hasCrossLaneDep
            ? 'border border-primary/30'
            : 'border border-border'
        } ${isDimmed ? 'opacity-30' : 'opacity-100'} shadow-sm hover:shadow-md`}
        onClick={onClick}
        onMouseEnter={() => { onHover(step.id); if (hasDetail) openDetail(); }}
        onMouseLeave={() => { onHover(null); scheduleCloseDetail(); }}
      >
        <div className="flex items-center justify-between gap-1.5 mb-1.5">
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded truncate max-w-[110px]"
            style={
              color
                ? { backgroundColor: `${color}26`, color }
                : undefined
            }
          >
            {performer?.name || 'Unassigned'}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {isDecision ? (
              // BPMN draws a gateway as a diamond; a rotated square is the
              // honest version of that at badge size.
              <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 border-[1.5px] border-current rotate-45 shrink-0"
                />
                Decision
              </span>
            ) : (
              step.stepType &&
              step.stepType !== 'Task' && (
                <span className="text-[10px] font-medium text-muted-foreground border border-border px-1 py-0.5 rounded">
                  {step.stepType}
                </span>
              )
            )}
            {isStart && (
              <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">
                <Play className="h-2.5 w-2.5 fill-current" />Start
              </span>
            )}
            {isEnd && (
              <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">
                <Flag className="h-2.5 w-2.5" />End
              </span>
            )}
          </div>
        </div>

        <p className="text-xs font-medium line-clamp-1">{step.title}</p>

        {step.description && (
          <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
            {step.description}
          </p>
        )}

        {/* empty:hidden so a step with nothing to show leaves no gap behind */}
        <div className="mt-2 flex items-center gap-2 text-muted-foreground empty:hidden">
          {primaryUse && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium min-w-0">
              <ElementIcon
                name={primaryUse.name}
                image={primaryUse.image}
                icon={primaryUse.icon}
                typeIcon={primaryUse.typeIcon}
                color={primaryUse.color}
                size={12}
              />
              <span className={`truncate ${shownExtras.length ? 'max-w-[72px]' : 'max-w-[128px]'}`}>
                {primaryUse.name}
              </span>
            </span>
          )}
          {/* The other apps as overlapping logos: you can tell what's involved
              at a glance, and the card keeps one line however many there are. */}
          {shownExtras.length > 0 && (
            <span className="inline-flex items-center shrink-0">
              <span className="flex -space-x-1">
                {shownExtras.map((u) => (
                  <span
                    key={u.id}
                    title={u.name}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-background ring-[1.5px] ring-card border border-border"
                  >
                    <ElementIcon
                      name={u.name}
                      image={u.image}
                      icon={u.icon}
                      typeIcon={u.typeIcon}
                      color={u.color}
                      size={10}
                    />
                  </span>
                ))}
              </span>
              {hiddenExtras > 0 && (
                <span
                  className="ml-1 text-[10px] font-medium"
                  title={extraUses.slice(MAX_USE_BADGES).map((u) => u.name).join(', ')}
                >
                  +{hiddenExtras}
                </span>
              )}
            </span>
          )}
          {step.produces.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium">
              <CornerDownRight className="h-3 w-3" />
              {step.produces.length}
            </span>
          )}
          {checklistItems.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium">
              <ListChecks className="h-3 w-3" />
              {checklistItems.length}
            </span>
          )}
        </div>

        {step.subProcessId && (
          // The whole point of a sub-process step is going to it, so it gets a
          // full-width control rather than a footnote.
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSubProcess(step.subProcessId!);
            }}
            className="mt-2.5 w-full flex items-center justify-between gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 hover:border-primary/60"
            title={`Open ${step.subProcessName || 'sub-process'}`}
          >
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <Workflow className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{step.subProcessName || 'Sub-process'}</span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </button>
        )}

        {/* Hover detail panel — kept mounted so it can fade out as well as in */}
        {hasDetail && (
          <div
            className={`absolute top-0 w-64 bg-popover border border-border rounded-lg shadow-lg p-3 z-[20] transition-[opacity,transform] ease-out ${
              side === 'right' ? 'left-full ml-2' : 'right-full mr-2'
            } ${
              showDetail
                ? 'opacity-100 translate-x-0'
                : `opacity-0 pointer-events-none ${
                    side === 'right' ? '-translate-x-1' : 'translate-x-1'
                  }`
            }`}
            style={{ transitionDuration: `${PANEL_FADE_MS}ms` }}
            aria-hidden={!showDetail}
            onMouseEnter={openDetail}
            onMouseLeave={scheduleCloseDetail}
            onClick={(e) => e.stopPropagation()}
          >
            {step.uses.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Uses</p>
                <div className="flex flex-wrap gap-1">
                  {step.uses.map(u => (
                    <span
                      key={u.id}
                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                      style={u.color ? { backgroundColor: `${u.color}26`, color: u.color } : undefined}
                    >
                      <ElementIcon
                        name={u.name}
                        image={u.image}
                        icon={u.icon}
                        typeIcon={u.typeIcon}
                        color={u.color}
                        size={11}
                      />
                      {u.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {step.produces.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Produces</p>
                <div className="flex flex-wrap gap-1">
                  {step.produces.map(p => (
                    <span
                      key={p.id}
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={p.color ? { backgroundColor: `${p.color}26`, color: p.color } : undefined}
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {checklistItems.length > 0 && (
              <>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Checklist
                </p>
                <ol className="space-y-1.5">
                  {checklistItems.map((item, idx) => (
                    <li key={item.id} className="flex gap-2 text-xs leading-relaxed">
                      <span className="text-muted-foreground font-mono shrink-0 w-4 text-right">{idx + 1}.</span>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        )}
      </div>
    );
  }
);

StepCard.displayName = 'StepCard';
