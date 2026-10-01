import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Create or update a connection between two steps',
  inputSchema: z.object({
    id: z.string().optional(),
    versionId: z.string(),
    fromStepId: z.string(),
    toStepId: z.string(),
    label: z.string().default(''),
    condition: z.string().default(''),
  }),
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input }) => {
    if (input.fromStepId === input.toStepId) {
      throw new Error('A step cannot connect to itself.');
    }

    const [from, to] = await Promise.all([
      zite.steps.findOne({ id: input.fromStepId }),
      zite.steps.findOne({ id: input.toStepId }),
    ]);
    if (!from || !to) throw new Error('Both steps must exist before connecting them.');

    const record = {
      name: `${from.title ?? 'Step'} → ${to.title ?? 'Step'}`,
      fromStep: [input.fromStepId],
      toStep: [input.toStepId],
      version: [input.versionId],
      label: input.label,
      condition: input.condition,
    };

    let id = input.id;
    if (id) {
      await zite.stepConnections.update({ id, record });
    } else {
      const created = await zite.stepConnections.create({ record });
      id = created.id;
    }

    await zite.processVersions.update({
      id: input.versionId,
      record: { lastEdited: new Date().toISOString() },
    });

    return { id };
  },
});
