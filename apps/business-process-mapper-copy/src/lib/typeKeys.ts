/**
 * The contract between the code and the Element Types table.
 *
 * Two rules keep custom types first-class:
 *
 *  1. Logic asks what a type CAN DO, not what it IS. `categories` decides which
 *     step slot it fills, `actorClass` whether it reports or is owned, and
 *     `humanKind` whether it is a person, a position or a group. A type someone
 *     invents gets the behaviour the moment it declares the capability.
 *
 *  2. Only where a type is genuinely structural does the code name it — and it
 *     names the KEY, never the display name (users rename) and never the record
 *     id (differs per workspace). Today that list is one entry long.
 */

/** Structural types. Keep this list as short as it possibly can be. */
export const TYPE_KEYS = {
  /** Owns versions and steps, so it is a screen of its own rather than a row. */
  process: 'process',
} as const;

/** Human kinds, as stored on the type. */
export const HUMAN_KIND = {
  individual: 'Individual',
  position: 'Position',
  group: 'Group',
} as const;

export type HumanKind = (typeof HUMAN_KIND)[keyof typeof HUMAN_KIND];

/** Fields a built-in type protects; everything else about it stays editable. */
export const BUILT_IN_LOCKED_FIELDS = [
  'key',
  'categories',
  'actorClass',
  'humanKind',
  'builtIn',
] as const;
