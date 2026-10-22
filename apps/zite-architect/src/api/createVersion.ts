import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;
const many = (v?: string | string[]): string[] =>
  Array.isArray(v) ? v : v ? [v] : [];

export default createEndpoint({
  authenticated: true,
  description: 'Create a process version — empty, or copied from another so a future state can diverge from it',
  inputSchema: z.object({
    /** Which process the version belongs to. Taken from the source when copying. */
    processId: z.string().optional(),
    /** Copy this version's steps and connections. Omit for an empty version. */
    sourceVersionId: z.string().optional(),
    name: z.string().min(1),
    state: z.string().default('Future'),
    notes: z.string().default(''),
  }),
  outputSchema: z.object({ versionId: z.string(), stepsCopied: z.number() }),
  execute: async ({ input }) => {
    const source = input.sourceVersionId
      ? await zite.processVersions.findOne({ id: input.sourceVersionId })
      : null;
    if (input.sourceVersionId && !source) throw new Error('Source version not found.');

    const processId = source ? one(source.process) : input.processId ?? null;
    if (!processId) throw new Error('A version needs a process to belong to.');

    const target = await zite.processVersions.create({
      record: {
        name: input.name,
        process: [processId],
        state: input.state,
        notes: input.notes,
        stepCount: 0,
        lastEdited: new Date().toISOString(),
      },
    });

    const [stepRes, connRes] = await Promise.all([
      zite.steps.findAll({ limit: 2000 }),
      zite.stepConnections.findAll({ limit: 2000 }),
    ]);

    // Empty when nothing is being copied, which leaves the loops below no-ops.
    const sourceSteps = input.sourceVersionId
      ? stepRes.records.filter((s) => one(s.version) === input.sourceVersionId)
      : [];

    // Old step id → new step id, so the copied edges point at the copied steps.
    const idMap = new Map<string, string>();
    for (const s of sourceSteps) {
      const created = await zite.steps.create({
        record: {
          title: s.title ?? '',
          description: s.description ?? '',
          version: [target.id],
          stepType: s.stepType ?? 'Task',
          performedBy: one(s.performedBy) ? [one(s.performedBy) as string] : [],
          uses: many(s.uses),
          produces: many(s.produces),
          subProcess: one(s.subProcess) ? [one(s.subProcess) as string] : [],
          sequence: s.sequence ?? 0,
          checklist: s.checklist ?? '',
        },
      });
      idMap.set(s.id, created.id);
    }

    for (const c of connRes.records) {
      const from = one(c.fromStep);
      const to = one(c.toStep);
      if (!from || !to) continue;
      const newFrom = idMap.get(from);
      const newTo = idMap.get(to);
      if (!newFrom || !newTo) continue;
      await zite.stepConnections.create({
        record: {
          name: c.name ?? '',
          fromStep: [newFrom],
          toStep: [newTo],
          version: [target.id],
          label: c.label ?? '',
          condition: c.condition ?? '',
        },
      });
    }

    await zite.processVersions.update({
      id: target.id,
      record: { stepCount: sourceSteps.length },
    });

    return { versionId: target.id, stepsCopied: sourceSteps.length };
  },
});
