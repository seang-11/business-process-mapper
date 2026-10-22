import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * Dragging a step into another lane changes only what the lane stands for —
 * who performs it, or which app leads it. Everything else on the step is left
 * alone, which saveStep can't promise since it rewrites the whole record.
 */
export default createEndpoint({
  authenticated: true,
  description: 'Move a step on the map: change who performs it, which app leads it, or its phase',
  inputSchema: z.object({
    id: z.string(),
    versionId: z.string(),
    performedById: z.string().min(1),
    useIds: z.array(z.string()),
    /** The phase it lands in; null is Unsorted, absent leaves it where it was. */
    phaseId: z.string().nullable().optional(),
  }),
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input }) => {
    const step = await zite.steps.findOne({ id: input.id });
    if (!step || one(step.version) !== input.versionId) {
      throw new Error('That step is no longer in this version.');
    }

    await zite.steps.update({
      id: input.id,
      record: {
        performedBy: [input.performedById],
        uses: input.useIds,
        ...(input.phaseId !== undefined ? { phase: input.phaseId ? [input.phaseId] : [] } : {}),
      },
    });
    await zite.processVersions.update({
      id: input.versionId,
      record: { lastEdited: new Date().toISOString() },
    });

    return { id: input.id };
  },
});
