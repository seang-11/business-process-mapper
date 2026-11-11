import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { requireEditor } from '../lib/access';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: "Set the company's name and website, shown in the sun of the Brain's solar system",
  inputSchema: z.object({ name: z.string(), website: z.string() }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input, context }) => {
    await requireEditor(context);
    // Keep just the address part, so "https://www.acme.com/about" becomes "acme.com".
    const website = input.website
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/.*$/, '')
      .toLowerCase();
    await zite.settings.bulkCreate({
      records: [
        { name: 'companyName', value: input.name.trim() },
        { name: 'companyWebsite', value: website },
      ],
      matchOn: ['name'],
    });
    return { ok: true };
  },
});
