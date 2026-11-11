import { scrubbed } from '@/lib/scrub';
import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;
const many = (v?: string | string[]): string[] =>
  Array.isArray(v) ? v : v ? [v] : [];

const owned = z.object({
  id: z.string(),
  name: z.string(),
  typeName: z.string(),
  icon: z.string(),
  image: z.string(),
  typeIcon: z.string(),
  color: z.string(),
  /** Human / System / Not an actor — decides whether this is a report or a thing. */
  actorClass: z.string(),
});

const stepRef = z.object({
  id: z.string(),
  title: z.string(),
  versionId: z.string(),
  versionName: z.string(),
  processId: z.string().nullable(),
  processName: z.string(),
  capacity: z.string(),
});

export default createEndpoint({
  description: 'One element with everything it owns and every step it touches — the "what does this role own" view',
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({
    element: z
      .object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        typeId: z.string().nullable(),
        typeName: z.string(),
        icon: z.string(),
        image: z.string(),
        typeIcon: z.string(),
        color: z.string(),
        actorClass: z.string(),
        party: z.string(),
        status: z.string(),
        category: z.string(),
        ownerId: z.string().nullable(),
        ownerName: z.string(),
        effectiveFrom: z.string(),
        effectiveTo: z.string(),
      })
      .nullable(),
    owns: z.array(owned),
    steps: z.array(stepRef),
  }),
  execute: scrubbed(async ({ input }) => {
    const [typeRes, elementRes, stepRes, versionRes] = await Promise.all([
      zite.elementTypes.findAll({ limit: 500 }),
      zite.elements.findAll({ limit: 2000 }),
      zite.steps.findAll({ limit: 2000 }),
      zite.processVersions.findAll({ limit: 2000 }),
    ]);

    const target = elementRes.records.find((e) => e.id === input.id);
    if (!target) return { element: null, owns: [], steps: [] };

    const typeById = new Map(typeRes.records.map((t) => [t.id, t]));
    const elementById = new Map(elementRes.records.map((e) => [e.id, e]));
    const versionById = new Map(versionRes.records.map((v) => [v.id, v]));

    const describe = (e: (typeof elementRes.records)[number]) => {
      const t = one(e.type);
      const type = t ? typeById.get(t) : undefined;
      return {
        id: e.id,
        name: e.name ?? '',
        typeName: type?.name ?? '',
        icon: e.icon ?? '',
        image: e.image ?? '',
        typeIcon: type?.icon ?? '',
        color: type?.color ?? '',
        actorClass: type?.actorClass ?? 'Not an actor',
      };
    };

    const owns = elementRes.records
      .filter((e) => one(e.owner) === input.id)
      .map(describe)
      .sort((a, b) => a.typeName.localeCompare(b.typeName) || a.name.localeCompare(b.name));

    // The same element can appear in one step under more than one capacity.
    const steps: z.infer<typeof stepRef>[] = [];
    for (const s of stepRes.records) {
      const capacities: string[] = [];
      if (one(s.performedBy) === input.id) capacities.push('Performs');
      if (many(s.uses).includes(input.id)) capacities.push('Uses');
      if (many(s.produces).includes(input.id)) capacities.push('Produces');
      if (one(s.subProcess) === input.id) capacities.push('Expands into');
      if (!capacities.length) continue;

      const versionId = one(s.version) ?? '';
      const version = versionId ? versionById.get(versionId) : undefined;
      const processId = version ? one(version.process) : null;
      for (const capacity of capacities) {
        steps.push({
          id: s.id,
          title: s.title ?? '',
          versionId,
          versionName: version?.name ?? '',
          processId,
          processName: processId ? elementById.get(processId)?.name ?? '' : '',
          capacity,
        });
      }
    }
    steps.sort(
      (a, b) => a.processName.localeCompare(b.processName) || a.title.localeCompare(b.title),
    );

    const targetType = one(target.type);
    const type = targetType ? typeById.get(targetType) : undefined;
    const ownerId = one(target.owner);

    return {
      element: {
        id: target.id,
        name: target.name ?? '',
        description: target.description ?? '',
        typeId: targetType,
        typeName: type?.name ?? '',
        icon: target.icon ?? '',
        image: target.image ?? '',
        typeIcon: type?.icon ?? '',
        color: type?.color ?? '',
        actorClass: type?.actorClass ?? 'Not an actor',
        party: target.party ?? '',
        status: target.status ?? '',
        category: target.category ?? '',
        ownerId,
        ownerName: ownerId ? elementById.get(ownerId)?.name ?? '' : '',
        effectiveFrom: target.effectiveFrom ?? '',
        effectiveTo: target.effectiveTo ?? '',
      },
      owns,
      steps,
    };
  }),
});
