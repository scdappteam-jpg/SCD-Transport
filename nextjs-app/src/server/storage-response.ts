import { Readable, Writable } from "node:stream";
import { finished } from "node:stream/promises";

// The legacy file server uses fs.createReadStream(...).pipe(res). A real
// Writable is required: its asynchronous finish must precede the Web Response.
export async function storageResponse(
  request: Request,
  pathname: string,
  serve: (request: unknown, response: unknown, pathname: string) => Promise<void>,
): Promise<Response> {
  let relative: string;
  try { relative = decodeURIComponent(pathname.slice("/storage/".length)); }
  catch { return Response.json({ error: "Invalid file path" }, { status: 400 }); }
  if (!pathname.startsWith("/storage/") || !relative ||
      relative.includes("\\") || relative.includes("\0") ||
      relative.split("/").some(part => !part || part === "." || part === "..")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  let status = 200;
  const headers = new Headers();
  const chunks: Buffer[] = [];
  const output = Object.assign(new Writable({
    write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); },
  }), {
    headersSent: false,
    setHeader(name: string, value: string | number | string[]) {
      if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
      else headers.set(name, String(value));
    },
    writeHead(code: number, values: Record<string, string | number | string[]> = {}) {
      status = code;
      Object.entries(values).forEach(([name, value]) => output.setHeader(name, value));
      output.headersSent = true;
      return output;
    },
  });
  const completion = finished(output);
  const input = Object.assign(Readable.from([]), {
    method: request.method, url: request.url,
    headers: Object.fromEntries(request.headers.entries()),
  });
  await serve(input, output, pathname);
  await completion;
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(request.method === "HEAD" ? null : Buffer.concat(chunks), { status, headers });
}
