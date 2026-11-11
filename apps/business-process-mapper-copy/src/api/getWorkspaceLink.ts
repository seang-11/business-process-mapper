import { scrubbed } from '@/lib/scrub';
import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { ZiteMeta } from 'zitejs/meta';

export default createEndpoint({
  description: "This app's own workspace and app links, so an AI agent can find the right workspace",
  inputSchema: z.object({}),
  outputSchema: z.object({
    workspaceHomeUrl: z.string(),
    editorUrl: z.string(),
    appUrl: z.string(),
  }),
  execute: scrubbed(async () => {
    const ws = await ZiteMeta.getWorkspace();
    return {
      workspaceHomeUrl: ws.workspaceHomeUrl,
      editorUrl: ws.editorUrl,
      appUrl: process.env.ZITE_APP_URL,
    };
  }),
});
