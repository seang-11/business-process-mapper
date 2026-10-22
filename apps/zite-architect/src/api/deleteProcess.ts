import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;
const many = (v?: string | string[]): string[] =>
  Array.isArray(v) ? v : v ? [v] : [];

export default createEndpoint({
  authenticated: true,
  description: 'Delete a process along with all of its versions, steps and connections',
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({
    success: z.boolean(),
    /** What still points at this process, when deletion is refused. */
    blockedBy: z.array(z.string()),
    versionsRemoved: z.number(),
    stepsRemoved: z.number(),
  }),
  execute: async ({ input }) => {
    const target = await zite.elements.findOne({ id: input.id });
    if (!target) throw new Error('That process no longer exists.');

    const [versionRes, stepRes, elementRes] = await Promise.all([
      zite.processVersions.findAll({ limit: 2000 }),
      zite.steps.findAll({ limit: 2000 }),
      zite.elements.findAll({ limit: 2000 }),
    ]);

    const versions = versionRes.records.filter((v) => one(v.process) === input.id);
    const versionIds = new Set(versions.map((v) => v.id));

    // Everything living inside this process — safe to remove with it.
    const ownSteps = stepRes.records.filter((s) => {
      const v = one(s.version);
      return v !== null && versionIds.has(v);
    });
    const ownStepIds = new Set(ownSteps.map((s) => s.id));

    // Anything OUTSIDE the process that points at it would be left dangling,
    // so refuse and name it rather than quietly breaking another diagram.
    const blockedBy: string[] = [];
    for (const s of stepRes.records) {
      if (ownStepIds.has(s.id)) continue;
      const refs =
        one(s.subProcess) === input.id ||
        one(s.performedBy) === input.id ||
        many(s.uses).includes(input.id) ||
        many(s.produces).includes(input.id);
      if (refs) blockedBy.push(`Step: ${s.title ?? 'Untitled'}`);
    }
    for (const e of elementRes.records) {
      if (e.id !== input.id && one(e.owner) === input.id) {
        blockedBy.push(`Owned by it: ${e.name ?? 'Untitled'}`);
      }
    }

    if (blockedBy.length) {
      return { success: false, blockedBy, versionsRemoved: 0, stepsRemoved: 0 };
    }

    const { records: conns } = await zite.stepConnections.findAll({ limit: 2000 });
    for (const c of conns) {
      const from = one(c.fromStep);
      const to = one(c.toStep);
      const v = one(c.version);
      if (
        (v !== null && versionIds.has(v)) ||
        (from && ownStepIds.has(from)) ||
        (to && ownStepIds.has(to))
      ) {
        await zite.stepConnections.delete({ id: c.id });
      }
    }
    for (const s of ownSteps) await zite.steps.delete({ id: s.id });
    for (const v of versions) await zite.processVersions.delete({ id: v.id });
    await zite.elements.delete({ id: input.id });

    return {
      success: true,
      blockedBy: [],
      versionsRemoved: versions.length,
      stepsRemoved: ownSteps.length,
    };
  },
});
