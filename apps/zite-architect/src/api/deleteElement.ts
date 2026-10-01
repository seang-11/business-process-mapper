import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;
const many = (v?: string | string[]): string[] =>
  Array.isArray(v) ? v : v ? [v] : [];

export default createEndpoint({
  description: 'Delete an element, refusing when steps or other elements still reference it',
  inputSchema: z.object({ id: z.string(), cascadeProcess: z.boolean().default(false) }),
  outputSchema: z.object({ success: z.boolean(), blockedBy: z.array(z.string()) }),
  execute: async ({ input }) => {
    const [stepRes, elementRes, versionRes] = await Promise.all([
      zite.steps.findAll({ limit: 2000 }),
      zite.elements.findAll({ limit: 2000 }),
      zite.processVersions.findAll({ limit: 2000 }),
    ]);

    const versions = versionRes.records.filter((v) => one(v.process) === input.id);
    const isProcess = versions.length > 0;

    // Deleting a process means deleting its versions, steps and edges too.
    if (isProcess && input.cascadeProcess) {
      const versionIds = new Set(versions.map((v) => v.id));
      const steps = stepRes.records.filter((s) => {
        const v = one(s.version);
        return v !== null && versionIds.has(v);
      });
      const stepIds = new Set(steps.map((s) => s.id));

      const { records: conns } = await zite.stepConnections.findAll({ limit: 2000 });
      for (const c of conns) {
        const from = one(c.fromStep);
        const to = one(c.toStep);
        if ((from && stepIds.has(from)) || (to && stepIds.has(to))) {
          await zite.stepConnections.delete({ id: c.id });
        }
      }
      for (const s of steps) await zite.steps.delete({ id: s.id });
      for (const v of versions) await zite.processVersions.delete({ id: v.id });
      await zite.elements.delete({ id: input.id });
      return { success: true, blockedBy: [] };
    }

    const blockedBy: string[] = [];
    for (const s of stepRes.records) {
      if (
        one(s.performedBy) === input.id ||
        many(s.uses).includes(input.id) ||
        many(s.produces).includes(input.id) ||
        one(s.subProcess) === input.id
      ) {
        blockedBy.push(`Step: ${s.title ?? 'Untitled'}`);
      }
    }
    for (const e of elementRes.records) {
      if (e.id !== input.id && one(e.owner) === input.id) {
        blockedBy.push(`Owned: ${e.name ?? 'Untitled'}`);
      }
    }
    if (isProcess) blockedBy.push('This process still has versions — delete it from the process list.');

    if (blockedBy.length) return { success: false, blockedBy };

    await zite.elements.delete({ id: input.id });
    return { success: true, blockedBy: [] };
  },
});
