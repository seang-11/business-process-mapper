import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { requireEditor } from '../lib/access';
import { planReorder, type PlanEdge } from '../lib/planReorder';
import { zite } from 'zitejs/db';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * Drop a step before or after another. The steps that have to travel with it
 * (a decision's branches, a loop) go too, so no arrow is left half connected.
 * planReorder works out the arrow changes; this applies them.
 */
export default createEndpoint({
  authenticated: true,
  description: 'Move a step, with the steps tied to it, before or after another step and rewire the arrows',
  inputSchema: z.object({
    versionId: z.string(),
    stepId: z.string(),
    targetId: z.string(),
    position: z.enum(['before', 'after']),
  }),
  outputSchema: z.object({ moved: z.number() }),
  execute: async ({ input, context }) => {
    await requireEditor(context);
    const { versionId, stepId, targetId, position } = input;

    const [stepRes, connRes] = await Promise.all([
      zite.steps.findAll({ limit: 2000 }),
      zite.stepConnections.findAll({ limit: 2000 }),
    ]);
    const steps = stepRes.records
      .filter((s) => one(s.version) === versionId)
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    const titleOf = new Map(steps.map((s) => [s.id, s.title ?? 'Step']));
    if (!titleOf.has(stepId) || !titleOf.has(targetId)) {
      throw new Error('Those steps are no longer in this version.');
    }

    const edges: PlanEdge[] = connRes.records
      .filter((c) => one(c.version) === versionId)
      .map((c) => ({ id: c.id, from: one(c.fromStep) ?? '', to: one(c.toStep) ?? '', label: c.label ?? '' }));
    const fromOf = new Map(edges.map((e) => [e.id, e.from]));
    const nameOf = (from: string, to: string) => `${titleOf.get(from) ?? 'Step'} → ${titleOf.get(to) ?? 'Step'}`;

    const { ops, moved } = planReorder(edges, steps.map((s) => s.id), stepId, targetId, position);

    for (const op of ops) {
      if (op.kind === 'add') {
        await zite.stepConnections.create({
          record: {
            name: nameOf(op.from, op.to),
            fromStep: [op.from],
            toStep: [op.to],
            version: [versionId],
            label: op.label,
            condition: '',
          },
        });
      } else if (op.kind === 'remove') {
        await zite.stepConnections.delete({ id: op.id });
      } else {
        await zite.stepConnections.update({
          id: op.id,
          record: { name: nameOf(fromOf.get(op.id) ?? '', op.to), toStep: [op.to] },
        });
      }
    }

    await zite.processVersions.update({ id: versionId, record: { lastEdited: new Date().toISOString() } });
    return { moved: moved.length };
  },
});
