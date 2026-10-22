import type { ElementRef, ProcessConnection, ProcessStep } from '@/types';

/** One way out of a decision, as the fork scene shows it. */
export interface ForkOption {
  key: string;
  /** The edge's label, or empty when it has none. */
  label: string;
  targetTitle: string;
  /** Leads back round to an earlier step, so it can happen more than once. */
  repeats: boolean;
  /** The way the walkthrough carries on. */
  main: boolean;
}

export type Scene =
  | { kind: 'intro' }
  | {
      kind: 'step';
      step: ProcessStep;
      /** 1-based position among the step scenes. */
      number: number;
      total: number;
      /** The step the work goes to next on the path played, if any. */
      handoffTo: ProcessStep | null;
      /** Filled for a decision: every way out of it. */
      forks: ForkOption[];
      /** The step this one can send work back to, when it closes a loop. */
      loopBack: { title: string; label: string } | null;
    }
  | { kind: 'outro' };

const isApp = (e: ElementRef | null | undefined): e is ElementRef => e?.actorClass === 'System';

/** The apps a step involves: whatever runs it, then whatever it uses. */
export function appsOf(step: ProcessStep): ElementRef[] {
  const all = [...(isApp(step.performedBy) ? [step.performedBy] : []), ...step.uses.filter(isApp)];
  return [...new Map(all.map((e) => [e.id, e])).values()];
}

/**
 * The walkthrough plays one path through the process, start to finish.
 *
 * Arrows that loop back are set aside first, so what's left only runs
 * forwards. At each decision the way with the most process still ahead of it
 * is the main one and the others are left out, along with any step that can
 * only be reached through them; the decision's own scene still shows every
 * option. Everything else plays in flow order, earlier-saved steps first when
 * two could go next, so parallel work still gets its own scenes.
 */
export function buildScenes(steps: ProcessStep[], connections: ProcessConnection[]): Scene[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const seq = new Map(steps.map((s, i) => [s.id, i]));
  const edges = connections.filter((c) => byId.has(c.fromStepId) && byId.has(c.toStepId));
  const outs = new Map<string, ProcessConnection[]>(steps.map((s) => [s.id, []]));
  for (const c of edges) outs.get(c.fromStepId)!.push(c);

  // Back-edges by depth-first search, starting from steps nothing leads into.
  const keyOf = (c: ProcessConnection) => `${c.fromStepId}->${c.toStepId}`;
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

  // How many steps lie ahead of each one, at most.
  const ahead = new Map<string, number>();
  const reach = (id: string): number => {
    const known = ahead.get(id);
    if (known != null) return known;
    const n = 1 + Math.max(0, ...forward(id).map((c) => reach(c.toStepId)));
    ahead.set(id, n);
    return n;
  };

  const mainOf = new Map<string, string>();
  const dropped = new Set<string>();
  for (const s of steps) {
    const ways = forward(s.id);
    if (s.stepType !== 'Decision' || ways.length < 2) continue;
    const main = [...ways].sort(
      (a, b) => reach(b.toStepId) - reach(a.toStepId) || (seq.get(a.toStepId) ?? 0) - (seq.get(b.toStepId) ?? 0),
    )[0];
    mainOf.set(s.id, keyOf(main));
    for (const c of ways) if (c !== main) dropped.add(keyOf(c));
  }

  const kept = edges.filter((c) => !back.has(keyOf(c)) && !dropped.has(keyOf(c)));
  const forwardIn = new Set(edges.filter((c) => !back.has(keyOf(c))).map((c) => c.toStepId));
  const starts = steps.filter((s) => !forwardIn.has(s.id)).map((s) => s.id);

  // What's still reachable once the side branches are gone.
  const keptOut = new Map<string, string[]>(steps.map((s) => [s.id, []]));
  for (const c of kept) keptOut.get(c.fromStepId)!.push(c.toStepId);
  const reachable = new Set<string>();
  const stack = [...starts];
  while (stack.length) {
    const id = stack.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    stack.push(...keptOut.get(id)!);
  }

  // Flow order, earliest-saved first among the steps that are ready.
  const waiting = new Map<string, number>([...reachable].map((id) => [id, 0]));
  for (const c of kept) {
    if (reachable.has(c.fromStepId) && reachable.has(c.toStepId)) {
      waiting.set(c.toStepId, (waiting.get(c.toStepId) ?? 0) + 1);
    }
  }
  const ready = [...reachable].filter((id) => waiting.get(id) === 0);
  const order: string[] = [];
  while (ready.length) {
    ready.sort((a, b) => (seq.get(a) ?? 0) - (seq.get(b) ?? 0));
    const id = ready.shift()!;
    order.push(id);
    for (const next of keptOut.get(id)!) {
      if (!reachable.has(next)) continue;
      const left = (waiting.get(next) ?? 1) - 1;
      waiting.set(next, left);
      if (left === 0) ready.push(next);
    }
  }

  const position = new Map(order.map((id, i) => [id, i]));
  const repeats = (c: ProcessConnection) =>
    back.has(keyOf(c)) || outs.get(c.toStepId)!.some((o) => back.has(keyOf(o)));

  const stepScenes: Scene[] = order.map((id, i) => {
    const step = byId.get(id)!;
    const nextId = [...keptOut.get(id)!]
      .filter((n) => position.has(n))
      .sort((a, b) => position.get(a)! - position.get(b)!)[0];
    const closing = outs.get(id)!.find((c) => back.has(keyOf(c)));
    return {
      kind: 'step',
      step,
      number: i + 1,
      total: order.length,
      handoffTo: nextId ? byId.get(nextId)! : null,
      forks: mainOf.has(id)
        ? outs.get(id)!.map((c) => ({
            key: keyOf(c),
            label: c.label || c.condition || '',
            targetTitle: byId.get(c.toStepId)!.title,
            repeats: repeats(c),
            main: keyOf(c) === mainOf.get(id),
          }))
        : [],
      loopBack:
        closing && !mainOf.has(id)
          ? { title: byId.get(closing.toStepId)!.title, label: closing.label || '' }
          : null,
    };
  });

  return [{ kind: 'intro' }, ...stepScenes, { kind: 'outro' }];
}
