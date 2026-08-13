const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { loadEnvConfig } = require("@next/env");

loadEnvConfig(__dirname);

const development = process.env.NODE_ENV !== "production";
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const application = next({ dev: development, hostname: host, port, dir: __dirname });
const nextHandler = application.getRequestHandler();
const { handleApi, loadDbFromSupabase, serveStatic } = require("./src/server/legacy-api.cjs");

application.prepare().then(async () => {
  await loadDbFromSupabase();
  createServer(async (request, response) => {
    try {
      const url = parse(request.url, true);
      const pathname = url.pathname || "/";
      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        });
        return response.end();
      }
      if (pathname.startsWith("/api/")) return await handleApi(request, response, pathname);
      if (pathname.startsWith("/storage/")) return serveStatic(request, response, pathname);
      if (pathname === "/web") {
        response.writeHead(308, { Location: "/" });
        return response.end();
      }
      if (pathname === "/mobile") {
        response.writeHead(308, { Location: "/field" });
        return response.end();
      }
      if (pathname === "/classic") {
        response.writeHead(308, { Location: "/legacy/index.html" });
        return response.end();
      }
      await nextHandler(request, response, url);
    } catch (error) {
      if (!response.headersSent) response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Internal server error" }));
      console.error(error);
    }
  }).listen(port, host, () => {
    console.log(`S.C.D.TRANSPORT Next.js running at http://localhost:${port}`);
  });
}).catch(error => {
  console.error(error);
  process.exit(1);
});
