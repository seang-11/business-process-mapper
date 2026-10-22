import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

export default createEndpoint({
  authenticated: true,
  description: 'Delete a step along with any connections touching it, then resync the version step count',
  inputSchema: z.object({ id: z.string(), versionId: z.string() }),
  outputSchema: z.object({ success: z.boolean(), connectionsRemoved: z.number() }),
  execute: async ({ input }) => {
    // An edge pointing at a deleted step would strand the layout, so clear them first.
    const { records: conns } = await zite.stepConnections.findAll({ limit: 2000 });
    const orphaned = conns.filter(
      (c) => one(c.fromStep) === input.id || one(c.toStep) === input.id,
    );
    for (const c of orphaned) {
      await zite.stepConnections.delete({ id: c.id });
    }

    await zite.steps.delete({ id: input.id });

    const { records } = await zite.steps.findAll({ limit: 2000 });
    const count = records.filter((s) => one(s.version) === input.versionId).length;
    await zite.processVersions.update({
      id: input.versionId,
      record: { stepCount: count, lastEdited: new Date().toISOString() },
    });

    return { success: true, connectionsRemoved: orphaned.length };
  },
});
