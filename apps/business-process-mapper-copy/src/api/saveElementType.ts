import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { requireEditor } from '../lib/access';
import { zite, type ElementTypesRecordInput } from 'zitejs/db';

const CATEGORIES = ['Actor', 'Resource', 'Output', 'Place'] as const;
const ACTOR_CLASSES = ['Human', 'System', 'Not an actor'] as const;
const HUMAN_KINDS = ['Individual', 'Position', 'Group'] as const;

/** Anything a built-in type refuses to change, because logic depends on it. */
const LOCKED = ['key', 'categories', 'actorClass', 'humanKind'] as const;

export default createEndpoint({
  description:
    'Create or update an element type. Built-ins keep their key and capabilities; everything cosmetic stays editable.',
  inputSchema: z.object({
    id: z.string().optional(),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    sortOrder: z.number().optional(),
    categories: z.array(z.enum(CATEGORIES)).optional(),
    actorClass: z.enum(ACTOR_CLASSES).optional(),
    humanKind: z.enum(HUMAN_KINDS).nullable().optional(),
  }),
  outputSchema: z.object({ id: z.string(), locked: z.array(z.string()) }),
  execute: async ({ input, context }) => {
    await requireEditor(context);
    const cosmetic: Partial<ElementTypesRecordInput> = {};
    if (input.name !== undefined) cosmetic.name = input.name;
    if (input.description !== undefined) cosmetic.description = input.description;
    if (input.icon !== undefined) cosmetic.icon = input.icon;
    if (input.color !== undefined) cosmetic.color = input.color;
    if (input.sortOrder !== undefined) cosmetic.sortOrder = input.sortOrder;

    const capability: Partial<ElementTypesRecordInput> = {};
    if (input.categories !== undefined) capability.categories = input.categories;
    if (input.actorClass !== undefined) capability.actorClass = input.actorClass;
    if (input.humanKind !== undefined) capability.humanKind = input.humanKind;

    if (input.id) {
      const existing = await zite.elementTypes.findOne({ id: input.id });
      if (!existing) throw new Error('That element type no longer exists.');

      // A built-in can be renamed, recoloured and reordered freely — only the
      // parts the code reasons about are frozen.
      if (existing.builtIn) {
        const refused = LOCKED.filter(
          (f) => (input as Record<string, unknown>)[f] !== undefined,
        );
        // The cosmetic half still lands; the caller is told what was refused.
        if (Object.keys(cosmetic).length > 0) {
          await zite.elementTypes.update({ id: input.id, record: cosmetic });
        }
        return { id: input.id, locked: refused };
      }

      await zite.elementTypes.update({
        id: input.id,
        record: { ...cosmetic, ...capability },
      });
      return { id: input.id, locked: [] };
    }

    if (!input.name) throw new Error('A new element type needs a name.');

    // Only the seed owns keys — a type someone adds here is never structural.
    const created = await zite.elementTypes.create({
      record: {
        name: input.name,
        description: input.description ?? '',
        icon: input.icon ?? 'Box',
        color: input.color ?? '',
        categories: input.categories ?? [],
        actorClass: input.actorClass ?? 'Not an actor',
        humanKind: input.humanKind ?? null,
        builtIn: false,
        key: '',
        sortOrder: input.sortOrder ?? 500,
      },
    });
    return { id: created.id, locked: [] };
  },
});
