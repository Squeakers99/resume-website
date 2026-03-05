# AGENTS.md

## Cursor Cloud specific instructions

This is a pnpm workspace monorepo with two packages: `frontend` (Next.js 16, port 3000) and `backend` (Express 5 + Prisma + PostgreSQL, port 4000).

### Services

| Service | Directory | Dev command | Port |
|---------|-----------|-------------|------|
| Backend API | `backend/` | `pnpm dev` | 4000 |
| Frontend | `frontend/` | `pnpm dev` | 3000 |
| PostgreSQL | system | `sudo pg_ctlcluster 16 main start` | 5432 |

### Key gotchas

- **Prisma build scripts**: The root `package.json` includes `pnpm.onlyBuiltDependencies` to allow Prisma, sharp, and unrs-resolver build scripts. Without this, `pnpm install` will warn and skip these builds.
- **Prisma generate must run from `backend/`**: The schema lives at `backend/prisma/schema.prisma`. Run `npx prisma generate` from the `backend/` directory so the client is generated correctly.
- **PostgreSQL must be started manually**: `sudo pg_ctlcluster 16 main start` — the service does not auto-start in this environment.
- **Environment files**: `backend/.env` and `frontend/.env.local` are needed. Backend requires `DATABASE_URL`, `DIRECT_URL`, `API_KEY`, `PORT`, `FRONTEND_ORIGIN`. Frontend requires `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_SITE_URL`.
- **No automated test suite**: The repo has no test framework configured. Lint is `pnpm lint` in `frontend/` (ESLint). Backend type-checking: `npx tsc --noEmit` in `backend/`.
- **Build commands**: `pnpm build` in each package (`next build` for frontend, `tsc` for backend).
