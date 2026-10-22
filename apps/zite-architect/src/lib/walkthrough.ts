import type { ElementRef, ProcessConnection, ProcessLoop, ProcessStep } from '@/types';
import {
  AUTOMATED_LANE,
  assignColumns,
  deriveLoops,
  getLaneKey,
} from '../components/SwimlaneDiagram';

const isApp = (e: ElementRef | null | undefined): e is ElementRef => e?.actorClass === 'System';

/** The apps a step involves: whatever runs it, then whatever it uses. */
export function appsOf(step: ProcessStep): ElementRef[] {
  const all = [...(isApp(step.performedBy) ? [step.performedBy] : []), ...step.uses.filter(isApp)];
  return [...new Map(all.map((e) => [e.id, e])).values()];
}

export interface MapCard {
  step: ProcessStep;
  lane: number;
  col: number;
  /** Run by an app on its own. */
  automated: boolean;
}

export interface Section {
  /** "First step → Last step", so nothing has to be named by hand. */
  label: string;
  colStart: number;
  colEnd: number;
  stepIds: Set<string>;
}

export interface WalkthroughMap {
  lanes: string[];
  cards: MapCard[];
  connections: ProcessConnection[];
  loops: ProcessLoop[];
  columns: number;
  sections: Section[];
  /** The widest section, in columns: what the camera has to fit. */
  maxSectionCols: number;
}

/** Roughly how many steps one section should hold. */
const STEPS_PER_SECTION = 4;
const MAX_SECTIONS = 6;

/**
 * The process laid out the same way as the map (people lanes, left to right),
 * then cut into a handful of sections the walkthrough moves through one at a
 * time. Cuts fall between columns, so a section is always one unbroken
 * stretch of the map.
 */
export function buildWalkthroughMap(steps: ProcessStep[], connections: ProcessConnection[]): WalkthroughMap {
  const loops = deriveLoops(steps, connections);
  const colOf = assignColumns(steps, connections, loops);
  const seq = new Map(steps.map((s, i) => [s.id, i]));
  const ordered = [...steps].sort(
    (a, b) => (colOf.get(a.id) ?? 0) - (colOf.get(b.id) ?? 0) || (seq.get(a.id) ?? 0) - (seq.get(b.id) ?? 0),
  );

  // Lanes in the order people first appear, with the automated lane last.
  const lanes: string[] = [];
  for (const s of ordered) {
    const lane = getLaneKey(s, 'people');
    if (!lanes.includes(lane)) lanes.push(lane);
  }
  const autoAt = lanes.indexOf(AUTOMATED_LANE);
  if (autoAt >= 0) lanes.push(...lanes.splice(autoAt, 1));

  const cards = ordered.map((step) => ({
    step,
    lane: lanes.indexOf(getLaneKey(step, 'people')),
    col: colOf.get(step.id) ?? 0,
    automated: isApp(step.performedBy),
  }));
  const columns = cards.length ? Math.max(...cards.map((c) => c.col)) + 1 : 0;

  // Fill each section column by column until it holds its share of steps.
  const count = Math.max(1, Math.min(MAX_SECTIONS, Math.round(steps.length / STEPS_PER_SECTION)));
  const share = Math.ceil(steps.length / count);
  const byCol = Array.from({ length: columns }, (_, c) => cards.filter((k) => k.col === c));
  const sections: Section[] = [];
  let start = 0;
  let held: MapCard[] = [];
  for (let c = 0; c < columns; c += 1) {
    held.push(...byCol[c]);
    const last = c === columns - 1;
    if (last || (held.length >= share && sections.length < count - 1)) {
      const first = held[0]?.step.title ?? '';
      const end = held[held.length - 1]?.step.title ?? '';
      sections.push({
        label: held.length > 1 ? `${first} → ${end}` : first,
        colStart: start,
        colEnd: c,
        stepIds: new Set(held.map((k) => k.step.id)),
      });
      start = c + 1;
      held = [];
    }
  }

  return {
    lanes,
    cards,
    connections: connections.filter((c) => colOf.has(c.fromStepId) && colOf.has(c.toStepId)),
    loops,
    columns,
    sections,
    maxSectionCols: Math.max(1, ...sections.map((s) => s.colEnd - s.colStart + 1)),
  };
}
