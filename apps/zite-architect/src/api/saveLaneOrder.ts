import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const one = (v?: string | string[] | null): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * Remember the order lanes were dragged into, for one view of one process.
 * Shared by everyone, so the map looks the same in every meeting. Lanes are
 * named by element id (or a fixed name like "Automated"), so renaming a person
 * keeps their place.
 */
export default createEndpoint({
  description: 'Save the lane order for one view (people or app) of a process',
  authenticated: true,
  inputSchema: z.object({
    processId: z.string(),
    grouping: z.enum(['people', 'app']),
    order: z.array(z.string()),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input }) => {
    const value = JSON.stringify(input.order);
    const field = input.grouping === 'people' ? 'peopleLaneOrder' : 'appLaneOrder';

    const { records } = await zite.mapLayouts.findAll({ limit: 2000 });
    const existing = records.find((r) => one(r.process) === input.processId);
    if (existing) {
      await zite.mapLayouts.update({ id: existing.id, record: { [field]: value } });
    } else {
      const process = await zite.elements.findOne({ id: input.processId });
      await zite.mapLayouts.create({
        record: {
          name: process?.name ?? 'Process',
          process: [input.processId],
          peopleLaneOrder: field === 'peopleLaneOrder' ? value : null,
          appLaneOrder: field === 'appLaneOrder' ? value : null,
        },
      });
    }
    return { ok: true };
  },
});
