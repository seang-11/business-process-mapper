import type { GetBrainOutputType } from 'zitejs/api';

type Data = GetBrainOutputType;
type Proc = Data['processes'][number];
type Step = Proc['steps'][number];
export type Who = Proc['people'][number];

/**
 * A role is a position anyone can hold, or a team, inside the company. Named
 * individuals and outside parties like clients are left out: people come and
 * go, the role stays, and a client never needs a handover brief.
 */
export const isRole = (w: Who | null | undefined): w is Who =>
  !!w && w.kind === 'person' && w.humanKind !== 'Individual' && w.party !== 'External';

export interface RoleSummary {
  who: Who;
  steps: number;
  processes: number;
  hand: number;
  decisions: number;
  depts: string[];
  apps: Who[];
}

/** Every role that does at least one step, busiest first. */
export function roleSummaries(data: Data): RoleSummary[] {
  const map = new Map<string, { who: Who; steps: number; procs: Set<string>; hand: number; decisions: number; depts: Set<string>; apps: Map<string, Who> }>();
  for (const p of data.processes) {
    for (const s of p.steps) {
      if (!isRole(s.who)) continue;
      let r = map.get(s.who.id);
      if (!r) {
        r = { who: s.who, steps: 0, procs: new Set(), hand: 0, decisions: 0, depts: new Set(), apps: new Map() };
        map.set(s.who.id, r);
      }
      r.steps += 1;
      r.procs.add(p.id);
      if (s.stepType === 'Decision') r.decisions += 1;
      else if (s.stepType !== 'Wait') r.hand += 1;
      if (p.department) r.depts.add(p.department);
      for (const u of s.uses) if (u.kind === 'app') r.apps.set(u.id, u);
    }
  }
  return [...map.values()]
    .map((r) => ({
      who: r.who,
      steps: r.steps,
      processes: r.procs.size,
      hand: r.hand,
      decisions: r.decisions,
      depts: [...r.depts].sort(),
      apps: [...r.apps.values()].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.steps - a.steps || a.who.name.localeCompare(b.who.name));
}

export interface Neighbour {
  /** Who or what did the step before, or does the step after. */
  who: Who | null;
  title: string;
  /** The arrow's label, such as "Yes" on a decision. */
  label: string;
}

export interface BriefStep {
  step: Step;
  /** Where it sits in the whole process. */
  number: number;
  before: Neighbour[];
  after: Neighbour[];
}

export interface BriefProcess {
  p: Proc;
  steps: BriefStep[];
}

export interface Brief {
  who: Who;
  processes: BriefProcess[];
  depts: string[];
  apps: Who[];
  from: { who: Who; count: number }[];
  to: { who: Who; count: number }[];
  steps: number;
  hand: number;
  decisions: number;
}

/** Everything a new person needs to take over one role, across every process it is part of. */
export function buildBrief(data: Data, roleId: string): Brief | null {
  let who: Who | null = null;
  const processes: BriefProcess[] = [];
  const apps = new Map<string, Who>();
  const depts = new Set<string>();
  const from = new Map<string, { who: Who; count: number }>();
  const to = new Map<string, { who: Who; count: number }>();
  let steps = 0;
  let hand = 0;
  let decisions = 0;

  const bump = (m: Map<string, { who: Who; count: number }>, w: Who | null) => {
    if (!w || w.id === roleId) return;
    const cur = m.get(w.id);
    if (cur) cur.count += 1;
    else m.set(w.id, { who: w, count: 1 });
  };

  for (const p of data.processes) {
    const byId = new Map(p.steps.map((s) => [s.id, s]));
    const mine: BriefStep[] = [];
    p.steps.forEach((s, i) => {
      if (s.who?.id !== roleId) return;
      who = s.who;
      const before = p.links
        .filter((l) => l.to === s.id && byId.has(l.from))
        .map((l) => ({ who: byId.get(l.from)!.who, title: byId.get(l.from)!.title, label: l.label }));
      const after = p.links
        .filter((l) => l.from === s.id && byId.has(l.to))
        .map((l) => ({ who: byId.get(l.to)!.who, title: byId.get(l.to)!.title, label: l.label }));
      for (const b of before) bump(from, b.who);
      for (const a of after) bump(to, a.who);
      for (const u of s.uses) if (u.kind === 'app') apps.set(u.id, u);
      for (const c of s.checklist) if (c.app && c.app.kind === 'app') apps.set(c.app.id, c.app);
      steps += 1;
      if (s.stepType === 'Decision') decisions += 1;
      else if (s.stepType !== 'Wait') hand += 1;
      mine.push({ step: s, number: i + 1, before, after });
    });
    if (mine.length) {
      processes.push({ p, steps: mine });
      if (p.department) depts.add(p.department);
    }
  }
  if (!who) return null;
  const byCount = (m: Map<string, { who: Who; count: number }>) =>
    [...m.values()].sort((a, b) => b.count - a.count || a.who.name.localeCompare(b.who.name));
  return {
    who,
    processes,
    depts: [...depts].sort(),
    apps: [...apps.values()].sort((a, b) => a.name.localeCompare(b.name)),
    from: byCount(from),
    to: byCount(to),
    steps,
    hand,
    decisions,
  };
}
