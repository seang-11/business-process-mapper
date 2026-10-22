import { groupOf } from './stepGroup';

export interface PlanEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

export type Op =
  | { kind: 'add'; from: string; to: string; label: string }
  | { kind: 'remove'; id: string }
  | { kind: 'retarget'; id: string; to: string };

/**
 * Works out the arrow changes for dropping a step (and the steps that have to
 * travel with it) before or after another. Nothing is written here: it returns
 * the list of changes, so the same logic can be checked without a database.
 *
 * The group is lifted out and the steps around it joined to each other, then it
 * is slotted in beside the target. Arrows inside the group are never touched.
 */
export function planReorder(
  input: PlanEdge[],
  order: string[],
  stepId: string,
  targetId: string,
  position: 'before' | 'after',
): { ops: Op[]; moved: string[] } {
  if (stepId === targetId) throw new Error('Drop it on a different step.');
  const edges = input.map((e) => ({ ...e }));
  const g = groupOf(stepId, edges, order);
  if (g.error) throw new Error(g.error);
  if (g.members.has(targetId)) {
    throw new Error("That step is part of the group you're moving. Drop it somewhere else.");
  }
  const head = g.head!;
  const inGroup = (id: string) => g.members.has(id);
  const exitTo = g.exits[0]?.to ?? null;
  const exitLabel = g.exits[0]?.label ?? '';

  const outsideOut = (id: string) => edges.filter((e) => e.from === id && !inGroup(e.to));
  if (position === 'after' && outsideOut(targetId).length > 1) {
    throw new Error('That step splits into branches. Drop it before the step you want instead.');
  }
  if (
    (position === 'before' && exitTo === targetId) ||
    (position === 'after' && g.entering.some((e) => e.from === targetId))
  ) {
    throw new Error('It is already there.');
  }

  const ops: Op[] = [];
  const add = (from: string, to: string, label = '') => {
    if (from === to || edges.some((e) => e.from === from && e.to === to)) return;
    const e = { id: `new${ops.length}`, from, to, label };
    edges.push(e);
    ops.push({ kind: 'add', from, to, label });
  };
  const remove = (e: PlanEdge) => {
    edges.splice(edges.indexOf(e), 1);
    ops.push({ kind: 'remove', id: e.id });
  };
  const retarget = (e: PlanEdge, to: string) => {
    e.to = to;
    ops.push({ kind: 'retarget', id: e.id, to });
  };

  // 1. Lift the group out, joining what led into it to what it led on to.
  for (const inc of [...g.entering]) {
    if (exitTo) add(inc.from, exitTo, inc.label || exitLabel);
    remove(inc);
  }

  // 2. Slot it in beside the target.
  const joinTails = (to: string) => {
    if (g.exits.length) for (const ex of g.exits) retarget(ex, to);
    else for (const tail of g.tails) add(tail, to);
  };
  if (position === 'after') {
    const next = outsideOut(targetId).find((e) => !g.exits.includes(e));
    if (next) {
      const m = next.to;
      retarget(next, head);
      joinTails(m);
    } else {
      add(targetId, head);
      for (const ex of g.exits) remove(ex);
    }
  } else {
    // Arrows looping back to the target stay on it; only the way in is rerouted.
    for (const feed of edges.filter((e) => e.to === targetId && !inGroup(e.from) && !g.back.has(e))) retarget(feed, head);
    joinTails(targetId);
  }

  return { ops, moved: [...g.members] };
}

/** The arrows as they would be once the changes are made. Used to preview a move and to check it. */
export function applyOps(input: PlanEdge[], ops: Op[]): PlanEdge[] {
  const edges = input.map((e) => ({ ...e }));
  for (const op of ops) {
    if (op.kind === 'add') edges.push({ id: `new-${edges.length}`, from: op.from, to: op.to, label: op.label });
    else if (op.kind === 'remove') edges.splice(edges.findIndex((e) => e.id === op.id), 1);
    else edges.find((e) => e.id === op.id)!.to = op.to;
  }
  return edges;
}
