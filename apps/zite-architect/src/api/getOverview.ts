import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

/** How the steps of one version split by who does the work. */
const mix = z.object({
  versionName: z.string(),
  /** Steps an app does on its own. */
  automated: z.number(),
  /** Choices a person makes: the human review points. */
  review: z.number(),
  /** Everything else a person does by hand. */
  manual: z.number(),
  /** Steps that are only waiting, which are not work. */
  waiting: z.number(),
});

export default createEndpoint({
  authenticated: true,
  description: 'Where the time goes: for every process, how many steps are automated, need a person to decide, or are done by hand',
  inputSchema: z.object({}),
  outputSchema: z.object({
    processes: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        live: z.boolean(),
        current: mix,
        /** The version being prepared, if there is one. */
        future: mix.nullable(),
      }),
    ),
  }),
  execute: async () => {
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
    const actorClassOf = (elementId: string | null) => {
      const el = elementId ? elementById.get(elementId) : undefined;
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

    const mixOf = (version: (typeof versionRes.records)[number]) => {
      const out = { versionName: version.name ?? '', automated: 0, review: 0, manual: 0, waiting: 0 };
      for (const s of stepsByVersion.get(version.id) ?? []) {
        if (s.stepType === 'Wait') out.waiting += 1;
        else if (actorClassOf(one(s.performedBy)) === 'System') out.automated += 1;
        else if (s.stepType === 'Decision') out.review += 1;
        else out.manual += 1;
      }
      return out;
    };

    const processes = elementRes.records
      .filter((e) => one(e.type) === processType.id)
      .map((e) => {
        const versions = versionRes.records.filter((v) => one(v.process) === e.id);
        const live = versions.find((v) => v.state === 'Current');
        const current = live ?? versions.find((v) => v.state !== 'Archived') ?? versions[0];
        const future = versions
          .filter((v) => v.state === 'Future' && v.id !== current?.id && (stepsByVersion.get(v.id) ?? []).length > 0)
          .sort((a, b) => (b.lastEdited ?? '').localeCompare(a.lastEdited ?? ''))[0];
        return {
          id: e.id,
          name: e.name ?? '',
          live: !!live,
          current: current ? mixOf(current) : { versionName: '', automated: 0, review: 0, manual: 0, waiting: 0 },
          future: future ? mixOf(future) : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return { processes };
  },
});
