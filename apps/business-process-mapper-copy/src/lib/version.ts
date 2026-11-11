export const APP_VERSION = '1.1.0';

export interface Release {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: '1.1.0',
    date: '2026-09-16',
    changes: [
      'Core element types (Role, Person, Team, App, Equipment, Document, Location, Process) now ship with the app — a fresh copy works immediately without any setup',
      'Added a "Restore core types" action in the footer to recover any core types that were accidentally deleted',
      'Clearer guidance when starting from scratch — empty states now tell you what to do first',
      'Removed unused system prompt component',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-09-16',
    changes: [
      'Process library with search, sortable columns, and a configurable column picker',
      'Element library with configurable types, ownership relationships, and usage tracking',
      'Swimlane process editor with By Person and By App lane views',
      'Step checklists and sub-process drill-down',
      'Process versioning — duplicate, create blank, and switch between versions',
      'Edit process name and owner from the grid or inside the editor',
      'Safe deletion for processes and elements, with dependency checks',
    ],
  },
];
