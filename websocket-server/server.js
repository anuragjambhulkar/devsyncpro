const WebSocket = require("ws");
const http = require("http");

// --- Start WebSocket server on 8081 with Docker-friendly binding ---
const wss = new WebSocket.Server({ port: 8081, host: "0.0.0.0" });

wss.on("connection", ws => {
  ws.send(JSON.stringify({ type: "info", message: "Connected to DevSyncPro Live Event Stream" }));
});

console.log("WebSocket server running on ws://0.0.0.0:8081");

// --- Start HTTP server on 9000 for deploy events, with CORS ---
const server = http.createServer((req, res) => {
  // Add CORS headers!
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
      const { repo } = JSON.parse(body);
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
    res.writeHead(404);
    res.end();
  }
});
server.listen(9000, "0.0.0.0"); 
console.log("HTTP server running on http://0.0.0.0:9000");
