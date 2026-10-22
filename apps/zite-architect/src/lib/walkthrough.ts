import type { ElementRef, ProcessConnection, ProcessStep } from '@/types';

const isApp = (e: ElementRef | null | undefined): e is ElementRef => e?.actorClass === 'System';

/** One way out of a step, as "What happens next?" offers it. */
export interface Outcome {
  key: string;
  /** The edge's label, or empty when it has none. */
  label: string;
  targetId: string;
  /** Goes back to an earlier step. */
  loopsBack: boolean;
  /** The way Next takes by default. */
  main: boolean;
}

export interface OutlineItem {
  step: ProcessStep;
  /** 1-based position in the list. */
  number: number;
  /** Set for a step that only happens on one outcome of a decision. */
  branch: { label: string; decisionId: string } | null;
  /** Where Next goes from here; null at the end of a path. */
  nextId: string | null;
  /** Filled for a decision: every way out of it. */
  outcomes: Outcome[];
  /** The earlier step this one sends work back to, when it closes a loop. */
  loopBackId: string | null;
  /** What earlier steps produced that feeds into this one. */
  needs: ElementRef[];
}

export interface Outline {
  items: OutlineItem[];
  byId: Map<string, OutlineItem>;
}

/** The apps a step involves: whatever runs it, then whatever it uses. */
export function appsOf(step: ProcessStep): ElementRef[] {
  const all = [...(isApp(step.performedBy) ? [step.performedBy] : []), ...step.uses.filter(isApp)];
  return [...new Map(all.map((e) => [e.id, e])).values()];
}

/**
 * Every step in one numbered list, in the order the work flows.
 *
 * Arrows that loop back are set aside, so what's left runs forwards. At a
 * decision, the way with the most process still ahead of it is the main
 * path; steps that only happen down another way are listed straight after
 * the decision, under that outcome, so nothing is hidden and the main path
 * still reads top to bottom.
 */
export function buildOutline(steps: ProcessStep[], connections: ProcessConnection[]): Outline {
  const byStep = new Map(steps.map((s) => [s.id, s]));
  const seq = new Map(steps.map((s, i) => [s.id, i]));
  const edges = connections.filter((c) => byStep.has(c.fromStepId) && byStep.has(c.toStepId));
  const keyOf = (c: ProcessConnection) => `${c.fromStepId}->${c.toStepId}`;
  const outs = new Map<string, ProcessConnection[]>(steps.map((s) => [s.id, []]));
  const ins = new Map<string, ProcessConnection[]>(steps.map((s) => [s.id, []]));
  for (const c of edges) {
    outs.get(c.fromStepId)!.push(c);
    ins.get(c.toStepId)!.push(c);
  }

  // Back-edges by depth-first search, starting from steps nothing leads into.
  const back = new Set<string>();
  const state = new Map<string, 1 | 2>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const c of outs.get(id)!) {
      const s = state.get(c.toStepId);
      if (s === 1) back.add(keyOf(c));
      else if (!s) visit(c.toStepId);
    }
    state.set(id, 2);
  };
  const hasIncoming = new Set(edges.map((c) => c.toStepId));
  for (const s of steps) if (!hasIncoming.has(s.id) && !state.get(s.id)) visit(s.id);
  for (const s of steps) if (!state.get(s.id)) visit(s.id);

  const forward = (id: string) => outs.get(id)!.filter((c) => !back.has(keyOf(c)));

  const ahead = new Map<string, number>();
  const reach = (id: string): number => {
    const known = ahead.get(id);
    if (known != null) return known;
    const n = 1 + Math.max(0, ...forward(id).map((c) => reach(c.toStepId)));
    ahead.set(id, n);
    return n;
  };

  // The main way out of each decision.
  const mainOf = new Map<string, ProcessConnection>();
  const side = new Set<string>();
  for (const s of steps) {
    const ways = forward(s.id);
    if (s.stepType !== 'Decision' || ways.length < 2) continue;
    const main = [...ways].sort(
      (a, b) => reach(b.toStepId) - reach(a.toStepId) || (seq.get(a.toStepId) ?? 0) - (seq.get(b.toStepId) ?? 0),
    )[0];
    mainOf.set(s.id, main);
    for (const c of ways) if (c !== main) side.add(keyOf(c));
  }

  /** Flow order among the given steps, earliest-saved first when two are ready. */
  const flowOrder = (ids: Set<string>, usable: (c: ProcessConnection) => boolean) => {
    const waiting = new Map([...ids].map((id) => [id, 0]));
    for (const id of ids) {
      for (const c of forward(id)) {
        if (usable(c) && ids.has(c.toStepId)) waiting.set(c.toStepId, (waiting.get(c.toStepId) ?? 0) + 1);
      }
    }
    const ready = [...ids].filter((id) => waiting.get(id) === 0);
    const order: string[] = [];
    while (ready.length) {
      ready.sort((a, b) => (seq.get(a) ?? 0) - (seq.get(b) ?? 0));
      const id = ready.shift()!;
      order.push(id);
      for (const c of forward(id)) {
        if (!usable(c) || !ids.has(c.toStepId)) continue;
        const left = (waiting.get(c.toStepId) ?? 1) - 1;
        waiting.set(c.toStepId, left);
        if (left === 0) ready.push(c.toStepId);
      }
    }
    return order;
  };

  // The main path: everything reachable without taking a side way.
  const forwardIn = new Set(edges.filter((c) => !back.has(keyOf(c))).map((c) => c.toStepId));
  const mainSet = new Set<string>();
  const stack = steps.filter((s) => !forwardIn.has(s.id)).map((s) => s.id);
  while (stack.length) {
    const id = stack.pop()!;
    if (mainSet.has(id)) continue;
    mainSet.add(id);
    for (const c of forward(id)) if (!side.has(keyOf(c))) stack.push(c.toStepId);
  }
  const mainOrder = flowOrder(mainSet, (c) => !side.has(keyOf(c)));

  // Each side way's own steps, listed under the decision they come from.
  const placed = new Set(mainOrder);
  const list: { id: string; branch: OutlineItem['branch'] }[] = [];
  for (const id of mainOrder) {
    list.push({ id, branch: null });
    for (const c of forward(id)) {
      if (!side.has(keyOf(c)) || placed.has(c.toStepId)) continue;
      const own = new Set<string>();
      const walk = [c.toStepId];
      while (walk.length) {
        const n = walk.pop()!;
        if (own.has(n) || placed.has(n)) continue;
        own.add(n);
        for (const f of forward(n)) walk.push(f.toStepId);
      }
      const label = c.label || `If ${byStep.get(c.toStepId)!.title.toLowerCase()}`;
      for (const n of flowOrder(own, () => true)) {
        list.push({ id: n, branch: { label: label.startsWith('If ') ? label : `If ${label.toLowerCase()}`, decisionId: id } });
        placed.add(n);
      }
    }
  }
  // Anything not connected to the rest still gets listed, at the end.
  for (const s of steps) if (!placed.has(s.id)) list.push({ id: s.id, branch: null });

  const position = new Map(list.map((l, i) => [l.id, i]));
  const mainList = list.filter((l) => !l.branch).map((l) => l.id);

  const items: OutlineItem[] = list.map(({ id, branch }, i) => {
    const step = byStep.get(id)!;
    const closing = outs.get(id)!.find((c) => back.has(keyOf(c)));
    const main = mainOf.get(id);

    let nextId: string | null = null;
    if (main) {
      nextId = main.toStepId;
    } else if (branch) {
      // Down a side way: carry on along it, rejoin the main path, or loop back.
      const fwd = forward(id).sort((a, b) => (position.get(a.toStepId) ?? 0) - (position.get(b.toStepId) ?? 0))[0];
      nextId = fwd?.toStepId ?? closing?.toStepId ?? null;
    } else {
      const at = mainList.indexOf(id);
      nextId = mainList[at + 1] ?? null;
      // The last step on the main path may still loop back.
      if (!nextId && closing) nextId = closing.toStepId;
    }

    const needs = new Map<string, ElementRef>();
    for (const c of ins.get(id)!) {
      for (const p of byStep.get(c.fromStepId)!.produces) needs.set(p.id, p);
    }
    for (const p of step.produces) needs.delete(p.id);

    return {
      step,
      number: i + 1,
      branch,
      nextId,
      outcomes:
        step.stepType === 'Decision' && outs.get(id)!.length > 1
          ? outs.get(id)!.map((c) => ({
              key: keyOf(c),
              label: c.label || c.condition || '',
              targetId: c.toStepId,
              loopsBack: back.has(keyOf(c)),
              main: c === main,
            }))
          : [],
      loopBackId: closing && !main ? closing.toStepId : null,
      needs: [...needs.values()],
    };
  });

  return { items, byId: new Map(items.map((it) => [it.step.id, it])) };
}
