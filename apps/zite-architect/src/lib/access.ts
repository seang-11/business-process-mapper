import { zite } from 'zitejs/db';

/**
 * The person who set this app up. Always an admin, so the editor list can never
 * end up with nobody able to manage it.
 */
export const OWNER_EMAIL = 'sean@prospectautomations.com';

export type Access = 'admin' | 'editor' | 'viewer';

const norm = (e?: string | null) => (e ?? '').trim().toLowerCase();

export const isOwner = (email?: string | null) => norm(email) === OWNER_EMAIL;

/** What this email may do: admins manage people and edit, editors edit, everyone else views. */
export async function accessOf(email?: string | null): Promise<Access> {
  const mail = norm(email);
  if (!mail) return 'viewer';
  if (mail === OWNER_EMAIL) return 'admin';
  const { records } = await zite.editors.findAll({ limit: 500 });
  const row = records.find((r) => norm(r.email) === mail);
  if (!row) return 'viewer';
  return row.access === 'Admin' ? 'admin' : 'editor';
}

type Ctx = { user?: { email?: string | null } | null };

/** Stops a change from anyone who isn't an editor or admin. The server is the real lock; hidden buttons are just courtesy. */
export async function requireEditor(context: Ctx): Promise<Access> {
  const access = await accessOf(context.user?.email);
  if (access === 'viewer') throw new Error('Only editors can change this. Ask an admin to add you.');
  return access;
}

export async function requireAdmin(context: Ctx): Promise<void> {
  const access = await accessOf(context.user?.email);
  if (access !== 'admin') throw new Error('Only admins can do this.');
}
