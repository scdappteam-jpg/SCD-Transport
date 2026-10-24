import { handleLegacyStorageRequest } from "@/server/legacy-api-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return handleLegacyStorageRequest(request, `/storage/${path.map(encodeURIComponent).join("/")}`);
}

export const GET = handle;
export const HEAD = handle;
