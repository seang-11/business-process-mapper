import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { ensureCoreTypes } from '../lib/ensureCoreTypes';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

const many = (v?: string | string[]): string[] =>
  Array.isArray(v) ? v : v ? [v] : [];

/** Enough of an element to render it as an icon with a tooltip. */
const participant = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  image: z.string(),
  typeIcon: z.string(),
  color: z.string(),
});

export default createEndpoint({
  authenticated: true,
  description: 'List every process (elements of type Process) with its versions, automation mix, and who and what it runs on',
  inputSchema: z.object({}),
  outputSchema: z.object({
    processes: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        ownerId: z.string().nullable(),
        ownerName: z.string(),
        backupOwnerId: z.string().nullable(),
        backupOwnerName: z.string(),
        currentVersionId: z.string().nullable(),
        versions: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            state: z.string(),
            notes: z.string(),
            stepCount: z.number(),
            lastEdited: z.string(),
            /** The day this version became the way the work is done (YYYY-MM-DD), or empty. */
            liveFrom: z.string(),
            /** The day it was replaced (YYYY-MM-DD), or empty while it is still live. */
            liveTo: z.string(),
          }),
        ),
        stepCount: z.number(),
        humanSteps: z.number(),
        systemSteps: z.number(),
        /** When the current version was last touched. */
        lastEdited: z.string(),
        /** Everyone who performs a step in it. */
        people: z.array(participant),
        /** Every system that performs or is used by a step in it. */
        apps: z.array(participant),
      }),
    ),
  }),
  execute: async () => {
    await ensureCoreTypes();

    const [typeRes, elementRes, versionRes, stepRes] = await Promise.all([
      zite.elementTypes.findAll({ limit: 500 }),
      zite.elements.findAll({ limit: 2000 }),
      zite.processVersions.findAll({ limit: 2000 }),
      zite.steps.findAll({ limit: 2000 }),
    ]);

    const processType = typeRes.records.find((t) => t.key === 'process');
    if (!processType) return { processes: [] };

    const typeById = new Map(typeRes.records.map((t) => [t.id, t]));
    const elementById = new Map(elementRes.records.map((e) => [e.id, e]));

    // Actor class of a step = actor class of the element performing it.
    const actorClassOfStep = (performedBy: string | null): string => {
      if (!performedBy) return 'Unassigned';
      const el = elementById.get(performedBy);
      const t = el ? one(el.type) : null;
      return (t ? typeById.get(t)?.actorClass : undefined) ?? 'Unassigned';
    };

    const stepsByVersion = new Map<string, typeof stepRes.records>();
    for (const s of stepRes.records) {
      const v = one(s.version);
      if (!v) continue;
      const list = stepsByVersion.get(v);
      if (list) list.push(s);
      else stepsByVersion.set(v, [s]);
    }

    const versionsByProcess = new Map<string, typeof versionRes.records>();
    for (const v of versionRes.records) {
      const p = one(v.process);
      if (!p) continue;
      const list = versionsByProcess.get(p);
      if (list) list.push(v);
      else versionsByProcess.set(p, [v]);
    }

    const processes = elementRes.records
      .filter((e) => one(e.type) === processType.id)
      .map((e) => {
        const versions = versionsByProcess.get(e.id) ?? [];
        const current = versions.find((v) => v.state === 'Current') ?? versions[0];
        const currentSteps = current ? stepsByVersion.get(current.id) ?? [] : [];

        let humanSteps = 0;
        let systemSteps = 0;
        // Who and what this process runs on, in first-appearance order.
        const people = new Map<string, z.infer<typeof participant>>();
        const apps = new Map<string, z.infer<typeof participant>>();

        const describe = (id: string): z.infer<typeof participant> | null => {
          const el = elementById.get(id);
          if (!el) return null;
          const t = one(el.type);
          const type = t ? typeById.get(t) : undefined;
          return {
            id: el.id,
            name: el.name ?? '',
            icon: el.icon ?? '',
            image: el.image ?? '',
            typeIcon: type?.icon ?? '',
            color: type?.color ?? '',
          };
        };

        const collect = (id: string | null) => {
          if (!id) return;
          const el = elementById.get(id);
          const t = el ? one(el.type) : null;
          const cls = t ? typeById.get(t)?.actorClass : undefined;
          const bucket = cls === 'Human' ? people : cls === 'System' ? apps : null;
          if (!bucket || bucket.has(id)) return;
          const p = describe(id);
          if (p) bucket.set(id, p);
        };

        for (const s of currentSteps) {
          const performedBy = one(s.performedBy);
          const cls = actorClassOfStep(performedBy);
          if (cls === 'Human') humanSteps += 1;
          else if (cls === 'System') systemSteps += 1;

          collect(performedBy);
          // An app is just as present when a person is the one clicking it.
          for (const id of many(s.uses)) collect(id);
        }

        const ownerId = one(e.owner);
        const backupOwnerId = one(e.backupOwner);
        return {
          id: e.id,
          name: e.name ?? '',
          description: e.description ?? '',
          ownerId,
          ownerName: ownerId ? elementById.get(ownerId)?.name ?? '' : '',
          backupOwnerId,
          backupOwnerName: backupOwnerId ? elementById.get(backupOwnerId)?.name ?? '' : '',
          currentVersionId: current?.id ?? null,
          versions: versions.map((v) => ({
            id: v.id,
            name: v.name ?? '',
            state: v.state ?? '',
            notes: v.notes ?? '',
            stepCount: (stepsByVersion.get(v.id) ?? []).length,
            lastEdited: v.lastEdited ?? '',
            liveFrom: (v.liveFrom ?? '').slice(0, 10),
            liveTo: (v.liveTo ?? '').slice(0, 10),
          })),
          stepCount: currentSteps.length,
          humanSteps,
          systemSteps,
          lastEdited: current?.lastEdited ?? '',
          people: [...people.values()],
          apps: [...apps.values()],
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return { processes };
  },
});
