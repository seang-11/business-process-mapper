import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { OWNER_EMAIL, requireAdmin } from '../lib/access';

export default createEndpoint({
  authenticated: true,
  description: 'Take away someone\'s edit access',
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ input, context }) => {
    await requireAdmin(context);
    const row = await zite.editors.findOne({ id: input.id });
    if (!row) return { success: true };
    if ((row.email ?? '').trim().toLowerCase() === OWNER_EMAIL) {
      throw new Error('The person who set this up can\'t be removed.');
    }
    await zite.editors.delete({ id: input.id });
    return { success: true };
  },
});
