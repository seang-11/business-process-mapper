import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { requireEditor } from '../lib/access';
import { zite, type ProcessVersionsRecordInput } from 'zitejs/db';

const day = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Use a date like 2026-10-22');

export default createEndpoint({
  authenticated: true,
  description: 'Rename a process version, or change its state, notes or the dates it was live',
  inputSchema: z.object({
    id: z.string(),
    name: z.string().min(1).optional(),
    state: z.enum(['Current', 'Future', 'Archived']).optional(),
    notes: z.string().optional(),
    /** An empty string clears the date. */
    liveFrom: day.optional(),
    liveTo: day.optional(),
  }),
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input, context }) => {
    await requireEditor(context);
    const existing = await zite.processVersions.findOne({ id: input.id });
    if (!existing) throw new Error('That version no longer exists.');

    const patch: Partial<ProcessVersionsRecordInput> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.state !== undefined) patch.state = input.state;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.liveFrom !== undefined) patch.liveFrom = input.liveFrom || null;
    if (input.liveTo !== undefined) patch.liveTo = input.liveTo || null;

    if (Object.keys(patch).length === 0) return { id: input.id };

    await zite.processVersions.update({ id: input.id, record: patch });
    return { id: input.id };
  },
});
