import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { requireEditor } from '../lib/access';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Set or clear the person who leads a department',
  inputSchema: z.object({
    department: z.string().min(1),
    leadId: z.string().nullable(),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input, context }) => {
    await requireEditor(context);
    const name = input.department.trim();
    // One row per department, matched on its name.
    await zite.departments.bulkCreate({
      records: [{ name, lead: input.leadId ? [input.leadId] : [] }],
      matchOn: ['name'],
    });
    return { ok: true };
  },
});
