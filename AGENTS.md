# Repository Guidelines

This document is the contributor quick-start for CTBMS. Keep it concise, enforceable, and aligned with existing rules (`STYLE_GUIDE.md`, `RULES.md`, `WORKFLOW_RULES.md`). For full details, see extended guides in `docs/rules/` (e.g., `rules.md`, `rules2.md`, `dev.md`, `css.md`, `mobilecss.md`).

## Project Structure & Module Organization
- Monorepo with Turborepo + pnpm workspaces.
- `apps/web`: React 18 + Vite + Ant Design (feature-sliced under `src/features`; shared UI in `src/components`; theme tokens in `src/theme`).
- `apps/api`: NestJS + Prisma (modules in `src/modules`; shared Prisma module in `src/prisma`; DTOs per module under `dto/`).
- `packages/types`: Single source of truth for Zod schemas and TS types; both front/back must import from here.
- Shared tooling: `packages/tsconfig`, `packages/eslint-config`. Docs in `docs/`; deployment notes in `DEPLOYMENT.md`.

## Build, Test, and Development Commands
- Install deps: `pnpm install`.
- Develop: `pnpm dev` (all) or `pnpm dev:web` / `pnpm dev:api`.
- Build: `pnpm build`, or `pnpm build:web` / `pnpm build:api`.
- Quality gates: `pnpm lint`, `pnpm type-check`; format Markdown/TS with `pnpm format`.
- Database (dev): `pnpm --filter api exec prisma db push` then `pnpm --filter api exec prisma db seed`.

## Coding Style & Naming Conventions
- Prettier is source of truth (single quotes, trailing commas). Run `pnpm format` before PR.
- Filenames `kebab-case.ts`; React components `PascalCase.tsx`; variables/functions `camelCase`; constants `UPPER_SNAKE_CASE`.
- Strict TypeScript; avoid `any`. Share request/response types only via `@packages/types`.
- Frontend: prefer ProComponents, Ant Design tokens (no hard-coded colors), TanStack Query for server state; Zustand only for UI state.
- Backend: one feature = one Nest module; inject `PrismaService` from the global module; DTOs derive from Zod schemas; controllers stay thin.

## Testing Guidelines
- Unit tests: `.spec.ts` colocated with source; E2E tests in `test/`.
- Frameworks: Nest default (Jest) for API; Vite/Vitest + Testing Library for web when added.
- Required before PR: `pnpm lint` and `pnpm type-check`; run relevant test suites when present.

## Commit & Pull Request Guidelines
- Branching: `main` (prod), `dev` (integration), feature branches `feat/<slug>`; fixes `fix/<slug>`.
- Commits follow Conventional Commits (`feat: ...`, `fix: ...`, `chore: ...`, `refactor: ...`).
- PR checklist: clear summary, linked issue, screenshots/GIFs for UI, commands executed (lint, type-check, tests, seeds if relevant). Ensure vertical-slice completeness per `WORKFLOW_RULES.md`.

## Security & Configuration Tips
- Never commit `.env`; copy `apps/api/.env.example` to `apps/api/.env` and set `DATABASE_URL`.
- Change default admin credentials after seeding. Store production secrets outside the repo.
- Use pnpm only; apps may depend on packages, packages must not depend on apps.
