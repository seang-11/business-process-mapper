import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

export default createEndpoint({
  authenticated: true,
  description: 'Create or update a step, then resync the version step count',
  inputSchema: z.object({
    id: z.string().optional(),
    versionId: z.string(),
    title: z.string().min(1),
    description: z.string().default(''),
    stepType: z.string().default('Task'),
    performedById: z.string().nullable().default(null),
    useIds: z.array(z.string()).default([]),
    produceIds: z.array(z.string()).default([]),
    subProcessId: z.string().nullable().default(null),
    sequence: z.number().default(0),
    checklist: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
    walkthroughLine: z.string().default(''),
  }),
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input }) => {
    // Every step is done by someone or something — a person, a role, a team or
    // a system. On a Wait it is whoever is being waited on. A step with nobody
    // behind it has no lane, and no one to ask about it.
    if (!input.performedById) {
      throw new Error('Every step needs someone or something that performs it.');
    }

    const record = {
      title: input.title,
      description: input.description,
      version: [input.versionId],
      stepType: input.stepType,
      performedBy: input.performedById ? [input.performedById] : [],
      uses: input.useIds,
      produces: input.produceIds,
      subProcess: input.subProcessId ? [input.subProcessId] : [],
      sequence: input.sequence,
      checklist: input.checklist.length ? JSON.stringify(input.checklist) : '',
      walkthroughLine: input.walkthroughLine.trim(),
    };

    let id = input.id;
    if (id) {
      await zite.steps.update({ id, record });
    } else {
      const created = await zite.steps.create({ record });
      id = created.id;
    }

    const { records } = await zite.steps.findAll({ limit: 2000 });
    const count = records.filter((s) => one(s.version) === input.versionId).length;
    await zite.processVersions.update({
      id: input.versionId,
      record: { stepCount: count, lastEdited: new Date().toISOString() },
    });

    return { id };
  },
});
