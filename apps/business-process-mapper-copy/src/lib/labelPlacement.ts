/**
 * Where to put the little text chip on a connector.
 *
 * The hard part is not choosing a point on the line, it is that the space
 * between two columns of cards is a 16px gutter and a label like
 * "Budget $5,000 or under" is over a hundred pixels wide. No search finds a
 * clear spot in a gap that never had room in it, so the label ends up over a
 * card no matter how cleverly it is placed.
 *
 * So this module does three things, in order of how much they matter:
 *
 *   1. `labelGutterWidth` tells the diagram how wide a gutter has to be to
 *      hold the labels crossing it, so the layout can reserve the space
 *      before anything is drawn. Making room beats searching for room.
 *   2. `layoutLabel` wraps a long label onto a second line and caps its
 *      width, so reserving that space costs a reasonable amount of gutter
 *      rather than an absurd amount.
 *   3. `placeEdgeLabels` still searches — for the long edges that span
 *      several columns and cannot be solved by gutter width alone, and as
 *      the safety net when two labels want the same spot.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EdgeGeometry {
  /** Stable identity for the edge — used as the React key. */
  key: string;
  label: string;
  /** Start point (right edge of the source card). */
  x1: number;
  y1: number;
  /** End point (left edge of the target card). */
  x2: number;
  y2: number;
}

export interface PlacedLabel extends Box {
  key: string;
  lines: string[];
}

export const boxesOverlap = (a: Box, b: Box, margin = 0): boolean =>
  a.x < b.x + b.w + margin &&
  a.x + a.w + margin > b.x &&
  a.y < b.y + b.h + margin &&
  a.y + a.h + margin > b.y;

/** Point at t on the cubic bezier the connector is drawn as. */
function bezierPoint(
  t: number,
  x1: number, y1: number,
  cx1: number, cy1: number,
  cx2: number, cy2: number,
  x2: number, y2: number,
): { x: number; y: number } {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * x1 + b * cx1 + c * cx2 + d * x2,
    y: a * y1 + b * cy1 + c * cy2 + d * y2,
  };
}

// ---------------------------------------------------------------------------
// Text measurement and wrapping
// ---------------------------------------------------------------------------

// One canvas for the whole module: measuring is the only way to size a chip
// correctly, and a per-call canvas would be wasteful on every re-measure.
let measureCtx: CanvasRenderingContext2D | null | undefined;

export const LABEL_FONT_SIZE = 10;
export const LABEL_FONT_WEIGHT = 600;
export const LABEL_LINE_H = 13;
export const LABEL_PAD_X = 7;
export const LABEL_PAD_Y = 4;

const LABEL_FONT = `${LABEL_FONT_WEIGHT} ${LABEL_FONT_SIZE}px Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`;

/**
 * Widest a chip is allowed to get. Every pixel here is a pixel of gutter the
 * diagram has to reserve on the widest label, so this trades label legibility
 * against how spread out the whole process becomes.
 */
const MAX_CHIP_W = 112;
const MAX_LINES = 2;

export function measureLabelWidth(text: string): number {
  if (measureCtx === undefined) {
    measureCtx = document.createElement('canvas').getContext('2d');
  }
  // No canvas (SSR, or a context the browser refused) — estimate from length.
  if (!measureCtx) return text.length * LABEL_FONT_SIZE * 0.56;
  measureCtx.font = LABEL_FONT;
  return measureCtx.measureText(text).width;
}

/** Trim a line character by character until it fits, with an ellipsis. */
function ellipsize(text: string, maxW: number): string {
  if (measureLabelWidth(text) <= maxW) return text;
  let cut = text;
  while (cut.length > 1 && measureLabelWidth(`${cut}…`) > maxW) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

export interface LabelLayout {
  lines: string[];
  w: number;
  h: number;
}

/**
 * Wrap a label to at most two lines within the width cap. Two lines roughly
 * halves the gutter a long label needs, which is the difference between a
 * diagram that fits on screen and one that does not.
 */
export function layoutLabel(text: string): LabelLayout {
  const maxTextW = MAX_CHIP_W - LABEL_PAD_X * 2;

  const chip = (lines: string[]): LabelLayout => ({
    lines,
    w: Math.max(...lines.map(measureLabelWidth)) + LABEL_PAD_X * 2,
    h: lines.length * LABEL_LINE_H + LABEL_PAD_Y * 2,
  });

  if (measureLabelWidth(text) <= maxTextW) return chip([text]);

  const words = text.split(/\s+/).filter(Boolean);

  // Balanced two-line break: of all the places the label could split, take the
  // one that makes the wider line as narrow as possible. That keeps the chip
  // compact and the break natural — "Budget $5,000 / or under" rather than the
  // "Budget $5,000 or / under" a greedy fill would produce.
  if (words.length > 1) {
    let best: { lines: string[]; width: number } | null = null;
    for (let i = 1; i < words.length; i++) {
      const head = words.slice(0, i).join(' ');
      const tail = words.slice(i).join(' ');
      const width = Math.max(measureLabelWidth(head), measureLabelWidth(tail));
      if (width > maxTextW) continue;
      if (!best || width < best.width) best = { lines: [head, tail], width };
    }
    if (best) return chip(best.lines);
  }

  // Too long even for two lines — greedy fill, then cut the overflow.
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    // `!current` keeps a single over-long word rather than dropping it; it
    // gets ellipsized below.
    if (!current || measureLabelWidth(next) <= maxTextW) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  // Anything past the line budget collapses into the last line and is cut.
  if (lines.length > MAX_LINES) {
    const kept = lines.slice(0, MAX_LINES - 1);
    kept.push(lines.slice(MAX_LINES - 1).join(' '));
    return chip(kept.map((l) => ellipsize(l, maxTextW)));
  }

  return chip(lines.map((l) => ellipsize(l, maxTextW)));
}

/** Breathing room between a chip and the card edge beside it. */
const GUTTER_CLEARANCE = 8;

/**
 * How wide a gutter needs to be to hold these labels side by side with the
 * cards on either side. Feed this back into the column layout so the space
 * exists before placement runs.
 */
export function labelGutterWidth(labels: string[], minimum: number): number {
  if (labels.length === 0) return minimum;
  const widest = Math.max(...labels.map((l) => layoutLabel(l).w));
  return Math.max(minimum, Math.ceil(widest) + GUTTER_CLEARANCE * 2);
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/** Clearance we insist on between a chip and a card. */
const CARD_MARGIN = 5;
/** Clearance between two chips. */
const LABEL_MARGIN = 3;

/**
 * Points along the curve to try, nearest the middle first. Staying close to
 * the middle keeps the label associated with its own edge; sliding towards
 * either end is the fallback when the middle is occupied.
 */
const CURVE_POSITIONS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.12, 0.88];
/** Perpendicular nudges to try once every point on the curve is blocked. */
const PERPENDICULAR_OFFSETS = [0, -16, 16, -30, 30, -46, 46];

/**
 * Place every edge label so it avoids the cards and the other labels.
 *
 * Edges are processed in the order given, and each placed label becomes an
 * obstacle for the ones after it — so the order is the priority order.
 */
export function placeEdgeLabels(edges: EdgeGeometry[], cards: Box[]): PlacedLabel[] {
  const placed: PlacedLabel[] = [];

  for (const edge of edges) {
    if (!edge.label) continue;

    const { x1, y1, x2, y2 } = edge;
    const cp = Math.abs(x2 - x1) * 0.6;
    const { lines, w, h } = layoutLabel(edge.label);

    let chosen: Box | null = null;
    let fallback: Box | null = null;
    // How much of the chip sits over a card, for the fallback. When nothing is
    // clear we want the least bad spot, not simply the first one tried.
    let fallbackCost = Infinity;

    for (const offset of PERPENDICULAR_OFFSETS) {
      for (const t of CURVE_POSITIONS) {
        const p = bezierPoint(t, x1, y1, x1 + cp, y1, x2 - cp, y2, x2, y2);
        const box: Box = { x: p.x - w / 2, y: p.y + offset - h / 2, w, h };

        if (placed.some((r) => boxesOverlap(box, r, LABEL_MARGIN))) continue;

        const cost = cards.reduce(
          (sum, r) => sum + overlapArea(box, r, CARD_MARGIN),
          0,
        );
        if (cost === 0) {
          chosen = box;
          break;
        }
        if (cost < fallbackCost) {
          fallbackCost = cost;
          fallback = box;
        }
      }
      if (chosen) break;
    }

    const box = chosen ?? fallback;
    if (!box) continue;
    placed.push({ ...box, key: edge.key, lines });
  }

  return placed;
}

/** Area of the intersection of two boxes — 0 when they do not touch. */
function overlapArea(a: Box, b: Box, margin = 0): number {
  const w = Math.min(a.x + a.w + margin, b.x + b.w) - Math.max(a.x - margin, b.x);
  const h = Math.min(a.y + a.h + margin, b.y + b.h) - Math.max(a.y - margin, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
