import { zite } from 'zitejs/db';

export interface EdgeSpec {
  from: string;
  to: string;
  label: string;
  condition: string;
}

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

/** The arrows of one version, as plain from/to/label records. */
export async function readEdges(versionId: string): Promise<EdgeSpec[]> {
  const { records } = await zite.stepConnections.findAll({ limit: 2000 });
  return records
    .filter((c) => one(c.version) === versionId)
    .map((c) => ({
      from: one(c.fromStep) ?? '',
      to: one(c.toStep) ?? '',
      label: c.label ?? '',
      condition: c.condition ?? '',
    }));
}

/**
 * Make a version's arrows exactly match `target`, changing as little as
 * possible. This is how an undo (or a rollback after a failed move) puts a map
 * back: it matches on which steps an arrow joins, never on record ids, so it
 * works however many edits have happened since the snapshot was taken.
 */
export async function syncEdges(versionId: string, target: EdgeSpec[]): Promise<{ changed: number }> {
  const [stepRes, connRes] = await Promise.all([
    zite.steps.findAll({ limit: 2000 }),
    zite.stepConnections.findAll({ limit: 2000 }),
  ]);
  const titleOf = new Map(
    stepRes.records.filter((s) => one(s.version) === versionId).map((s) => [s.id, s.title ?? 'Step']),
  );
  const keyOf = (from: string, to: string) => `${from}->${to}`;
  const wanted = new Map(
    target.filter((e) => titleOf.has(e.from) && titleOf.has(e.to)).map((e) => [keyOf(e.from, e.to), e]),
  );

  let changed = 0;
  const seen = new Set<string>();
  for (const c of connRes.records.filter((r) => one(r.version) === versionId)) {
    const key = keyOf(one(c.fromStep) ?? '', one(c.toStep) ?? '');
    const want = wanted.get(key);
    if (!want || seen.has(key)) {
      await zite.stepConnections.delete({ id: c.id });
      changed += 1;
    } else {
      seen.add(key);
      if ((c.label ?? '') !== want.label || (c.condition ?? '') !== want.condition) {
        await zite.stepConnections.update({ id: c.id, record: { label: want.label, condition: want.condition } });
        changed += 1;
      }
    }
  }
  for (const [key, e] of wanted) {
    if (seen.has(key)) continue;
    await zite.stepConnections.create({
      record: {
        name: `${titleOf.get(e.from)} → ${titleOf.get(e.to)}`,
        fromStep: [e.from],
        toStep: [e.to],
        version: [versionId],
        label: e.label,
        condition: e.condition,
      },
    });
    changed += 1;
  }
  if (changed) {
    await zite.processVersions.update({ id: versionId, record: { lastEdited: new Date().toISOString() } });
  }
  return { changed };
}

/** How many separate pieces the map falls into, counting a step with no arrows as a piece. */
export function pieces(stepIds: string[], edges: { from: string; to: string }[]): number {
  const parent = new Map(stepIds.map((id) => [id, id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const e of edges) {
    if (parent.has(e.from) && parent.has(e.to)) parent.set(find(e.from), find(e.to));
  }
  return new Set(stepIds.map(find)).size;
}
