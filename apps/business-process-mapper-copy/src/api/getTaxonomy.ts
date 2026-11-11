import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { ensureCoreTypes } from '../lib/ensureCoreTypes';

// Linked-record fields come back as a string, an array, or undefined.
const one = (v?: string | string[]): string | null =>
  (Array.isArray(v) ? v[0] : v) ?? null;
const many = (v?: string | string[]): string[] =>
  Array.isArray(v) ? v : v ? [v] : [];

const typeSchema = z.object({
  id: z.string(),
  name: z.string(),
  /**
   * Stable machine name for the few types the code must recognise. Never shown,
   * never renamed — logic keys off this, never off the display name, which the
   * user is free to change, nor the record id, which differs per workspace.
   */
  key: z.string(),
  /**
   * For human types: is this an individual, a position someone holds, or a
   * group? Lane grouping reads this instead of naming Person and Role, so a
   * custom type behaves correctly the moment it declares a kind.
   */
  humanKind: z.string(),
  description: z.string(),
  icon: z.string(),
  color: z.string(),
  categories: z.array(z.string()),
  actorClass: z.string(),
  builtIn: z.boolean(),
  sortOrder: z.number(),
});

const elementSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  /** The element's own icon, if someone chose one. */
  icon: z.string(),
  /** An uploaded picture, which beats the icon. */
  image: z.string(),
  typeId: z.string().nullable(),
  typeName: z.string(),
  typeKey: z.string(),
  typeHumanKind: z.string(),
  typeIcon: z.string(),
  typeColor: z.string(),
  categories: z.array(z.string()),
  actorClass: z.string(),
  party: z.string(),
  status: z.string(),
  category: z.string(),
  ownerId: z.string().nullable(),
  ownerName: z.string(),
  /** How many steps touch this element, in any capacity. */
  usageCount: z.number(),
  /** How many other elements name this one as their owner. */
  ownsCount: z.number(),
});

export default createEndpoint({
  description: 'Element types and elements — the taxonomy every picker, list and lane reads from',
  inputSchema: z.object({}),
  outputSchema: z.object({
    types: z.array(typeSchema),
    elements: z.array(elementSchema),
  }),
  execute: async () => {
    await ensureCoreTypes();

    const [typeRes, elementRes, stepRes] = await Promise.all([
      zite.elementTypes.findAll({ limit: 500 }),
      zite.elements.findAll({ limit: 2000 }),
      zite.steps.findAll({ limit: 2000 }),
    ]);

    const typeById = new Map(typeRes.records.map((t) => [t.id, t]));
    const nameById = new Map(elementRes.records.map((e) => [e.id, e.name ?? '']));

    // An element used twice in one step (performed by AND used) counts twice —
    // that is the honest number for "how much work touches this".
    const usage = new Map<string, number>();
    const bump = (id: string | null) => {
      if (!id) return;
      usage.set(id, (usage.get(id) ?? 0) + 1);
    };
    for (const s of stepRes.records) {
      bump(one(s.performedBy));
      for (const id of many(s.uses)) bump(id);
      for (const id of many(s.produces)) bump(id);
      bump(one(s.subProcess));
    }

    const ownsCounts = new Map<string, number>();
    for (const e of elementRes.records) {
      const ownerId = one(e.owner);
      if (ownerId) ownsCounts.set(ownerId, (ownsCounts.get(ownerId) ?? 0) + 1);
    }

    const types = typeRes.records
      .map((t) => ({
        id: t.id,
        name: t.name ?? '',
        key: t.key ?? '',
        humanKind: t.humanKind ?? '',
        description: t.description ?? '',
        icon: t.icon ?? '',
        color: t.color ?? '',
        categories: (t.categories ?? []) as string[],
        actorClass: t.actorClass ?? 'Not an actor',
        builtIn: t.builtIn ?? false,
        sortOrder: t.sortOrder ?? 999,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    const elements = elementRes.records
      .map((e) => {
        const typeId = one(e.type);
        const t = typeId ? typeById.get(typeId) : undefined;
        const ownerId = one(e.owner);
        return {
          id: e.id,
          name: e.name ?? '',
          description: e.description ?? '',
          icon: e.icon ?? '',
          image: e.image ?? '',
          typeId,
          typeName: t?.name ?? '',
          typeKey: t?.key ?? '',
          typeHumanKind: t?.humanKind ?? '',
          typeIcon: t?.icon ?? '',
          typeColor: t?.color ?? '',
          categories: (t?.categories ?? []) as string[],
          actorClass: t?.actorClass ?? 'Not an actor',
          party: e.party ?? '',
          status: e.status ?? '',
          category: e.category ?? '',
          ownerId,
          ownerName: ownerId ? nameById.get(ownerId) ?? '' : '',
          usageCount: usage.get(e.id) ?? 0,
          ownsCount: ownsCounts.get(e.id) ?? 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return { types, elements };
  },
});
