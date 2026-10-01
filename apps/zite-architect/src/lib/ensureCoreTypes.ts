/**
 * Idempotent seed: reads Element Types, creates any core types whose key is
 * missing, and never touches rows that already exist.
 *
 * Importable from any endpoint — call `await ensureCoreTypes()` before reading
 * types so the app self-heals on first load after a workspace duplication.
 */
import { zite } from 'zitejs/db';
import { CORE_TYPES } from './coreTypes';

export async function ensureCoreTypes(): Promise<{ created: number; total: number }> {
  const { records } = await zite.elementTypes.findAll({ limit: 500 });
  const existingKeys = new Set(records.map((r) => r.key).filter(Boolean));

  const missing = CORE_TYPES.filter((ct) => !existingKeys.has(ct.key));

  if (missing.length === 0) {
    return { created: 0, total: CORE_TYPES.length };
  }

  await zite.elementTypes.bulkCreate({
    records: missing.map((ct) => ({
      key: ct.key,
      name: ct.name,
      description: ct.description,
      icon: ct.icon,
      color: ct.color,
      categories: ct.categories,
      actorClass: ct.actorClass,
      humanKind: ct.humanKind,
      builtIn: true,
      sortOrder: ct.sortOrder,
    })),
  });

  return { created: missing.length, total: CORE_TYPES.length };
}
