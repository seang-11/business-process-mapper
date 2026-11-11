# Building on Zite

Apps live in a `zitejs` monorepo under `apps/<dir>/`: React frontend in `src/`, backend workflows in
`src/api/` (one file = one workflow).

## Data access (backend only — the frontend never hits the DB directly)
- Each `src/api/<name>.ts` default-exports `createEndpoint({ inputSchema, outputSchema, execute })` from `zitejs/backend`.
- Query with the generated client: `import { zite } from 'zitejs/db'` — `zite.<table>.findAll({ filters })`,
  plus `findOne/create/update/delete/bulkCreate`. Read `.zite/db.ts` for exact table/field SDK names.
- Aggregates & joins: `zite.sql({ query, params })` — double-quote `"Table"`/`"field"` SDK names, bind values
  via `$1`, SELECT-only, join linked records through the link table.
- Frontend calls workflows via the generated typed client: `import { listTickets } from 'zitejs/api'`.
- Auth: `useAuth()` from `zitejs/auth` (frontend); `context.user` in workflows when `authenticated: true`.

## Conventions
- Imports: platform SDKs via `zitejs/*` (never relative into `.zite/`). Shared UI via `@project/components/ui/*`.
  Your own files via relative paths. Never edit `.zite/` or `src/main.tsx` (generated).
- Available libs: react 18, tailwindcss, react-router-dom, @tanstack/react-query, @tanstack/react-table,
  recharts 2, lucide-react, framer-motion, zod 3.24.2, date-fns 3, react-hook-form, sonner, next-themes,
  react-error-boundary, react-markdown, react-day-picker, use-debounce, cmdk, pdf-lib, @dnd-kit/*,
  @tiptap/*, @stripe/*, react-webcam, barcode-detector, @googlemaps/js-api-loader.
- After adding/renaming workflows, run `npx zitejs generate` from the workspace root.
