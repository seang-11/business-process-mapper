import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { ensureCoreTypes } from '../lib/ensureCoreTypes';
import { createDefaultPhases } from '../lib/defaultPhases';

export default createEndpoint({
  authenticated: true,
  description: 'Create a process — an element of type Process, plus its first current-state version',
  inputSchema: z.object({
    name: z.string().min(1),
    description: z.string().default(''),
    ownerId: z.string().nullable().default(null),
  }),
  outputSchema: z.object({ processId: z.string(), versionId: z.string() }),
  execute: async ({ input }) => {
    await ensureCoreTypes();

    const { records: types } = await zite.elementTypes.findAll({ limit: 500 });
    const processType = types.find((t) => t.key === 'process');
    if (!processType) {
      throw new Error('Could not find the Process element type after seeding. Please try again.');
    }

    const element = await zite.elements.create({
      record: {
        name: input.name,
        description: input.description,
        type: [processType.id],
        party: 'Internal',
        status: 'Active',
        owner: input.ownerId ? [input.ownerId] : [],
      },
    });

    // Every process starts with one version so steps always have somewhere to live.
    const version = await zite.processVersions.create({
      record: {
        name: 'v1 · Current state',
        process: [element.id],
        state: 'Current',
        notes: '',
        stepCount: 0,
        lastEdited: new Date().toISOString(),
      },
    });

    await createDefaultPhases(element.id);

    return { processId: element.id, versionId: version.id };
  },
});
