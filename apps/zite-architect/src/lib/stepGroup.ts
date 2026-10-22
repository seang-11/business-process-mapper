export interface GroupEdge {
  from: string;
  to: string;
}

export interface StepGroup<E extends GroupEdge> {
  /** The dragged step and every step that has to travel with it. */
  members: Set<string>;
  /** Where the group is entered: the step that arrows from outside point at. */
  head: string | null;
  /** Arrows coming in from outside the group. */
  entering: E[];
  /** Arrows leaving the group. They all lead to the same step. */
  exits: E[];
  /** Steps in the group with nothing after them. */
  tails: string[];
  /** Arrows that loop back to an earlier step. Moving a step never reroutes these. */
  back: Set<E>;
  /** Why this group can't be moved, if it can't. */
  error: string | null;
}

/**
 * The steps that move together when one is dragged. A step on its own moves
 * alone. A decision takes its branches with it, up to where they rejoin. A step
 * inside a loop takes the whole loop. Moving less than that would leave arrows
 * pointing at steps that are no longer next to each other.
 */
export function groupOf<E extends GroupEdge>(startId: string, edges: E[], order: string[]): StepGroup<E> {
  const ids = [...new Set([...order, ...edges.flatMap((e) => [e.from, e.to])])];
  const out = new Map<string, E[]>();
  const inn = new Map<string, E[]>();
  for (const id of ids) {
    out.set(id, []);
    inn.set(id, []);
  }
  for (const e of edges) {
    out.get(e.from)!.push(e);
    inn.get(e.to)!.push(e);
  }

  // Walk the flow from where it starts. An arrow into a step that is still
  // being walked goes backwards: that is a loop's way back.
  const color = new Map<string, 0 | 1 | 2>();
  const disc = new Map<string, number>();
  const back = new Set<E>();
  let t = 0;
  const walk = (root: string) => {
    const stack: { id: string; i: number }[] = [{ id: root, i: 0 }];
    color.set(root, 1);
    disc.set(root, t++);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const es = out.get(top.id)!;
      if (top.i >= es.length) {
        color.set(top.id, 2);
        stack.pop();
        continue;
      }
      const e = es[top.i++];
      const c = color.get(e.to) ?? 0;
      if (c === 1) back.add(e);
      else if (c === 0) {
        color.set(e.to, 1);
        disc.set(e.to, t++);
        stack.push({ id: e.to, i: 0 });
      }
    }
  };
  for (const id of ids) if (!inn.get(id)!.length && !color.has(id)) walk(id);
  for (const id of ids) if (!color.has(id)) walk(id);

  const fwdOut = (id: string) => out.get(id)!.filter((e) => !back.has(e));
  const fwdIn = (id: string) => inn.get(id)!.filter((e) => !back.has(e));
  const reach = (from: string, next: (id: string) => string[]) => {
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) {
      for (const n of next(queue.shift()!)) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    return seen;
  };
  const after = (id: string) => reach(id, (n) => fwdOut(n).map((e) => e.to));
  const before = (id: string) => reach(id, (n) => fwdIn(n).map((e) => e.from));

  const loops = [...back].map((e) => {
    const downstream = after(e.to);
    const upstream = before(e.from);
    const members = new Set([...downstream].filter((n) => upstream.has(n)));
    members.add(e.to);
    members.add(e.from);
    return members;
  });

  const members = new Set([startId]);
  for (let grew = true; grew; ) {
    const size = members.size;
    for (const n of [...members]) {
      const branches = fwdOut(n).map((e) => after(e.to));
      if (branches.length < 2) continue;
      const shared = new Set([...branches[0]].filter((x) => branches.every((b) => b.has(x))));
      for (const b of branches) for (const x of b) if (!shared.has(x)) members.add(x);
    }
    for (const loop of loops) if ([...loop].some((n) => members.has(n))) for (const n of loop) members.add(n);
    grew = members.size > size;
  }

  const entering = edges.filter((e) => !members.has(e.from) && members.has(e.to));
  const exits = edges.filter((e) => members.has(e.from) && !members.has(e.to));
  const heads = [...new Set(entering.map((e) => e.to))];
  const exitTargets = new Set(exits.map((e) => e.to));
  const tails = [...members].filter((n) => out.get(n)!.length === 0);
  let error: string | null = null;
  if (heads.length > 1) error = "These steps are reached from more than one place, so they can't be moved as a group.";
  else if (exitTargets.size > 1) error = "These steps lead on to more than one place, so they can't be moved as a group.";
  const head = heads[0] ?? [...members].sort((a, b) => (disc.get(a) ?? 0) - (disc.get(b) ?? 0))[0] ?? null;

  return { members, head, entering, exits, tails, back, error };
}
