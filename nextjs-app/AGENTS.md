# Next.js Application Guide

## Ownership

This application owns the frontend, backend API, runtime data, file storage, PWA assets, integrations, and proxy calls to the Python image processor.

## Route Structure

- `/` is the modern operations dashboard.
- `/field` is the modern field image scanner.
- `/mobile` redirects to `/field`, while `/mobile-overview` preserves the legacy desktop mobile-information module.
- `src/app/(compatibility)/[module]/page.tsx` exposes every named legacy web module through an App Router route.
- `src/app/api/[...path]/route.ts` preserves every legacy `/api/**` contract.
- `src/app/storage/[...path]/route.ts` serves runtime evidence and generated files.
- `public/legacy` contains the compatibility UI used for workflows that have not yet been rewritten as React components.

The route inventory is maintained in `src/server/legacy-route-manifest.ts`. New modern pages can replace individual compatibility routes without changing the remaining legacy modules.

## Code Placement

- Put pages and route handlers in `src/app`.
- Put reusable UI in `src/components`.
- Put Axios and browser-facing operations in `src/services`.
- Put server-only persistence and integration code in `src/server`.
- Put ambient application types in `src/types/*.type.ts` using `declare global` so components do not import application interfaces.
- Keep client components limited to interactive boundaries. Prefer server components for route shells and redirects.

## Migration Rules

- Preserve all existing API paths and response shapes.
- Preserve legacy role and workflow behavior until the matching modern page is complete.
- Do not copy unfinished legacy behavior into a new implementation with guessed rules.
- Do not delete `public/legacy`, `src/server/legacy-api.cjs`, or `server.cjs` until route-by-route parity is verified and rollback is no longer required.
- Add new business logic outside `legacy-api.cjs`; progressively extract existing handlers into focused server services.
- Keep Python limited to image processing through `SCAN_SERVICE_URL`.

## Commands

```powershell
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Use `pnpm dev:legacy` only to compare behavior with the previous custom server.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
