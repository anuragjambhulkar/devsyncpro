// websocket-server/server.js
// Improved combined HTTP + WebSocket server
const http = require("http");
const WebSocket = require("ws");

const PORT = parseInt(process.env.PORT || "10000", 10);
const WS_PATH = process.env.WS_PATH || "/ws";
const KEEPALIVE_MS = 30000;

const server = http.createServer((req, res) => {
  // Basic CORS for the emit endpoint
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");


  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "healthy", service: "relay", timestamp: new Date().toISOString() }));
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/relay" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        // payload should have { type, ...data }
        broadcast(payload);
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
      } catch (err) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("invalid json");
      }
    });
    return;
  }

  if (req.url === "/emit-deploy" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const payload = {
          type: "repo-update",
          repo: parsed.repo,
          event: "deployed",
          timestamp: new Date().toISOString()
        };
        broadcast(payload);
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
      } catch (err) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("invalid json");
      }
    });
    return;
  }

  function broadcast(payload) {
    const msg = JSON.stringify(payload);
    let sent = 0;
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
        sent++;
      }
    });
    console.log(`Relayed event type [${payload.type}], broadcast to ${sent} clients`);
  }

  // default 404
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

// Attach WebSocket server to the existing HTTP server on a path
const wss = new WebSocket.Server({ server, path: WS_PATH });

wss.on("connection", (ws, req) => {
  console.log("WebSocket client connected:", req.socket.remoteAddress);
  ws.isAlive = true;

  // Send welcome message
  ws.send(JSON.stringify({
    type: "info",
    message: "Connected to DevSyncPro Live Event Stream"
  }));

  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (msg) => {
    // Optionally handle messages from clients
    // console.log("Received message from client:", String(msg));
  });

  ws.on("close", (code, reason) => {
    console.log("WebSocket client disconnected:", code, reason && reason.toString());
  });
  ws.on("error", (err) => {
    console.log("WebSocket error:", err && err.message);
  });
});

// Keepalive ping/pong
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch (e) { }
      return;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { }
  });
}, KEEPALIVE_MS);

wss.on("close", () => clearInterval(interval));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`HTTP+WS server listening at http://0.0.0.0:${PORT}`);
  console.log(`WebSocket endpoint available at ws://<host>:${PORT}${WS_PATH}`);
});
