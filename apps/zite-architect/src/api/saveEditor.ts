import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { OWNER_EMAIL, requireAdmin } from '../lib/access';

export default createEndpoint({
  authenticated: true,
  description: 'Add someone as an editor or admin, or change their access',
  inputSchema: z.object({
    email: z.string().email(),
    name: z.string().optional(),
    access: z.enum(['Admin', 'Editor']),
  }),
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input, context }) => {
    await requireAdmin(context);
    const email = input.email.trim().toLowerCase();
    if (email === OWNER_EMAIL && input.access !== 'Admin') {
      throw new Error("The person who set this up is always an admin.");
    }

    const { records } = await zite.editors.findAll({ limit: 500 });
    const existing = records.find((r) => (r.email ?? '').trim().toLowerCase() === email);

    if (existing) {
      await zite.editors.update({
        id: existing.id,
        record: { access: input.access, ...(input.name !== undefined ? { name: input.name } : {}) },
      });
      return { id: existing.id };
    }

    const created = await zite.editors.create({
      record: {
        email,
        name: input.name ?? '',
        access: input.access,
        addedBy: context.user.email ?? '',
      },
    });
    return { id: created.id };
  },
});
