/** Sizes of one opened process on the Brain board, in board units. */
export const STEP_W = 210;
export const STEP_H = 104;
export const STEP_GAP_X = 64;
export const STEP_GAP_Y = 22;
export const FLOW_PAD = 28;
export const FLOW_HEAD = 64;
/** Room under the steps for arrows that loop back. */
export const FLOW_FOOT = 56;

export interface FlowLink {
  from: string;
  to: string;
  label: string;
}

export interface FlowLayout {
  /** Where each step sits, inside the opened process. */
  pos: Map<string, { x: number; y: number }>;
  forward: FlowLink[];
  /** Arrows that return to an earlier step. They are drawn underneath, dashed. */
  back: FlowLink[];
  width: number;
  height: number;
}

/**
 * Lays one process out left to right the way the work moves: each step goes one
 * column after the latest step that leads into it, and steps that share a column
 * (the branches of a decision) stack. Arrows that loop back are set aside first,
 * so the rest always runs forwards.
 */
export function flowLayout(stepIds: string[], links: FlowLink[]): FlowLayout {
  const known = new Set(stepIds);
  const edges = links.filter((l) => known.has(l.from) && known.has(l.to) && l.from !== l.to);
  const out = new Map(stepIds.map((id) => [id, [] as FlowLink[]]));
  const inDegree = new Map(stepIds.map((id) => [id, 0]));
  for (const e of edges) {
    out.get(e.from)!.push(e);
    inDegree.set(e.to, inDegree.get(e.to)! + 1);
  }

  // Walk from the starts. An arrow into a step still being walked goes backwards.
  const state = new Map<string, 1 | 2>();
  const back = new Set<FlowLink>();
  const walk = (root: string) => {
    const stack: { id: string; i: number }[] = [{ id: root, i: 0 }];
    state.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const list = out.get(top.id)!;
      if (top.i >= list.length) {
        state.set(top.id, 2);
        stack.pop();
        continue;
      }
      const e = list[top.i++];
      const s = state.get(e.to);
      if (s === 1) back.add(e);
      else if (!s) {
        state.set(e.to, 1);
        stack.push({ id: e.to, i: 0 });
      }
    }
  };
  for (const id of stepIds) if (!inDegree.get(id) && !state.has(id)) walk(id);
  for (const id of stepIds) if (!state.has(id)) walk(id);

  const forward = edges.filter((e) => !back.has(e));
  const into = new Map(stepIds.map((id) => [id, [] as string[]]));
  for (const e of forward) into.get(e.to)!.push(e.from);
  const touched = new Set(edges.flatMap((e) => [e.from, e.to]));

  // Column: one past the furthest step that leads in. A step with no arrows at all follows the one before it.
  const col = new Map<string, number>();
  const colOf = (id: string): number => {
    const known = col.get(id);
    if (known !== undefined) return known;
    col.set(id, 0);
    let c = 0;
    for (const from of into.get(id)!) c = Math.max(c, colOf(from) + 1);
    col.set(id, c);
    return c;
  };
  stepIds.forEach((id, i) => {
    if (!touched.has(id) && i > 0) col.set(id, colOf(stepIds[i - 1]) + 1);
    else colOf(id);
  });

  const rowsIn = new Map<number, number>();
  const pos = new Map<string, { x: number; y: number }>();
  for (const id of stepIds) {
    const c = col.get(id) ?? 0;
    const r = rowsIn.get(c) ?? 0;
    rowsIn.set(c, r + 1);
    pos.set(id, { x: FLOW_PAD + c * (STEP_W + STEP_GAP_X), y: FLOW_HEAD + r * (STEP_H + STEP_GAP_Y) });
  }
  const cols = Math.max(1, ...[...col.values()].map((c) => c + 1));
  const rows = Math.max(1, ...rowsIn.values());
  return {
    pos,
    forward,
    back: [...back],
    width: FLOW_PAD * 2 + cols * STEP_W + (cols - 1) * STEP_GAP_X,
    height: FLOW_HEAD + rows * STEP_H + (rows - 1) * STEP_GAP_Y + (back.size ? FLOW_FOOT : FLOW_PAD),
  };
}
