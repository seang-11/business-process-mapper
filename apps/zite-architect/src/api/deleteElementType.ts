import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;

export default createEndpoint({
  authenticated: true,
  description:
    'Delete a custom element type. Built-ins are never deletable, and a type in use has to be reassigned first.',
  inputSchema: z.object({
    id: z.string(),
    /** Move the elements onto this type instead of blocking. */
    reassignToTypeId: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    reason: z.string(),
    /** Elements still on this type, when that is what blocked the delete. */
    inUseBy: z.array(z.string()),
    reassigned: z.number(),
  }),
  execute: async ({ input }) => {
    const target = await zite.elementTypes.findOne({ id: input.id });
    if (!target) throw new Error('That element type no longer exists.');

    if (target.builtIn) {
      return {
        success: false,
        reason: `${target.name ?? 'This type'} is part of the core set, so it can't be deleted. You can rename it instead.`,
        inUseBy: [],
        reassigned: 0,
      };
    }

    const { records: elements } = await zite.elements.findAll({ limit: 2000 });
    const using = elements.filter((e) => one(e.type) === input.id);

    if (using.length > 0 && !input.reassignToTypeId) {
      return {
        success: false,
        reason: `${using.length} element${using.length === 1 ? '' : 's'} still use this type.`,
        inUseBy: using.map((e) => e.name ?? 'Untitled'),
        reassigned: 0,
      };
    }

    let reassigned = 0;
    if (using.length > 0 && input.reassignToTypeId) {
      const replacement = await zite.elementTypes.findOne({ id: input.reassignToTypeId });
      if (!replacement) throw new Error('The replacement type no longer exists.');
      if (replacement.id === input.id) throw new Error('Pick a different type to move them to.');

      for (const e of using) {
        await zite.elements.update({ id: e.id, record: { type: [input.reassignToTypeId] } });
        reassigned += 1;
      }
    }

    await zite.elementTypes.delete({ id: input.id });
    return { success: true, reason: '', inUseBy: [], reassigned };
  },
});
