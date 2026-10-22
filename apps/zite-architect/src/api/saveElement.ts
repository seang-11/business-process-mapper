import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { requireEditor } from '../lib/access';
import { zite, type ElementsRecordInput } from 'zitejs/db';

export default createEndpoint({
  authenticated: true,
  description: 'Create an element, or patch only the fields the caller actually sent',
  // Every field is optional so an update is a genuine patch: a form that shows
  // five fields can never blank the five it doesn't show. Create validates the
  // two it truly needs below.
  inputSchema: z.object({
    id: z.string().optional(),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    typeId: z.string().optional(),
    party: z.string().nullable().optional(),
    status: z.string().optional(),
    category: z.string().nullable().optional(),
    icon: z.string().optional(),
    image: z.string().optional(),
    ownerId: z.string().nullable().optional(),
    backupOwnerId: z.string().nullable().optional(),
    effectiveFrom: z.string().nullable().optional(),
    effectiveTo: z.string().nullable().optional(),
  }),
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input, context }) => {
    await requireEditor(context);
    if (input.id && (input.ownerId === input.id || input.backupOwnerId === input.id)) {
      throw new Error('An element cannot own itself.');
    }

    if (input.id) {
      const patch: Partial<ElementsRecordInput> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;
      if (input.typeId !== undefined) patch.type = [input.typeId];
      if (input.party !== undefined) patch.party = input.party;
      if (input.status !== undefined) patch.status = input.status;
      if (input.category !== undefined) patch.category = input.category || null;
      if (input.icon !== undefined) patch.icon = input.icon;
      if (input.image !== undefined) patch.image = input.image;
      if (input.ownerId !== undefined) patch.owner = input.ownerId ? [input.ownerId] : [];
      if (input.backupOwnerId !== undefined) patch.backupOwner = input.backupOwnerId ? [input.backupOwnerId] : [];
      if (input.effectiveFrom !== undefined) patch.effectiveFrom = input.effectiveFrom;
      if (input.effectiveTo !== undefined) patch.effectiveTo = input.effectiveTo;

      if (Object.keys(patch).length === 0) return { id: input.id };

      const existing = await zite.elements.findOne({ id: input.id });
      if (!existing) throw new Error('That element no longer exists.');

      await zite.elements.update({ id: input.id, record: patch });
      return { id: input.id };
    }

    if (!input.name) throw new Error('A new element needs a name.');
    if (!input.typeId) throw new Error('A new element needs a type.');

    // Create still writes the full shape, so a new row has no undefined fields.
    const created = await zite.elements.create({
      record: {
        name: input.name,
        description: input.description ?? '',
        type: [input.typeId],
        party: input.party ?? null,
        status: input.status ?? 'Active',
        category: input.category || null,
        icon: input.icon ?? '',
        image: input.image ?? '',
        owner: input.ownerId ? [input.ownerId] : [],
        effectiveFrom: input.effectiveFrom ?? null,
        effectiveTo: input.effectiveTo ?? null,
      },
    });
    return { id: created.id };
  },
});
