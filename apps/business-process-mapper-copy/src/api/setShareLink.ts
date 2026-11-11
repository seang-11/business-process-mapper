import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { requireEditor } from '../lib/access';
import { zite } from 'zitejs/db';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

/** A long, unguessable token: two random ids joined, 64 characters. */
const newToken = () => `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');

export default createEndpoint({
  authenticated: true,
  description: 'Turn the read-only share link for a process on or off',
  inputSchema: z.object({ processId: z.string(), enabled: z.boolean() }),
  outputSchema: z.object({ token: z.string().nullable() }),
  execute: async ({ input, context }) => {
    await requireEditor(context);
    const [typeRes, process] = await Promise.all([
      zite.elementTypes.findAll({ limit: 500 }),
      zite.elements.findOne({ id: input.processId }),
    ]);
    const processType = typeRes.records.find((t) => t.key === 'process');
    if (!process || !processType || one(process.type) !== processType.id) {
      throw new Error('That process no longer exists.');
    }

    // Turning it on again keeps the same link; turning it off breaks it for good.
    const token = input.enabled ? process.shareToken || newToken() : '';
    if (token !== (process.shareToken ?? '')) {
      await zite.elements.update({ id: process.id, record: { shareToken: token } });
    }
    return { token: token || null };
  },
});
