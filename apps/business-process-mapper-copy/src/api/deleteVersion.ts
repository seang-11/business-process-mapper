import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { requireEditor } from '../lib/access';
import { zite } from 'zitejs/db';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

export default createEndpoint({
  description: 'Delete a process version along with its steps and connections',
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({
    success: z.boolean(),
    reason: z.string(),
    stepsRemoved: z.number(),
    /** Where to send the viewer next, since the one they were on is gone. */
    remainingVersionId: z.string().nullable(),
  }),
  execute: async ({ input, context }) => {
    await requireEditor(context);
    const target = await zite.processVersions.findOne({ id: input.id });
    if (!target) throw new Error('That version no longer exists.');

    const processId = one(target.process);
    const { records: versions } = await zite.processVersions.findAll({ limit: 2000 });
    const siblings = versions.filter(
      (v) => one(v.process) === processId && v.id !== input.id,
    );

    // A process with no versions has nowhere to keep its steps.
    if (siblings.length === 0) {
      return {
        success: false,
        reason: 'This is the only version. A process needs at least one.',
        stepsRemoved: 0,
        remainingVersionId: null,
      };
    }

    const { records: steps } = await zite.steps.findAll({ limit: 2000 });
    const mine = steps.filter((s) => one(s.version) === input.id);
    const stepIds = new Set(mine.map((s) => s.id));

    const { records: conns } = await zite.stepConnections.findAll({ limit: 2000 });
    for (const c of conns) {
      const from = one(c.fromStep);
      const to = one(c.toStep);
      if (one(c.version) === input.id || (from && stepIds.has(from)) || (to && stepIds.has(to))) {
        await zite.stepConnections.delete({ id: c.id });
      }
    }
    for (const s of mine) await zite.steps.delete({ id: s.id });
    await zite.processVersions.delete({ id: input.id });

    // Prefer the current state as the landing spot, else whatever is left.
    const next =
      siblings.find((v) => v.state === 'Current') ?? siblings[0];

    return {
      success: true,
      reason: '',
      stepsRemoved: mine.length,
      remainingVersionId: next.id,
    };
  },
});
