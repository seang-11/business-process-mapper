import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { groupOf } from '../lib/stepGroup';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

/** Enough of an element to draw its icon and name. */
const participant = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  image: z.string(),
  typeIcon: z.string(),
  color: z.string(),
});

const KINDS = ['people', 'toApp', 'fromApp', 'appToApp'] as const;
type Kind = (typeof KINDS)[number];

export default createEndpoint({
  authenticated: true,
  description: 'Handoffs: for every process, where work passes from one person or app to another',
  inputSchema: z.object({}),
  outputSchema: z.object({
    processes: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        live: z.boolean(),
        stepCount: z.number(),
        /** Every handoff on the way through. Loops back to an earlier step are not counted here. */
        handoffs: z.number(),
        /** Person to person. The risky ones: work can wait, or be dropped, between two people. */
        personToPerson: z.number(),
        /** Any handoff with an app on at least one side. */
        withApps: z.number(),
        /** Arrows that return to an earlier step (rework). Counted apart from handoffs. */
        loopBacks: z.number(),
        /** The most handoffs work passes through on any one path, start to finish. */
        longestChain: z.number(),
        /**
         * Who holds the work from start to finish along the busiest path, in order.
         * Each entry says whether the next one is a different person (the riskiest kind of handoff).
         */
        relay: z.array(z.object({ who: participant, nextIsPerson: z.boolean() })),
        pairs: z.array(
          z.object({
            from: participant,
            to: participant,
            count: z.number(),
            kind: z.enum(KINDS),
          }),
        ),
      }),
    ),
  }),
  execute: async () => {
    const [typeRes, elementRes, versionRes, stepRes, connRes] = await Promise.all([
      zite.elementTypes.findAll({ limit: 500 }),
      zite.elements.findAll({ limit: 2000 }),
      zite.processVersions.findAll({ limit: 2000 }),
      zite.steps.findAll({ limit: 2000 }),
      zite.stepConnections.findAll({ limit: 2000 }),
    ]);

    const processType = typeRes.records.find((t) => t.key === 'process');
    if (!processType) return { processes: [] };
    const typeById = new Map(typeRes.records.map((t) => [t.id, t]));
    const elementById = new Map(elementRes.records.map((e) => [e.id, e]));

    const actorClassOf = (id: string) => {
      const el = elementById.get(id);
      const t = el ? one(el.type) : null;
      return (t ? typeById.get(t)?.actorClass : undefined) ?? 'Unassigned';
    };
    const describe = (id: string): z.infer<typeof participant> => {
      const el = elementById.get(id);
      const t = el ? one(el.type) : null;
      const type = t ? typeById.get(t) : undefined;
      return {
        id,
        name: el?.name ?? '',
        icon: el?.icon ?? '',
        image: el?.image ?? '',
        typeIcon: type?.icon ?? '',
        color: type?.color ?? '',
      };
    };

    const processes = elementRes.records
      .filter((e) => one(e.type) === processType.id)
      .map((p) => {
        const versions = versionRes.records.filter((v) => one(v.process) === p.id);
        const live = versions.find((v) => v.state === 'Current');
        const version =
          live ??
          versions
            .filter((v) => v.state !== 'Archived')
            .sort((a, b) => (b.lastEdited ?? '').localeCompare(a.lastEdited ?? ''))[0];

        const steps = version ? stepRes.records.filter((s) => one(s.version) === version.id) : [];
        const performerOf = new Map(steps.map((s) => [s.id, one(s.performedBy)]));
        const edges = version
          ? connRes.records
              .filter((c) => one(c.version) === version.id)
              .map((c) => ({ from: one(c.fromStep) ?? '', to: one(c.toStep) ?? '' }))
              .filter((e) => performerOf.has(e.from) && performerOf.has(e.to))
          : [];

        // Arrows that go back to an earlier step are rework, not work moving forward.
        const back = steps.length
          ? groupOf(steps[0].id, edges, steps.map((s) => s.id)).back
          : new Set<(typeof edges)[number]>();

        const pairs = new Map<string, { from: string; to: string; count: number; kind: Kind }>();
        let handoffs = 0;
        let personToPerson = 0;
        let withApps = 0;
        let loopBacks = 0;
        // Handoff weight of each forward arrow, for finding the longest chain.
        const weight = new Map<(typeof edges)[number], number>();

        for (const e of edges) {
          const a = performerOf.get(e.from);
          const b = performerOf.get(e.to);
          // Steps nobody performs, or the same performer twice in a row, are not a handoff.
          if (!a || !b || a === b) continue;
          if (back.has(e)) {
            loopBacks += 1;
            continue;
          }
          const ca = actorClassOf(a) === 'System';
          const cb = actorClassOf(b) === 'System';
          const kind: Kind = !ca && !cb ? 'people' : !ca && cb ? 'toApp' : ca && !cb ? 'fromApp' : 'appToApp';
          handoffs += 1;
          if (kind === 'people') personToPerson += 1;
          else withApps += 1;
          weight.set(e, 1);
          const key = `${a}|${b}`;
          const cur = pairs.get(key);
          if (cur) cur.count += 1;
          else pairs.set(key, { from: a, to: b, count: 1, kind });
        }

        // The most handoffs on any one path: walk the forward arrows, which never loop.
        const forwardOut = new Map<string, (typeof edges)[number][]>();
        for (const e of edges) {
          if (back.has(e)) continue;
          const list = forwardOut.get(e.from);
          if (list) list.push(e);
          else forwardOut.set(e.from, [e]);
        }
        const memo = new Map<string, number>();
        const longestFrom = (id: string): number => {
          const known = memo.get(id);
          if (known !== undefined) return known;
          memo.set(id, 0);
          let best = 0;
          for (const e of forwardOut.get(id) ?? []) best = Math.max(best, (weight.get(e) ?? 0) + longestFrom(e.to));
          memo.set(id, best);
          return best;
        };
        const longestChain = steps.reduce((max, s) => Math.max(max, longestFrom(s.id)), 0);

        // The relay: follow the path with the most handoffs, noting who holds the work at each point.
        const hasForwardIn = new Set(edges.filter((e) => !back.has(e)).map((e) => e.to));
        const sources = steps.filter((s) => !hasForwardIn.has(s.id));
        const startStep = [...(sources.length ? sources : steps)].sort((x, y) => longestFrom(y.id) - longestFrom(x.id))[0];
        const relay: { who: z.infer<typeof participant>; nextIsPerson: boolean }[] = [];
        const holders: string[] = [];
        if (startStep) {
          let cur = startStep.id;
          const seen = new Set<string>();
          while (!seen.has(cur)) {
            seen.add(cur);
            const who = performerOf.get(cur);
            if (who && holders[holders.length - 1] !== who) holders.push(who);
            const outs = forwardOut.get(cur) ?? [];
            if (outs.length === 0) break;
            outs.sort((x, y) => (weight.get(y) ?? 0) + longestFrom(y.to) - ((weight.get(x) ?? 0) + longestFrom(x.to)));
            cur = outs[0].to;
          }
        }
        holders.forEach((id, i) => {
          const next = holders[i + 1];
          relay.push({ who: describe(id), nextIsPerson: !!next && actorClassOf(id) !== 'System' && actorClassOf(next) !== 'System' });
        });

        return {
          id: p.id,
          name: p.name ?? '',
          live: !!live,
          stepCount: steps.length,
          handoffs,
          personToPerson,
          withApps,
          loopBacks,
          longestChain,
          relay,
          pairs: [...pairs.values()]
            .sort((x, y) => KINDS.indexOf(x.kind) - KINDS.indexOf(y.kind) || y.count - x.count)
            .map((x) => ({ from: describe(x.from), to: describe(x.to), count: x.count, kind: x.kind })),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return { processes };
  },
});
