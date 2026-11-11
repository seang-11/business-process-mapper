import { scrubbed } from '@/lib/scrub';
import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { connectionSchema, loadGraph, stepSchema } from '../lib/processGraph';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

const NOT_AVAILABLE = {
  available: false,
  processName: '',
  description: '',
  versionName: '',
  liveFrom: '',
  steps: [],
  connections: [],
};

/**
 * What the public share page reads. No sign-in is needed, so the only way in is
 * the secret token, and it returns just the live version of that one process:
 * no other processes, no editor list, no tokens.
 */
export default createEndpoint({
  description: 'The live version of one process, read only, for anyone with its share link',
  inputSchema: z.object({ token: z.string() }),
  outputSchema: z.object({
    available: z.boolean(),
    processName: z.string(),
    description: z.string(),
    versionName: z.string(),
    liveFrom: z.string(),
    steps: z.array(stepSchema),
    connections: z.array(connectionSchema),
  }),
  execute: scrubbed(async ({ input }) => {
    const token = input.token.trim();
    // Real tokens are 64 characters. Anything short is never worth a lookup.
    if (token.length < 40) return NOT_AVAILABLE;

    const { records } = await zite.elements.findAll({ filters: { shareToken: token }, limit: 5 });
    const process = records.find((e) => e.shareToken === token);
    if (!process) return NOT_AVAILABLE;

    const versions = (await zite.processVersions.findAll({ limit: 2000 })).records.filter(
      (v) => one(v.process) === process.id,
    );
    const live = versions.find((v) => v.state === 'Current');
    if (!live) return NOT_AVAILABLE;

    const graph = await loadGraph({ versionId: live.id });
    return {
      available: true,
      processName: process.name ?? '',
      description: process.description ?? '',
      versionName: live.name ?? '',
      liveFrom: (live.liveFrom ?? '').slice(0, 10),
      steps: graph.steps,
      connections: graph.connections,
    };
  }),
});
