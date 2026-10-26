import { Readable } from "node:stream";
import { storageResponse } from "./storage-response";

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
  serveStatic: (request: unknown, response: unknown, pathname: string) => Promise<void>;
  handleApi: (request: LegacyRequest, response: LegacyResponse, pathname: string) => Promise<void>;
  loadDbFromSupabase: () => Promise<void>;
  flushSupabasePersistence: () => Promise<void>;
  flushSharedStatePersistence: () => Promise<void>;
  flushMutationPersistence: () => Promise<void>;
  flushBookingPersistence: () => Promise<void>;
  flushAuthSessionPersistence: () => Promise<void>;
  flushAttachmentStorage: () => Promise<void>;
};

let initialization: Promise<void> | undefined;
const noEvidenceMutationPaths = new Set([
  "/api/inbound/twin-scan",
  "/api/inbound/move-location",
  "/api/warehouse/location/assign",
  "/api/warehouse/location/release"
]);

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

export async function handleLegacyStorageRequest(request: Request, pathname: string): Promise<Response> {
  const legacyApi = await loadLegacyApi();
  await initializeLegacyApi(legacyApi);
  return storageResponse(request, pathname, legacyApi.serveStatic);
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
  // Booking validation/auth failures did not mutate state and must not wait
  // behind unrelated database writes before returning their original status.
  if (pathname === "/api/outbound/aot-booking" && status >= 400) {
    return new Response(Buffer.concat(chunks), {status, headers});
  }
  // Only a write request needs to wait for the shared-state snapshot.  A
  // previously failed write must not make status/read endpoints unavailable.
  if (!["GET", "HEAD"].includes(request.method)) {
    try {
      if (pathname === "/api/auth/login" || pathname === "/api/auth/test-mode") {
        await legacyApi.flushAuthSessionPersistence();
        return new Response(Buffer.concat(chunks), { status, headers });
      }
      // app_state คือ source of truth ที่ UI ต้องรอให้บันทึกสำเร็จ
      if (pathname === "/api/outbound/aot-booking") {
        // Booking never writes evidence files. Do not wait for another
        // request's uploads; still require its shared-state acknowledgement.
        await legacyApi.flushBookingPersistence();
      } else {
        // These location-only operations never create evidence. Do not make a
        // driver wait behind an unrelated upload queue before recording a scan.
        if (!noEvidenceMutationPaths.has(pathname)) await legacyApi.flushAttachmentStorage();
        await legacyApi.flushMutationPersistence();
      }
    } catch (error) {
      // ถึงตรงนี้แปลว่าเขียนฐานข้อมูลหลัก (app_state) ไม่สำเร็จจริง ๆ
      // ส่วนตารางสำเนา (relational mirror) ถูกดักไว้ในฝั่ง legacy-api แล้ว ไม่ทำให้คำสั่งล้ม
      const message = error instanceof Error ? error.message : "Unknown Supabase persistence error";
      return Response.json({
        ok: false,
        error: pathname === "/api/outbound/aot-booking"
          ? "ยังยืนยันการบันทึกคิวกับฐานข้อมูลกลางไม่ได้ กรุณาตรวจสถานะก่อนกดซ้ำ"
          : "Unable to save this update to the shared database.",
        code: pathname === "/api/outbound/aot-booking" ? "BOOKING_SAVE_UNCONFIRMED" : "STATE_SAVE_UNCONFIRMED",
        detail: message
      }, { status: 503 });
    }
  }
  return new Response(Buffer.concat(chunks), { status, headers });
}
