import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { requireEditor } from '../lib/access';
import { zite } from 'zitejs/db';

export default createEndpoint({
  authenticated: true,
  description: 'Add a department, or change its name, color, lead and description',
  inputSchema: z.object({
    /** The name it has now, when editing one; leave out to add a new department. */
    originalName: z.string().optional(),
    name: z.string().min(1),
    /** A hue from 0 to 359, or null to let the app choose. */
    hue: z.number().int().min(0).max(359).nullable(),
    leadId: z.string().nullable(),
    description: z.string(),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input, context }) => {
    await requireEditor(context);
    const name = input.name.trim();
    const original = (input.originalName ?? '').trim();
    const { records } = await zite.departments.findAll({ limit: 500 });
    const clash = records.find((d) => (d.name ?? '').trim().toLowerCase() === name.toLowerCase() && (d.name ?? '').trim() !== original);
    if (clash) throw new Error(`There's already a department called ${clash.name}.`);

    // Another department already wearing this color gives it up, so no two ever match.
    if (input.hue !== null) {
      for (const d of records) {
        const n = (d.name ?? '').trim();
        if (n !== original && n !== name && d.color === input.hue) {
          await zite.departments.update({ id: d.id, record: { color: null } });
        }
      }
    }

    const record = { name, color: input.hue, lead: input.leadId ? [input.leadId] : [], description: input.description.trim() };
    const existing = original ? records.find((d) => (d.name ?? '').trim() === original) : undefined;
    if (existing) await zite.departments.update({ id: existing.id, record });
    else await zite.departments.bulkCreate({ records: [record], matchOn: ['name'] });

    // Renamed: every process in it moves to the new name.
    if (original && original !== name) {
      const procs = await zite.elements.findAll({ filters: { department: original }, limit: 2000 });
      for (const p of procs.records) await zite.elements.update({ id: p.id, record: { department: name } });
    }
    return { ok: true };
  },
});
