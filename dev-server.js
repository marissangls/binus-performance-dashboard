const http = require("http");
const fs = require("fs");
const path = require("path");

try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch (_) {}

const routes = { "/api/stats": require("./api/stats"), "/api/me": require("./api/me") };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const handler = routes[url.pathname];
    if (handler) {
      req.query = Object.fromEntries(url.searchParams);
      res.status = (c) => ((res.statusCode = c), res);
      res.json = (o) => (res.setHeader("Content-Type", "application/json"), res.end(JSON.stringify(o)));
      return handler(req, res);
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(fs.readFileSync(path.join(__dirname, "index.html")));
    }
    res.statusCode = 404;
    res.end("Not found");
  })
  .listen(process.env.PORT || 3000, () => console.log("Dashboard on http://localhost:" + (process.env.PORT || 3000)));
