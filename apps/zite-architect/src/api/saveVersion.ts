import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite, type ProcessVersionsRecordInput } from 'zitejs/db';

export default createEndpoint({
  description: 'Rename a process version, or change its state or notes',
  inputSchema: z.object({
    id: z.string(),
    name: z.string().min(1).optional(),
    state: z.enum(['Current', 'Future', 'Archived']).optional(),
    notes: z.string().optional(),
  }),
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input }) => {
    const existing = await zite.processVersions.findOne({ id: input.id });
    if (!existing) throw new Error('That version no longer exists.');

    const patch: Partial<ProcessVersionsRecordInput> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.state !== undefined) patch.state = input.state;
    if (input.notes !== undefined) patch.notes = input.notes;

    if (Object.keys(patch).length === 0) return { id: input.id };

    await zite.processVersions.update({ id: input.id, record: patch });
    return { id: input.id };
  },
});
