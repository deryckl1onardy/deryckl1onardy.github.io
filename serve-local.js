const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const host = "127.0.0.1";
const port = 4173;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

http
  .createServer((req, res) => {
    const pathname = decodeURIComponent((req.url || "/").split("?")[0]);
    let relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    let filePath = path.normalize(path.join(root, relativePath));

    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    // Try the requested path first
    fs.readFile(filePath, (error, data) => {
      if (!error) {
        res.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Type":
            mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        });
        res.end(data);
        return;
      }

      // If it's a directory path (no extension), try index.html
      if (!path.extname(filePath)) {
        const indexPath = path.join(filePath, "index.html");
        fs.readFile(indexPath, (indexError, indexData) => {
          if (!indexError) {
            res.writeHead(200, {
              "Cache-Control": "no-store",
              "Content-Type": "text/html; charset=utf-8",
            });
            res.end(indexData);
            return;
          }

          res.writeHead(404);
          res.end("Not found");
        });
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });
  })
  .listen(port, host, () => {
    console.log(`Serving ${root} at http://${host}:${port}`);
  });
