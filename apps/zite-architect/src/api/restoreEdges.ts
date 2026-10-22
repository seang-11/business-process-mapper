import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { requireEditor } from '../lib/access';
import { syncEdges } from '../lib/edgeSync';

export default createEndpoint({
  authenticated: true,
  description: 'Put a version\'s arrows back exactly as a saved snapshot, for undo',
  inputSchema: z.object({
    versionId: z.string(),
    edges: z.array(
      z.object({ from: z.string(), to: z.string(), label: z.string().default(''), condition: z.string().default('') }),
    ),
  }),
  outputSchema: z.object({ changed: z.number() }),
  execute: async ({ input, context }) => {
    await requireEditor(context);
    return syncEdges(input.versionId, input.edges);
  },
});
