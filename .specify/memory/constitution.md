<!--
  SYNC IMPACT REPORT
  ==================
  Version change: 0.0.0 (template) → 1.0.0 (initial ratification)

  Modified principles: N/A (initial ratification)

  Added sections:
    - Core Principles (I–V)
    - Technology Stack
    - Development Workflow
    - Governance

  Removed sections: N/A

  Templates reviewed:
    - ✅ .specify/templates/plan-template.md — Constitution Check gates align with principles below
    - ✅ .specify/templates/spec-template.md — FR/SC structure compatible; no mandatory additions required
    - ✅ .specify/templates/tasks-template.md — Phase structure and parallelism markers align with principles
    - ✅ .specify/templates/constitution-template.md — Source template; no changes needed

  Follow-up TODOs: None — all placeholders resolved.
-->

# Scheduler Constitution

## Core Principles

### I. Component-First Architecture

Every feature MUST be implemented as self-contained React components with clearly defined props and
responsibilities. Components MUST be independently renderable and testable in isolation. No component
may reach beyond its own module boundary to read or mutate state it does not own — shared state MUST
flow through explicit props or designated context providers.

**Rationale**: File-based routing (TanStack Router) creates natural seams between features. Respecting
component boundaries keeps those seams clean and prevents cascading breakage when routes change.

### II. Type Safety (NON-NEGOTIABLE)

TypeScript strict mode is MANDATORY across the entire codebase. The use of `any` is PROHIBITED without
an explicit inline comment documenting why the escape hatch is necessary. All server function inputs
and outputs MUST carry explicit TypeScript types. Auto-generated files (e.g., `src/routeTree.gen.ts`)
are exempt from this rule — they MUST NOT be edited manually.

**Rationale**: Strict types eliminate an entire class of runtime errors that are especially costly in
an edge-deployed, SSR environment where debugging is harder than in a local Node process.

### III. Server-First Data Fetching

Data fetching MUST use TanStack Start server functions (`createServerFn`) rather than client-side
`fetch` calls, unless the data is genuinely client-only (e.g., browser-local state). Route loaders
MUST pre-load all data needed for the initial render so that pages arrive hydrated. Client-side
re-fetching is acceptable for mutations and real-time updates.

**Rationale**: SSR on Cloudflare Workers means the server render and the client hydration MUST agree.
Keeping data fetching on the server path prevents hydration mismatches and reduces cold-start payload.

### IV. Edge-Runtime Compatibility

All server-side code MUST be compatible with the Cloudflare Workers runtime. This means:
- No Node.js built-in APIs (`fs`, `path`, `crypto` Node variant, etc.) unless polyfilled via
  `@cloudflare/unenv-preset`.
- No long-lived in-memory state across requests (Workers are stateless per invocation).
- Bundle size MUST remain within Cloudflare Workers limits (compressed < 1 MB per worker by default).

Any violation MUST be documented in the Complexity Tracking table of the feature's `plan.md` with a
justification and the specific polyfill or workaround used.

**Rationale**: Incompatible code fails silently in development (Node) but crashes in production
(Workers). Catching violations at design time via the constitution check prevents costly deploy cycles.

### V. Simplicity & YAGNI

Features MUST be implemented at the minimum complexity required to satisfy current user stories. New
abstractions (hooks, contexts, utility modules) MUST NOT be introduced unless they are used in at least
two distinct places. Premature generalization is a defect. Route and component files SHOULD remain
under 200 lines; longer files MUST be split along logical boundaries.

**Rationale**: TanStack Start and file-based routing already impose a clear structure. Over-engineering
on top of that structure creates indirection without benefit and makes the edge-deployed bundle larger.

## Technology Stack

The following stack is mandatory for all features unless a constitution amendment approves an addition:

| Layer | Technology | Notes |
|---|---|---|
| Meta-framework | TanStack Start v1 | SSR, server functions, file-based routing |
| Router | TanStack Router | `src/routeTree.gen.ts` is auto-generated — do not edit |
| UI | React 19 + TypeScript (strict) | |
| Styling | Tailwind CSS v4 | Configured via Vite plugin; no `tailwind.config.*` file |
| Icons | Lucide React | Sole icon library; do not introduce a second |
| Testing | Vitest + Testing Library | `npm run test` |
| Deployment | Cloudflare Workers via Wrangler | `npm run deploy` |
| Dev server | Vite on port 3000 | `npm run dev` |

New runtime dependencies MUST be evaluated for Workers compatibility before adoption.

## Development Workflow

- **Branch naming**: `###-feature-name` (kebab-case, prefixed with issue/ticket number).
- **Specs first**: A feature MUST have a `specs/###-feature-name/spec.md` before implementation begins.
- **Plan before code**: Run `/speckit.plan` to produce `plan.md` and verify the Constitution Check
  gates pass before writing implementation code.
- **Tasks drive work**: Run `/speckit.tasks` to generate `tasks.md`; implementation follows the task
  list in dependency order.
- **Route tree**: Never manually edit `src/routeTree.gen.ts`. Run `npm run dev` or `npm run build`
  to regenerate it after adding or renaming route files.
- **Binding types**: After modifying `wrangler.jsonc` bindings, regenerate types with
  `npm run cf-typegen` before committing.
- **Tests**: Run `npm run test` before opening a pull request. Failing tests MUST be fixed, not skipped.

## Governance

This constitution supersedes all other practices and informal conventions in this repository. Where
CLAUDE.md and this constitution conflict, this constitution governs unless CLAUDE.md contains a more
specific or more recent instruction.

**Amendment procedure**:
1. Open a PR with the proposed change to `.specify/memory/constitution.md`.
2. Run `/speckit.constitution` to validate consistency and propagate updates to dependent templates.
3. Increment the version following semantic versioning rules documented in the constitution command.
4. The PR description MUST include the Sync Impact Report generated by the command.
5. Merge only after review confirms no open features are broken by the amendment.

**Compliance review**: Every feature's `plan.md` MUST include a Constitution Check section that
explicitly verifies compliance with each applicable principle before implementation begins.

**Version policy**:
- MAJOR: Removal or incompatible redefinition of an existing principle.
- MINOR: New principle or section added, or materially expanded guidance.
- PATCH: Clarifications, wording, or typo fixes with no semantic change.

**Version**: 1.0.0 | **Ratified**: 2026-03-02 | **Last Amended**: 2026-03-02
