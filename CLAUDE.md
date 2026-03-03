# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server on port 3000
npm run build      # Build for production
npm run preview    # Build and preview production version
npm run test       # Run tests with Vitest
npm run deploy     # Build and deploy to Cloudflare Workers
npm run cf-typegen # Regenerate Cloudflare Worker binding types
```

## Architecture

This is a full-stack React application using **TanStack Start** (SSR meta-framework), deployed to **Cloudflare Workers**.

**Key libraries:**
- TanStack Start v1 + TanStack Router — file-based routing, SSR, server functions
- React 19 + TypeScript (strict)
- Tailwind CSS v4 (configured via Vite plugin, not a config file)
- Lucide React for icons

**Routing:** Routes live in `src/routes/`. TanStack Router uses file-based routing; `src/routeTree.gen.ts` is auto-generated and should not be edited manually (it's regenerated on `dev`/`build`). The root layout is `src/routes/__root.tsx`.

**SSR + Cloudflare:** Vite builds two bundles — client (`dist/client/`) and server (`dist/server/`). The server bundle runs on Cloudflare Workers via `wrangler.jsonc`. Use `worker-configuration.d.ts` for Cloudflare binding types (regenerate with `npm run cf-typegen`).

**Path alias:** `@/*` maps to `./src/*`.

**Devtools:** TanStack Router Devtools and React Query Devtools are rendered in the root layout in development only.

## Active Technologies
- TypeScript 5.7 (strict mode — Principle II) + TanStack Start v1, TanStack Router, React 19, Tailwind CSS v4, Lucide React (001-user-auth)
- Cloudflare D1 (SQLite) — binding name `DB`; see `data-model.md` for schema (001-user-auth)
- TypeScript 5.7 (strict mode) + TanStack Start v1, TanStack Router, React 19, Tailwind CSS v4, Lucide React, Cloudflare D1 (existing), Cloudflare R2 (new `PROFILE_PHOTOS` binding) (002-user-profile)
- Cloudflare D1 — new `user_profile` table; Cloudflare R2 — `scheduler-profile-photos` bucket for avatar images (002-user-profile)

## Recent Changes
- 001-user-auth: Added TypeScript 5.7 (strict mode — Principle II) + TanStack Start v1, TanStack Router, React 19, Tailwind CSS v4, Lucide React
