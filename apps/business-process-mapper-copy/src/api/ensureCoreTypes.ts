import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { ensureCoreTypes } from '../lib/ensureCoreTypes';

export default createEndpoint({
  description: 'Ensure all core element types exist — creates any that are missing, never overwrites existing ones',
  inputSchema: z.object({}),
  outputSchema: z.object({
    created: z.number(),
    total: z.number(),
  }),
  execute: async () => {
    return ensureCoreTypes();
  },
});
