import { Readable } from "node:stream";

type LegacyRequest = Readable & {
  headers: Record<string, string>;
  method: string;
  url: string;
};

type LegacyResponse = {
  headersSent: boolean;
  writeHead: (statusCode: number, headers?: Record<string, string | number | string[]>) => LegacyResponse;
  setHeader: (name: string, value: string | number | string[]) => void;
  write: (chunk: string | Uint8Array) => boolean;
  end: (chunk?: string | Uint8Array) => void;
};

type LegacyApiModule = {
  handleApi: (request: LegacyRequest, response: LegacyResponse, pathname: string) => Promise<void>;
  loadDbFromSupabase: () => Promise<void>;
  flushSupabasePersistence: () => Promise<void>;
};

let initialization: Promise<void> | undefined;

async function loadLegacyApi(): Promise<LegacyApiModule> {
  const imported = await import("./legacy-api.cjs");
  return (imported.default || imported) as LegacyApiModule;
}

async function initializeLegacyApi(module: LegacyApiModule) {
  initialization ||= module.loadDbFromSupabase();
  await initialization;
}

function requestHeaders(request: Request) {
  return Object.fromEntries(Array.from(request.headers.entries()).map(([key, value]) => [key.toLowerCase(), value]));
}

function appendHeader(headers: Headers, name: string, value: string | number | string[]) {
  if (Array.isArray(value)) {
    value.forEach(item => headers.append(name, item));
    return;
  }
  headers.set(name, String(value));
}

export async function handleLegacyApiRequest(request: Request, pathname: string): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  }

  const legacyApi = await loadLegacyApi();
  await initializeLegacyApi(legacyApi);

  const body = request.method === "GET" || request.method === "HEAD"
    ? Buffer.alloc(0)
    : Buffer.from(await request.arrayBuffer());
  const input = Readable.from(body.length ? [body] : []) as LegacyRequest;
  input.method = request.method;
  input.url = request.url;
  input.headers = requestHeaders(request);

  let status = 200;
  const headers = new Headers();
  const chunks: Buffer[] = [];
  const output: LegacyResponse = {
    headersSent: false,
    writeHead(statusCode, responseHeaders = {}) {
      status = statusCode;
      Object.entries(responseHeaders).forEach(([name, value]) => appendHeader(headers, name, value));
      output.headersSent = true;
      return output;
    },
    setHeader(name, value) {
      appendHeader(headers, name, value);
    },
    write(chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    },
    end(chunk) {
      if (chunk !== undefined) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      output.headersSent = true;
    }
  };

  await legacyApi.handleApi(input, output, pathname);
  // Only a write request needs to wait for the shared-state snapshot.  A
  // previously failed write must not make status/read endpoints unavailable.
  if (!["GET", "HEAD"].includes(request.method)) {
    try {
      await legacyApi.flushSupabasePersistence();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Supabase persistence error";
      return Response.json({
        ok: false,
        error: "Unable to save this update to the shared database.",
        detail: message
      }, { status: 503 });
    }
  }
  return new Response(Buffer.concat(chunks), { status, headers });
}
