import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { requireEditor } from '../lib/access';
import { zite } from 'zitejs/db';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

interface Edge {
  id: string;
  from: string;
  to: string;
  label: string;
}

/**
 * Drag a step to sit just before or just after another. The step is lifted out
 * of the chain with its neighbours joined to each other, then slotted in beside
 * the target, so every step stays connected and the flow reads the same way.
 * Steps that split into branches are left alone: moving one would change what
 * the choices lead to.
 */
export default createEndpoint({
  authenticated: true,
  description: 'Move a step before or after another step and rewire the arrows around it',
  inputSchema: z.object({
    versionId: z.string(),
    stepId: z.string(),
    targetId: z.string(),
    position: z.enum(['before', 'after']),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input, context }) => {
    await requireEditor(context);
    const { versionId, stepId: X, targetId: T, position } = input;
    if (X === T) throw new Error('Drop it on a different step.');

    const [stepRes, connRes] = await Promise.all([
      zite.steps.findAll({ limit: 2000 }),
      zite.stepConnections.findAll({ limit: 2000 }),
    ]);
    const titleOf = new Map(stepRes.records.map((s) => [s.id, s.title ?? 'Step']));
    const inVersion = (id: string) =>
      stepRes.records.some((s) => s.id === id && one(s.version) === versionId);
    if (!inVersion(X) || !inVersion(T)) throw new Error('Those steps are no longer in this version.');

    let edges: Edge[] = connRes.records
      .filter((c) => one(c.version) === versionId)
      .map((c) => ({
        id: c.id,
        from: one(c.fromStep) ?? '',
        to: one(c.toStep) ?? '',
        label: c.label ?? '',
      }));

    const nameOf = (from: string, to: string) => `${titleOf.get(from) ?? 'Step'} → ${titleOf.get(to) ?? 'Step'}`;
    const has = (from: string, to: string) => edges.some((e) => e.from === from && e.to === to);
    const addEdge = async (from: string, to: string, label = '') => {
      if (from === to || has(from, to)) return;
      const created = await zite.stepConnections.create({
        record: { name: nameOf(from, to), fromStep: [from], toStep: [to], version: [versionId], label, condition: '' },
      });
      edges.push({ id: created.id, from, to, label });
    };
    const removeEdge = async (edge: Edge) => {
      await zite.stepConnections.delete({ id: edge.id });
      edges = edges.filter((e) => e.id !== edge.id);
    };
    const retarget = async (edge: Edge, to: string) => {
      await zite.stepConnections.update({
        id: edge.id,
        record: { name: nameOf(edge.from, to), toStep: [to] },
      });
      edge.to = to;
    };

    const outOf = (id: string) => edges.filter((e) => e.from === id);
    const into = (id: string) => edges.filter((e) => e.to === id);

    if (outOf(X).length > 1) {
      throw new Error("This step splits into branches, so it can't be moved this way.");
    }
    if (position === 'after' && outOf(T).filter((e) => e.to !== X).length > 1) {
      throw new Error("That step splits into branches. Drop it before the step you want instead.");
    }

    // 1. Lift X out, joining whatever led into it to whatever it led to.
    const out = outOf(X)[0];
    const incoming = [...into(X)];
    for (const inc of incoming) {
      if (out) await addEdge(inc.from, out.to, inc.label || out.label);
      await removeEdge(inc);
    }
    if (out) await removeEdge(out);

    // 2. Slot X in beside T.
    if (position === 'after') {
      const next = outOf(T)[0];
      if (next) {
        const m = next.to;
        await retarget(next, X);
        await addEdge(X, m);
      } else {
        await addEdge(T, X);
      }
    } else {
      const feeding = [...into(T)];
      for (const e of feeding) await retarget(e, X);
      await addEdge(X, T);
    }

    await zite.processVersions.update({
      id: versionId,
      record: { lastEdited: new Date().toISOString() },
    });
    return { ok: true };
  },
});
