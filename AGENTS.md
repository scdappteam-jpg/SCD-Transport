# S.C.D. Transport Repository Guide

## Architecture

The repository has two runtime applications:

- `nextjs-app`: Next.js App Router application. It owns all browser UI, backend API routes, storage delivery, persistence, external integrations, and the proxy to the image processor.
- `python-server`: FastAPI image processor. It accepts an uploaded image, detects barcode or QR values, and returns JSON. It must not own business workflows, user interfaces, or application persistence.

The browser communicates only with Next.js. Next.js calls Python through `SCAN_SERVICE_URL` for image processing.

## Next.js Boundaries

- Modern pages live in `nextjs-app/src/app`.
- Shared React UI lives in `nextjs-app/src/components`.
- Browser API clients live in `nextjs-app/src/services`.
- Global TypeScript declarations live in `nextjs-app/src/types` and use names such as `user.type.ts`.
- Backend compatibility and persistence code lives in `nextjs-app/src/server`.
- All `/api/**` requests are owned by the App Router catch-all handler and delegated through the compatibility adapter while the legacy API is incrementally split into route-specific services.
- All `/storage/**` requests are served by the App Router storage handler.
- `nextjs-app/public/legacy` is a temporary compatibility UI. Do not remove a legacy page or workflow until an equivalent App Router page has been verified.

## Compatibility Policy

Preserve existing request paths, response bodies, persisted data shapes, role visibility, and workflow state transitions. A workflow that is incomplete in the legacy source remains incomplete; do not invent new business behavior while migrating it.

The default `dev` and `start` commands use the standard Next.js server. `dev:legacy` and `start:legacy` keep the previous custom server available for rollback during migration.

## Verification

For Next.js changes run:

```powershell
cd nextjs-app
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For Python changes run the scanner against a real uploaded image through `POST /scan` and verify the Next.js `/api/scan-barcode` integration.
