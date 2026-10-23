import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

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
  /** A person (or role, or team), an app, or something else such as a document. */
  kind: z.enum(['person', 'app', 'other']),
  typeName: z.string(),
});

/** A step's checklist is stored as JSON text. Anything unreadable is treated as no checklist. */
function parseChecklist(raw?: string | null): { text: string; appId?: string }[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list)
      ? list.filter((c) => c && typeof c.text === 'string' && c.text.trim()).map((c) => ({ text: c.text, appId: c.appId }))
      : [];
  } catch {
    return [];
  }
}

export default createEndpoint({
  authenticated: true,
  description: 'The company brain: every process with its department, owner, people, apps and the other processes it runs',
  inputSchema: z.object({}),
  outputSchema: z.object({
    /** Every department that has a lead set. */
    departments: z.array(z.object({ name: z.string(), lead: participant.nullable() })),
    /** Everyone who could lead a department. */
    people: z.array(participant),
    processes: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        department: z.string(),
        ownerId: z.string().nullable(),
        ownerName: z.string(),
        live: z.boolean(),
        stepCount: z.number(),
        /** Steps an app does on its own, steps a person decides, and steps done by hand. Waiting steps are not counted. */
        automated: z.number(),
        review: z.number(),
        manual: z.number(),
        people: z.array(participant),
        apps: z.array(participant),
        /** The other processes this one runs, through a sub-process step. */
        runs: z.array(z.object({ processId: z.string(), stepTitle: z.string() })),
        /** Every step in order, for when you zoom in close enough to read them. */
        steps: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            stepType: z.string(),
            /** An app does it on its own. */
            automated: z.boolean(),
            who: participant.nullable(),
            /** Everything the step uses, so a spotlight can find the steps an app is part of. */
            useIds: z.array(z.string()),
            /** The same things, ready to draw, for the hover panel. */
            uses: z.array(participant),
            produces: z.array(z.string()),
            description: z.string(),
            checklist: z.array(z.object({ text: z.string(), app: participant.nullable() })),
            /** The process this step runs, when it is a sub-process step. */
            subProcessId: z.string().nullable(),
          }),
        ),
        /** The arrows between those steps, so the board can lay the process out left to right. */
        links: z.array(z.object({ from: z.string(), to: z.string(), label: z.string() })),
      }),
    ),
  }),
  execute: async () => {
    const [typeRes, elementRes, versionRes, stepRes, connRes, deptRes] = await Promise.all([
      zite.elementTypes.findAll({ limit: 500 }),
      zite.elements.findAll({ limit: 2000 }),
      zite.processVersions.findAll({ limit: 2000 }),
      zite.steps.findAll({ limit: 2000 }),
      zite.stepConnections.findAll({ limit: 2000 }),
      zite.departments.findAll({ limit: 500 }),
    ]);

    const processType = typeRes.records.find((t) => t.key === 'process');
    if (!processType) return { departments: [], people: [], processes: [] };
    const typeById = new Map(typeRes.records.map((t) => [t.id, t]));
    const elementById = new Map(elementRes.records.map((e) => [e.id, e]));
    const processIds = new Set(elementRes.records.filter((e) => one(e.type) === processType.id).map((e) => e.id));

    const classOf = (id: string | null) => {
      const el = id ? elementById.get(id) : undefined;
      const t = el ? one(el.type) : null;
      return (t ? typeById.get(t)?.actorClass : undefined) ?? 'Unassigned';
    };
    const describe = (id: string): z.infer<typeof participant> | null => {
      const el = elementById.get(id);
      if (!el) return null;
      const t = one(el.type);
      const type = t ? typeById.get(t) : undefined;
      return {
        id,
        name: el.name ?? '',
        icon: el.icon ?? '',
        image: el.image ?? '',
        typeIcon: type?.icon ?? '',
        color: type?.color ?? '',
        kind: (type?.actorClass === 'Human' ? 'person' : type?.actorClass === 'System' ? 'app' : 'other') as
          | 'person'
          | 'app'
          | 'other',
        typeName: type?.name ?? '',
      };
    };

    const processes = elementRes.records
      .filter((e) => processIds.has(e.id))
      .map((p) => {
        const versions = versionRes.records.filter((v) => one(v.process) === p.id);
        const live = versions.find((v) => v.state === 'Current');
        const version =
          live ??
          versions
            .filter((v) => v.state !== 'Archived')
            .sort((a, b) => (b.lastEdited ?? '').localeCompare(a.lastEdited ?? ''))[0];
        const steps = version
          ? stepRes.records
              .filter((s) => one(s.version) === version.id)
              .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
          : [];

        let automated = 0;
        let review = 0;
        let manual = 0;
        const people = new Map<string, z.infer<typeof participant>>();
        const apps = new Map<string, z.infer<typeof participant>>();
        const runs: { processId: string; stepTitle: string }[] = [];

        const note = (id: string | null) => {
          if (!id) return;
          const cls = classOf(id);
          const bucket = cls === 'Human' ? people : cls === 'System' ? apps : null;
          if (!bucket || bucket.has(id)) return;
          const d = describe(id);
          if (d) bucket.set(id, d);
        };

        for (const s of steps) {
          const performer = one(s.performedBy);
          if (s.stepType !== 'Wait') {
            if (classOf(performer) === 'System') automated += 1;
            else if (s.stepType === 'Decision') review += 1;
            else manual += 1;
          }
          note(performer);
          for (const u of Array.isArray(s.uses) ? s.uses : s.uses ? [s.uses] : []) note(u);
          const sub = one(s.subProcess);
          if (sub && processIds.has(sub) && sub !== p.id) runs.push({ processId: sub, stepTitle: s.title ?? '' });
        }

        const ownerId = one(p.owner);
        return {
          id: p.id,
          name: p.name ?? '',
          description: p.description ?? '',
          department: (p.department ?? '').trim(),
          ownerId,
          ownerName: ownerId ? elementById.get(ownerId)?.name ?? '' : '',
          live: !!live,
          stepCount: steps.length,
          automated,
          review,
          manual,
          people: [...people.values()],
          apps: [...apps.values()],
          runs,
          links: version
            ? connRes.records
                .filter((c) => one(c.version) === version.id)
                .map((c) => ({ from: one(c.fromStep) ?? '', to: one(c.toStep) ?? '', label: c.label ?? '' }))
            : [],
          steps: steps.map((s) => {
            const performer = one(s.performedBy);
            return {
              id: s.id,
              title: s.title ?? '',
              stepType: s.stepType ?? 'Task',
              automated: classOf(performer) === 'System',
              who: performer ? describe(performer) : null,
              useIds: Array.isArray(s.uses) ? s.uses : s.uses ? [s.uses] : [],
              uses: (Array.isArray(s.uses) ? s.uses : s.uses ? [s.uses] : [])
                .map((id) => describe(id))
                .filter((x): x is z.infer<typeof participant> => x !== null),
              produces: (Array.isArray(s.produces) ? s.produces : s.produces ? [s.produces] : [])
                .map((id) => elementById.get(id)?.name ?? '')
                .filter(Boolean),
              description: s.description ?? '',
              checklist: parseChecklist(s.checklist).map((c) => ({
                text: c.text,
                app: c.appId ? describe(c.appId) : null,
              })),
              subProcessId: (() => {
                const sub = one(s.subProcess);
                return sub && processIds.has(sub) && sub !== p.id ? sub : null;
              })(),
            };
          }),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const departments = deptRes.records
      .map((d) => {
        const leadId = one(d.lead);
        return { name: (d.name ?? '').trim(), lead: leadId ? describe(leadId) : null };
      })
      .filter((d) => d.name);
    const people = elementRes.records
      .filter((e) => classOf(e.id) === 'Human')
      .map((e) => describe(e.id)!)
      .sort((a, b) => a.name.localeCompare(b.name));

    return { departments, people, processes };
  },
});
