import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { requireEditor } from '../lib/access';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: "Write a department's description in your own words, or clear it to go back to the one written from the map",
  inputSchema: z.object({
    department: z.string().min(1),
    description: z.string(),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input, context }) => {
    await requireEditor(context);
    // One row per department, matched on its name.
    await zite.departments.bulkCreate({
      records: [{ name: input.department.trim(), description: input.description.trim() }],
      matchOn: ['name'],
    });
    return { ok: true };
  },
});
