import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { accessOf } from '../lib/access';

export default createEndpoint({
  authenticated: true,
  description: 'Who is signed in, and whether they can edit or manage people',
  inputSchema: z.object({}),
  outputSchema: z.object({
    email: z.string(),
    name: z.string(),
    firstName: z.string(),
    access: z.enum(['admin', 'viewer']),
  }),
  execute: async ({ context }) => {
    const email = context.user.email ?? '';
    const access = await accessOf(email);

    // A name set on the People screen wins; otherwise fall back to the sign-in profile, then the email.
    const { records } = await zite.editors.findAll({ limit: 500 });
    const row = records.find((r) => (r.email ?? '').trim().toLowerCase() === email.trim().toLowerCase());
    const fromEmail = email.split('@')[0] ?? '';
    const guess = fromEmail ? fromEmail.charAt(0).toUpperCase() + fromEmail.slice(1) : 'there';
    const first = (context.user.firstName || row?.name?.split(' ')[0] || guess).trim();
    const full = row?.name || [context.user.firstName, context.user.lastName].filter(Boolean).join(' ') || first;

    return { email, name: full, firstName: first, access };
  },
});
