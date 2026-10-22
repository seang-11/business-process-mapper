import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const one = (v?: string | string[] | null): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

/** Stored on a step that was deliberately left unmatched. */
const NO_MATCH = 'none';
/** Longest copy chain worth following before giving up. */
const MAX_HOPS = 20;

const norm = (t?: string) => (t ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Which step in one version is the same step in the other.
 *
 * A step copied into a new version remembers where it came from, and a match
 * fixed by hand is stored the same way, so first follow those links (through
 * any versions in between). Whatever is left is matched by an identical
 * title, but only where the title is unique on both sides, so a guess never
 * pairs the wrong two.
 */
export default createEndpoint({
  description: 'Match the steps of two versions of a process, for comparing them',
  authenticated: true,
  inputSchema: z.object({ leftVersionId: z.string(), rightVersionId: z.string() }),
  outputSchema: z.object({
    matches: z.array(z.object({ leftId: z.string(), rightId: z.string(), by: z.enum(['link', 'title']) })),
  }),
  execute: async ({ input }) => {
    const { records } = await zite.steps.findAll({ limit: 2000 });
    const byId = new Map(records.map((s) => [s.id, s]));
    const left = records.filter((s) => one(s.version) === input.leftVersionId);
    const right = records.filter((s) => one(s.version) === input.rightVersionId);
    const leftIds = new Set(left.map((s) => s.id));
    const rightIds = new Set(right.map((s) => s.id));

    const matches: { leftId: string; rightId: string; by: 'link' | 'title' }[] = [];
    const usedLeft = new Set<string>();
    const usedRight = new Set<string>();
    const pair = (leftId: string, rightId: string, by: 'link' | 'title') => {
      matches.push({ leftId, rightId, by });
      usedLeft.add(leftId);
      usedRight.add(rightId);
    };

    /** The first step in `target` this one descends from, if any. */
    const ancestorIn = (id: string, target: Set<string>, used: Set<string>) => {
      const seen = new Set<string>([id]);
      let cur = byId.get(id)?.copiedFrom ?? '';
      for (let hop = 0; cur && cur !== NO_MATCH && hop < MAX_HOPS && !seen.has(cur); hop += 1) {
        if (target.has(cur) && !used.has(cur)) return cur;
        seen.add(cur);
        cur = byId.get(cur)?.copiedFrom ?? '';
      }
      return null;
    };

    for (const r of right) {
      const l = ancestorIn(r.id, leftIds, usedLeft);
      if (l) pair(l, r.id, 'link');
    }
    // The other way round, for when the newer version is on the left.
    for (const l of left) {
      if (usedLeft.has(l.id)) continue;
      const r = ancestorIn(l.id, rightIds, usedRight);
      if (r) pair(l.id, r, 'link');
    }

    const optedOut = (s: (typeof records)[number]) => s.copiedFrom === NO_MATCH;
    const unique = (list: typeof records) => {
      const counts = new Map<string, number>();
      for (const s of list) counts.set(norm(s.title), (counts.get(norm(s.title)) ?? 0) + 1);
      return (s: (typeof records)[number]) => counts.get(norm(s.title)) === 1;
    };
    const leftUnique = unique(left);
    const rightUnique = unique(right);
    const freeRight = new Map(
      right
        .filter((r) => !usedRight.has(r.id) && !optedOut(r) && rightUnique(r))
        .map((r) => [norm(r.title), r.id]),
    );
    for (const l of left) {
      if (usedLeft.has(l.id) || optedOut(l) || !leftUnique(l)) continue;
      const r = freeRight.get(norm(l.title));
      if (r && !usedRight.has(r)) pair(l.id, r, 'title');
    }

    return { matches };
  },
});
