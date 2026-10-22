import { zite } from 'zitejs/db';

/**
 * The stages a new process starts with. They're only a starting point: every
 * process owns its own copy and can rename, reorder or remove them.
 */
export const DEFAULT_PHASES = ['Kickoff', 'Setup', 'Delivery', 'Wrap-up'];

export async function createDefaultPhases(processId: string): Promise<void> {
  await zite.phases.bulkCreate({
    records: DEFAULT_PHASES.map((name, i) => ({
      name,
      process: [processId],
      sortOrder: i,
      steps: null,
    })),
  });
}
