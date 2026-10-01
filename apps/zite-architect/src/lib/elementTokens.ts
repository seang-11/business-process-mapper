/**
 * The single colour scheme for the small stateful values — party and status.
 * Every list cell, dropdown and header badge reads from here, so a colour is
 * changed in one place and means the same thing everywhere.
 *
 * Amber for External was already the convention in the elements list; the rest
 * follows the app's existing language, where emerald means live and running.
 */
export interface Token {
  label: string;
  /** Border + text classes for a bordered pill. */
  badge: string;
  /** Background class for the small dot used inside dropdowns. */
  dot: string;
}

const NEUTRAL: Omit<Token, 'label'> = {
  badge: 'border-border text-muted-foreground',
  dot: 'bg-muted-foreground/40',
};

export const PARTY_TOKENS: Record<string, Token> = {
  Internal: {
    label: 'Internal',
    badge: 'border-border text-muted-foreground',
    dot: 'bg-muted-foreground/50',
  },
  External: {
    label: 'External',
    badge: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
};

export const STATUS_TOKENS: Record<string, Token> = {
  Active: {
    label: 'Active',
    badge: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  Planned: {
    label: 'Planned',
    badge: 'border-sky-500/40 text-sky-600 dark:text-sky-400',
    dot: 'bg-sky-500',
  },
  Retired: {
    label: 'Retired',
    badge: 'border-border text-muted-foreground line-through decoration-muted-foreground/40',
    dot: 'bg-muted-foreground/40',
  },
};

/**
 * One stored field (Elements.owner) covers two readings: a thing has an owner,
 * a person has a manager. "Owned by" is the wrong word for a person, so the
 * label follows what is being owned rather than the field.
 *
 * Mixed lists can't pick a side, so they use the direction-agnostic word:
 * whoever is accountable, whichever way round the relationship reads.
 */
export const ACCOUNTABLE_LABEL = 'Accountable';
export const ACCOUNTABLE_FOR_LABEL = 'Accountable for';

export const ownerLabel = (actorClass?: string | null): string =>
  actorClass === 'Human' ? 'Reports to' : 'Owner';

export const ownerPlaceholder = (actorClass?: string | null): string =>
  actorClass === 'Human' ? 'Who do they report to?' : 'Who is accountable?';

/** The same relationship written as prose, for a subtitle. */
export const ownerPhrase = (actorClass: string | null | undefined, ownerName: string): string =>
  actorClass === 'Human' ? `reports to ${ownerName}` : `owned by ${ownerName}`;

export const PARTY_VALUES = Object.keys(PARTY_TOKENS);
export const STATUS_VALUES = Object.keys(STATUS_TOKENS);

/** Unknown or empty values still render, just without a colour. */
export const partyToken = (value?: string | null): Token | null =>
  value ? PARTY_TOKENS[value] ?? { label: value, ...NEUTRAL } : null;

export const statusToken = (value?: string | null): Token | null =>
  value ? STATUS_TOKENS[value] ?? { label: value, ...NEUTRAL } : null;
