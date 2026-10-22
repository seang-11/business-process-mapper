import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const one = (v?: string | string[]): string | null => (Array.isArray(v) ? v[0] : v) ?? null;

export default createEndpoint({
  authenticated: true,
  description: 'Make a version the live way the work is done, and retire the one it replaces',
  inputSchema: z.object({
    versionId: z.string(),
    /** The day it went live (YYYY-MM-DD). */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-22'),
  }),
  outputSchema: z.object({ retired: z.number() }),
  execute: async ({ input }) => {
    const target = await zite.processVersions.findOne({ id: input.versionId });
    if (!target) throw new Error('That version no longer exists.');
    const processId = one(target.process);

    // Whatever is live now is replaced as of the same day.
    const { records } = await zite.processVersions.findAll({ limit: 2000 });
    const live = records.filter(
      (v) => v.id !== target.id && v.state === 'Current' && (!processId || one(v.process) === processId),
    );
    for (const v of live) {
      await zite.processVersions.update({
        id: v.id,
        record: { state: 'Archived', liveTo: input.date, lastEdited: new Date().toISOString() },
      });
    }

    await zite.processVersions.update({
      id: target.id,
      record: { state: 'Current', liveFrom: input.date, liveTo: null, lastEdited: new Date().toISOString() },
    });

    return { retired: live.length };
  },
});
