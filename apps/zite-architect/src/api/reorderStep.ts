import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { requireEditor } from '../lib/access';
import { applyOps, planReorder, type PlanEdge } from '../lib/planReorder';
import { pieces, syncEdges, type EdgeSpec } from '../lib/edgeSync';
import { zite } from 'zitejs/db';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * Drop a step before or after another. The steps that have to travel with it
 * (a decision's branches, a loop) go too, so no arrow is left half connected.
 * planReorder works out the arrow changes; this checks them and applies them,
 * and puts everything back if anything goes wrong on the way.
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

    const records = connRes.records.filter((c) => one(c.version) === versionId);
    const edges: PlanEdge[] = records.map((c) => ({
      id: c.id,
      from: one(c.fromStep) ?? '',
      to: one(c.toStep) ?? '',
      label: c.label ?? '',
    }));
    const fromOf = new Map(edges.map((e) => [e.id, e.from]));
    const nameOf = (from: string, to: string) => `${titleOf.get(from) ?? 'Step'} → ${titleOf.get(to) ?? 'Step'}`;
    const ids = steps.map((s) => s.id);

    const { ops, moved } = planReorder(edges, ids, stepId, targetId, position);

    // Safety net: work out the arrows as they would be, and refuse any move that
    // would cut the map into pieces or leave a step with no arrows at all.
    const after = applyOps(edges, ops);
    const lonely = (list: PlanEdge[]) => ids.filter((id) => !list.some((e) => e.from === id || e.to === id)).length;
    if (pieces(ids, after) > pieces(ids, edges) || lonely(after) > lonely(edges)) {
      throw new Error('That move would leave part of the flow disconnected, so nothing was changed.');
    }

    // The starting arrows, so a failure halfway puts everything back.
    const snapshot: EdgeSpec[] = records.map((c) => ({
      from: one(c.fromStep) ?? '',
      to: one(c.toStep) ?? '',
      label: c.label ?? '',
      condition: c.condition ?? '',
    }));

    try {
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
    } catch (err) {
      await syncEdges(versionId, snapshot);
      throw err;
    }

    await zite.processVersions.update({ id: versionId, record: { lastEdited: new Date().toISOString() } });
    return { moved: moved.length };
  },
});
