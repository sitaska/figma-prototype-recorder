import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const port = 4173;
const baseDir = resolve("tools/recorder-web");

const contentTypeByExt = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8"
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const safePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = join(baseDir, safePath);
    const ext = extname(filePath);

    const content = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypeByExt[ext] || "application/octet-stream"
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(port, () => {
  console.log(`Recorder web disponible en http://localhost:${port}`);
});
