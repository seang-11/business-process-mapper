import { scrubbed } from '@/lib/scrub';
import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { OWNER_EMAIL, requireAdmin } from '../lib/access';

export default createEndpoint({
  description: 'List the admins, for admins',
  inputSchema: z.object({}),
  outputSchema: z.object({
    people: z.array(
      z.object({
        id: z.string().nullable(),
        email: z.string(),
        name: z.string(),
        access: z.literal('Admin'),
        /** The person who set the app up. Cannot be removed or demoted. */
        owner: z.boolean(),
      }),
    ),
  }),
  execute: scrubbed(async ({ context }) => {
    await requireAdmin(context);
    const { records } = await zite.editors.findAll({ limit: 500 });
    const people = records
      .map((r) => ({
        id: r.id as string | null,
        email: (r.email ?? '').trim().toLowerCase(),
        name: r.name ?? '',
        access: 'Admin' as const,
        owner: (r.email ?? '').trim().toLowerCase() === OWNER_EMAIL,
      }))
      .filter((p) => p.email);

    // The owner is an admin even if the table forgot them.
    if (!people.some((p) => p.owner)) {
      people.unshift({ id: null, email: OWNER_EMAIL, name: '', access: 'Admin', owner: true });
    }
    people.sort((a, b) => Number(b.owner) - Number(a.owner) || a.email.localeCompare(b.email));
    return { people };
  }),
});
