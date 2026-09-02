#!/usr/bin/env node
// Local preview that behaves like the deployed site.
//   node tools/serve.mjs [port]
// Mirrors vercel.json: cleanUrls (serve foo.html at /foo, redirect /foo.html
// to /foo) and trailingSlash: false. Without this, previewing locally would
// answer questions the real host answers differently.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve, dirname, normalize } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const PORT = Number(process.argv[2] || 4468);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
};

const exists = async (path) => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

const send = (res, status, body, type) => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let path = decodeURIComponent(url.pathname);

  // never let a request climb out of the project
  if (normalize(path).includes("..")) return send(res, 400, "Bad request", TYPES[".txt"]);

  // trailingSlash: false: /foo/ becomes /foo
  if (path.length > 1 && path.endsWith("/")) {
    const to = path.replace(/\/+$/, "") + url.search;
    res.writeHead(308, { location: to });
    return res.end();
  }

  // cleanUrls: /foo.html becomes /foo
  if (path.endsWith(".html")) {
    const to = path.slice(0, -5).replace(/\/index$/, "") || "/";
    res.writeHead(308, { location: to + url.search });
    return res.end();
  }

  const candidates =
    path === "/"
      ? [join(ROOT, "index.html")]
      : [join(ROOT, path), join(ROOT, `${path}.html`), join(ROOT, path, "index.html")];

  for (const file of candidates) {
    if (!(await exists(file))) continue;
    const body = await readFile(file);
    return send(res, 200, body, TYPES[extname(file)] || "application/octet-stream");
  }

  send(res, 404, "Not found", TYPES[".txt"]);
}).listen(PORT, () => {
  console.log(`serving ${ROOT} on http://localhost:${PORT} (clean urls)`);
});
