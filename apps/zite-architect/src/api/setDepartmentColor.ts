import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { requireEditor } from '../lib/access';
import { zite } from 'zitejs/db';

export default createEndpoint({
  authenticated: true,
  description: "Pick a department's color, or clear it to go back to the automatic one",
  inputSchema: z.object({
    department: z.string().min(1),
    /** A hue from 0 to 359, or null for automatic. */
    hue: z.number().int().min(0).max(359).nullable(),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input, context }) => {
    await requireEditor(context);
    const name = input.department.trim();
    // Another department already wearing this color gives it up, so no two ever match.
    if (input.hue !== null) {
      const { records } = await zite.departments.findAll({ limit: 500 });
      for (const d of records) {
        if ((d.name ?? '').trim() !== name && d.color === input.hue) {
          await zite.departments.update({ id: d.id, record: { color: null } });
        }
      }
    }
    await zite.departments.bulkCreate({ records: [{ name, color: input.hue }], matchOn: ['name'] });
    return { ok: true };
  },
});
