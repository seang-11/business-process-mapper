import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { requireEditor } from '../lib/access';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: "Pick the Brain heat map's color scale for everyone",
  inputSchema: z.object({ palette: z.string().min(1) }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input, context }) => {
    await requireEditor(context);
    await zite.settings.bulkCreate({ records: [{ name: 'heatColor', value: input.palette }], matchOn: ['name'] });
    return { ok: true };
  },
});
