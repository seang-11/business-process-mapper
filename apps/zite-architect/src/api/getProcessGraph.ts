import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;
const many = (v?: string | string[]): string[] =>
  Array.isArray(v) ? v : v ? [v] : [];

const NO_ORDER = { people: [] as string[], app: [] as string[] };

/** A stored lane order, or none if it's missing or unreadable. */
const parseOrder = (raw?: string): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const elementRef = z.object({
  id: z.string(),
  name: z.string(),
  typeName: z.string(),
  icon: z.string(),
  image: z.string(),
  typeIcon: z.string(),
  color: z.string(),
  actorClass: z.string(),
  party: z.string(),
});

export default createEndpoint({
  authenticated: true,
  description: 'The full graph for one process version — steps, connections, and the elements each step touches',
  inputSchema: z.object({
    versionId: z.string().optional(),
    processId: z.string().optional(),
  }),
  outputSchema: z.object({
    version: z
      .object({
        id: z.string(),
        name: z.string(),
        state: z.string(),
        notes: z.string(),
        processId: z.string().nullable(),
        processName: z.string(),
      })
      .nullable(),
    steps: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        stepType: z.string(),
        sequence: z.number(),
        performedBy: elementRef.nullable(),
        uses: z.array(elementRef),
        produces: z.array(elementRef),
        subProcessId: z.string().nullable(),
        subProcessName: z.string(),
        checklist: z.array(z.object({ id: z.string(), text: z.string(), appId: z.string().optional() })),
        walkthroughLine: z.string(),
      }),
    ),
    /** Lane order someone dragged into place, per view, as lane ids. Empty = automatic. */
    laneOrder: z.object({ people: z.array(z.string()), app: z.array(z.string()) }),
    connections: z.array(
      z.object({
        id: z.string(),
        fromStepId: z.string(),
        toStepId: z.string(),
        label: z.string(),
        condition: z.string(),
      }),
    ),
  }),
  execute: async ({ input }) => {
    if (!input.versionId && !input.processId) {
      return { version: null, steps: [], connections: [], laneOrder: NO_ORDER };
    }

    const [typeRes, elementRes, versionRes] = await Promise.all([
      zite.elementTypes.findAll({ limit: 500 }),
      zite.elements.findAll({ limit: 2000 }),
      zite.processVersions.findAll({ limit: 2000 }),
    ]);

    let version = input.versionId
      ? versionRes.records.find((v) => v.id === input.versionId)
      : undefined;

    if (!version && input.processId) {
      const forProcess = versionRes.records.filter(
        (v) => one(v.process) === input.processId,
      );
      version = forProcess.find((v) => v.state === 'Current') ?? forProcess[0];
    }

    if (!version) return { version: null, steps: [], connections: [], laneOrder: NO_ORDER };

    const typeById = new Map(typeRes.records.map((t) => [t.id, t]));
    const elementById = new Map(elementRes.records.map((e) => [e.id, e]));

    const refOf = (id: string | null) => {
      if (!id) return null;
      const el = elementById.get(id);
      if (!el) return null;
      const t = one(el.type);
      const type = t ? typeById.get(t) : undefined;
      return {
        id: el.id,
        name: el.name ?? '',
        typeName: type?.name ?? '',
        icon: el.icon ?? '',
        image: el.image ?? '',
        typeIcon: type?.icon ?? '',
        color: type?.color ?? '',
        actorClass: type?.actorClass ?? 'Not an actor',
        party: el.party ?? '',
      };
    };

    const processId = one(version.process);

    const [stepRes, connRes, layoutRes] = await Promise.all([
      zite.steps.findAll({ limit: 2000 }),
      zite.stepConnections.findAll({ limit: 2000 }),
      zite.mapLayouts.findAll({ limit: 2000 }),
    ]);

    const layout = layoutRes.records.find((l) => one(l.process) === processId);
    const laneOrder = {
      people: parseOrder(layout?.peopleLaneOrder),
      app: parseOrder(layout?.appLaneOrder),
    };


    const versionSteps = stepRes.records.filter((s) => one(s.version) === version!.id);
    const stepIds = new Set(versionSteps.map((s) => s.id));

    const steps = versionSteps
      .map((s) => {
        let checklist: { id: string; text: string; appId?: string }[] = [];
        if (s.checklist) {
          try {
            const parsed = JSON.parse(s.checklist);
            if (Array.isArray(parsed)) checklist = parsed;
          } catch {
            checklist = [];
          }
        }
        const subProcessId = one(s.subProcess);
        return {
          id: s.id,
          title: s.title ?? '',
          description: s.description ?? '',
          stepType: s.stepType ?? 'Task',
          sequence: s.sequence ?? 0,
          performedBy: refOf(one(s.performedBy)),
          uses: many(s.uses).map(refOf).filter((r): r is NonNullable<typeof r> => r !== null),
          produces: many(s.produces).map(refOf).filter((r): r is NonNullable<typeof r> => r !== null),
          subProcessId,
          subProcessName: subProcessId ? elementById.get(subProcessId)?.name ?? '' : '',
          checklist,
          walkthroughLine: s.walkthroughLine ?? '',
        };
      })
      .sort((a, b) => a.sequence - b.sequence);

    // Keep only edges whose endpoints are both in this version.
    const connections = connRes.records
      .map((c) => ({
        id: c.id,
        fromStepId: one(c.fromStep) ?? '',
        toStepId: one(c.toStep) ?? '',
        label: c.label ?? '',
        condition: c.condition ?? '',
      }))
      .filter((c) => stepIds.has(c.fromStepId) && stepIds.has(c.toStepId));

    return {
      version: {
        id: version.id,
        name: version.name ?? '',
        state: version.state ?? '',
        notes: version.notes ?? '',
        processId,
        processName: processId ? elementById.get(processId)?.name ?? '' : '',
      },
      steps,
      connections,
      laneOrder,
    };
  },
});
