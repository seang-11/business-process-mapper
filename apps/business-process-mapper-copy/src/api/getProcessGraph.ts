import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { connectionSchema, loadGraph, stepSchema } from '../lib/processGraph';

export default createEndpoint({
  authenticated: true,
  description: 'The full graph for one process version — steps, connections, and the elements each step touches',
  inputSchema: z.object({
    versionId: z.string().optional(),
    processId: z.string().optional(),
  }),
  outputSchema: z.object({
    version: z
      .object({
        id: z.string(),
        name: z.string(),
        state: z.string(),
        notes: z.string(),
        processId: z.string().nullable(),
        processName: z.string(),
      })
      .nullable(),
    steps: z.array(stepSchema),
    /** Lane order someone dragged into place, per view, as lane ids. Empty = automatic. */
    laneOrder: z.object({ people: z.array(z.string()), app: z.array(z.string()) }),
    connections: z.array(connectionSchema),
  }),
  execute: async ({ input }) => loadGraph(input),
});
