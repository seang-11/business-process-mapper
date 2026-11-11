import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { requireEditor } from '../lib/access';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Remove a department; its processes are left with no department',
  inputSchema: z.object({ name: z.string().min(1) }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input, context }) => {
    await requireEditor(context);
    const name = input.name.trim();
    const procs = await zite.elements.findAll({ filters: { department: name }, limit: 2000 });
    for (const p of procs.records) await zite.elements.update({ id: p.id, record: { department: '' } });
    const { records } = await zite.departments.findAll({ limit: 500 });
    for (const d of records) if ((d.name ?? '').trim() === name) await zite.departments.delete({ id: d.id });
    return { ok: true };
  },
});
