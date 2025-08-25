const WebSocket = require("ws");
const http = require("http");

// --- Start WebSocket server on 8081 with Docker-friendly binding ---
const wss = new WebSocket.Server({ port: 8081, host: "0.0.0.0" });

wss.on("connection", ws => {
  console.log("WebSocket client connected");
  ws.isAlive = true;
  ws.send(JSON.stringify({ type: "info", message: "Connected to DevSyncPro Live Event Stream" }));

  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("close", (code, reason) => {
    console.log("WebSocket client disconnected", { code, reason });
  });
  ws.on("error", err => {
    console.log("WebSocket error:", err && err.message);
  });
});

// --- Keepalive: ping/pong every 30s ---
const interval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", () => clearInterval(interval));
console.log("WebSocket server running on ws://0.0.0.0:8081");

// --- HTTP POST endpoint for deploy events, with CORS ---
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === "/emit-deploy" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      let repo;
      try {
        repo = JSON.parse(body).repo;
      } catch (_) {
        res.writeHead(400); res.end("invalid data"); return;
      }
      wss.clients.forEach(client => {
        client.send(JSON.stringify({
          type: "repo-update",
          repo,
          event: "deployed",
          timestamp: new Date().toISOString()
        }));
      });
      res.writeHead(200);
      res.end("ok");
    });
  } else {
    res.writeHead(404); res.end();
  }
});
server.listen(9000, "0.0.0.0");
console.log("HTTP server running on http://0.0.0.0:9000");
