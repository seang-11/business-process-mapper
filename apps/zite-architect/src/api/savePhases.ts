import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const one = (v?: string | string[] | null): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * Replace a process's phases with the list as given: its order is the order on
 * the map. A phase left out is removed, and its steps go back to Unsorted
 * rather than going anywhere a person didn't put them.
 */
export default createEndpoint({
  description: "Save a process's phases in order — rename, reorder, add and remove in one go",
  inputSchema: z.object({
    processId: z.string(),
    phases: z.array(z.object({ id: z.string().optional(), name: z.string().trim().min(1) })),
  }),
  outputSchema: z.object({
    phases: z.array(z.object({ id: z.string(), name: z.string(), sortOrder: z.number() })),
  }),
  execute: async ({ input }) => {
    const { records } = await zite.phases.findAll({ limit: 2000 });
    const existing = records.filter((p) => one(p.process) === input.processId);
    const keep = new Set(input.phases.map((p) => p.id).filter(Boolean) as string[]);

    const removed = existing.filter((p) => !keep.has(p.id));
    if (removed.length) {
      const removedIds = new Set(removed.map((p) => p.id));
      const { records: steps } = await zite.steps.findAll({ limit: 2000 });
      for (const s of steps) {
        const phase = one(s.phase);
        if (phase && removedIds.has(phase)) {
          await zite.steps.update({ id: s.id, record: { phase: [] } });
        }
      }
      for (const p of removed) await zite.phases.delete({ id: p.id });
    }

    const existingIds = new Set(existing.map((p) => p.id));
    const saved: { id: string; name: string; sortOrder: number }[] = [];
    for (const [i, p] of input.phases.entries()) {
      if (p.id && existingIds.has(p.id)) {
        await zite.phases.update({ id: p.id, record: { name: p.name, sortOrder: i } });
        saved.push({ id: p.id, name: p.name, sortOrder: i });
      } else {
        const created = await zite.phases.create({
          record: { name: p.name, process: [input.processId], sortOrder: i, steps: null },
        });
        saved.push({ id: created.id, name: p.name, sortOrder: i });
      }
    }

    return { phases: saved };
  },
});
