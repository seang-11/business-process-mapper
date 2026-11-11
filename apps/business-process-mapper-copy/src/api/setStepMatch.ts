import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { requireEditor } from '../lib/access';
import { zite } from 'zitejs/db';

const one = (v?: string | string[] | null): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * Fix a comparison by hand: say which step in the other version this one is,
 * or that it has no match. Stored on the step the same way a copy records
 * where it came from, so the comparison treats it like any other link.
 */
export default createEndpoint({
  description: 'Set or clear which step in another version a step corresponds to',
  authenticated: true,
  inputSchema: z.object({ stepId: z.string(), matchStepId: z.string().nullable() }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input, context }) => {
    await requireEditor(context);
    const step = await zite.steps.findOne({ id: input.stepId });
    if (!step) throw new Error('That step no longer exists.');

    if (input.matchStepId) {
      // One step per version can claim a given match; the others let go.
      const version = one(step.version);
      const { records } = await zite.steps.findAll({ limit: 2000 });
      for (const s of records) {
        if (s.id !== step.id && one(s.version) === version && s.copiedFrom === input.matchStepId) {
          await zite.steps.update({ id: s.id, record: { copiedFrom: '' } });
        }
      }
    }

    await zite.steps.update({
      id: input.stepId,
      record: { copiedFrom: input.matchStepId ?? 'none' },
    });
    return { ok: true };
  },
});
