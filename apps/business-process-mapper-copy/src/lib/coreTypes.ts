/**
 * The 8 core element types that ship with the app.
 *
 * This is the single source of truth. The ensure helper reads this list,
 * compares it to what's in the database, and creates only what's missing.
 * Existing rows are never overwritten — client renames and recolours survive.
 */

export interface CoreType {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  categories: string[];
  actorClass: string;
  humanKind: string | null;
  sortOrder: number;
}

export const CORE_TYPES: CoreType[] = [
  {
    key: 'role',
    name: 'Role',
    description:
      'A function someone performs. Use for internal roles and for external parties like clients and vendors.',
    icon: 'UserCog',
    color: '#7F77DD',
    categories: ['Actor'],
    actorClass: 'Human',
    humanKind: 'Position',
    sortOrder: 1,
  },
  {
    key: 'person',
    name: 'Person',
    description: 'A specific named individual.',
    icon: 'User',
    color: '#5DCAA5',
    categories: ['Actor'],
    actorClass: 'Human',
    humanKind: 'Individual',
    sortOrder: 2,
  },
  {
    key: 'team',
    name: 'Team',
    description: 'A group that acts collectively.',
    icon: 'Users',
    color: '#1D9E75',
    categories: ['Actor'],
    actorClass: 'Human',
    humanKind: 'Group',
    sortOrder: 3,
  },
  {
    key: 'app',
    name: 'App',
    description:
      'Software. An actor when it runs a step on its own, a resource when a person uses it.',
    icon: 'AppWindow',
    color: '#378ADD',
    categories: ['Actor', 'Resource'],
    actorClass: 'System',
    humanKind: null,
    sortOrder: 4,
  },
  {
    key: 'equipment',
    name: 'Equipment',
    description: 'Physical kit used to do the work.',
    icon: 'Wrench',
    color: '#BA7517',
    categories: ['Resource'],
    actorClass: 'Not an actor',
    humanKind: null,
    sortOrder: 5,
  },
  {
    key: 'document',
    name: 'Document',
    description:
      'A record or artifact. A resource when read, an output when created.',
    icon: 'FileText',
    color: '#888780',
    categories: ['Resource', 'Output'],
    actorClass: 'Not an actor',
    humanKind: null,
    sortOrder: 6,
  },
  {
    key: 'location',
    name: 'Location',
    description: 'Where work happens.',
    icon: 'MapPin',
    color: '#D4537E',
    categories: ['Place'],
    actorClass: 'Not an actor',
    humanKind: null,
    sortOrder: 7,
  },
  {
    key: 'process',
    name: 'Process',
    description:
      'A mapped process. Has no categories, so it never appears in a step picker — processes have their own screen.',
    icon: 'Workflow',
    color: '#D85A30',
    categories: [],
    actorClass: 'Not an actor',
    humanKind: null,
    sortOrder: 99,
  },
];
