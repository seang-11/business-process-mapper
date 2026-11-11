import { scrubbed } from '@/lib/scrub';
import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { requireEditor } from '../lib/access';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'The current read-only share link token for a process, for editors',
  inputSchema: z.object({ processId: z.string() }),
  outputSchema: z.object({ token: z.string().nullable() }),
  execute: scrubbed(async ({ input, context }) => {
    // Only editors ever see a token, so nobody else can rebuild a link.
    await requireEditor(context);
    const process = await zite.elements.findOne({ id: input.processId });
    return { token: process?.shareToken || null };
  }),
});
