import React, { useEffect, useState } from "react";
import axios from "axios";
import { DependencyGraph } from "./components/DependencyGraph";
import "./App.css";

type Repo = { name: string; dependencies: string[]; last_commit: string; blast_radius: number };

// Automatically use correct endpoints for local or Docker Compose
const IS_DOCKER =
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1";

// Correct Compose service names here!
const API_BASE = IS_DOCKER
  ? "http://backend:8080"
  : "http://localhost:8080";
const WS_BASE = IS_DOCKER
  ? "ws://websocket:8081/"
  : "ws://localhost:8081/";
const DEPLOY_EMIT_URL = IS_DOCKER
  ? "http://websocket:9000/emit-deploy"
  : "http://localhost:9000/emit-deploy";

function App() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [eventFeed, setEventFeed] = useState<string[]>([]);
  const [dependencyGraph, setDependencyGraph] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compute blastRadiusMap
  const blastRadiusMap: Record<string, number> = {};
  repos.forEach(repo => {
    blastRadiusMap[repo.name] = repo.blast_radius;
  });

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Fetch repos and dependencies from backend
    Promise.all([
      axios.get(`${API_BASE}/repos`),
      axios.get(`${API_BASE}/dependencies`)
    ])
      .then(([reposRes, depsRes]) => {
        setRepos(reposRes.data);
        setDependencyGraph(depsRes.data);
        setLoading(false);
      })
      .catch((err) => {
        setError("Backend is not reachable or is giving errors.");
        setLoading(false);
      });

    // WebSocket for live event feed
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(WS_BASE);
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === "repo-update") {
            setEventFeed(feed => [
              `${data.repo} ${data.event} @ ${data.timestamp}`,
              ...feed.slice(0, 9)
            ]);
          }
        } catch { /* ignore bad data */ }
      };
      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        setError("WebSocket connection failed (no live updates).");
      };
    } catch {
      setError("WebSocket failed to initiate.");
    }

    return () => { ws?.close(); };
  }, []);

  const handleDeploy = (repoName: string) => {
    axios.post(`${API_BASE}/deploy`, { repo: repoName })
      .then(() => {
        axios.post(DEPLOY_EMIT_URL, { repo: repoName });
        alert(`Deploy triggered for ${repoName}!`);
      })
      .catch(err => {
        alert(`Failed to trigger deploy: ${repoName}`);
        console.error(err);
      });
  };

  if (loading) return <div style={{ color: "#fff", padding: "2em" }}>Loading dashboard...</div>;
  if (error) return <div style={{ color: "#e55", padding: "2em" }}>{error}</div>;

  return (
    <div>
      <h1>DevSyncPro Dashboard (Graph!)</h1>
      <h2>Event Feed</h2>
      <ul>
        {eventFeed.map((e, idx) => (<li key={idx}>{e}</li>))}
      </ul>

      <h2>Dependency Graph</h2>
      <DependencyGraph graph={dependencyGraph} blastRadiusMap={blastRadiusMap} />

      {/* Blast Radius Legend */}
      <div style={{ marginBottom: "1.25em", marginLeft: "12px" }}>
        <div style={{ color: "#ddd", fontWeight: "bold" }}>Node color & size = Blast Radius (criticality)</div>
        <div
          style={{
            width: 180,
            height: 16,
            background: "linear-gradient(to right, #a50026, #fff9, #1a9850)",
            margin: "6px 0",
            borderRadius: "8px"
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", width: 180 }}>
          <span style={{ color: "#ff595e", fontSize: "12px" }}>High</span>
          <span style={{ color: "#c3f584", fontSize: "12px" }}>Low</span>
        </div>
      </div>

      <h2>Repo</h2>
      <ul>
        {repos.map((repo) => (
          <li key={repo.name} style={{ marginTop: "2rem", color: "#fff" }}>
            {repo.name}{" "}
            <button onClick={() => handleDeploy(repo.name)}>
              Trigger Deploy
            </button>
          </li>
        ))}
      </ul>
      {/* Details table */}
      <div style={{ marginTop: "2rem", color: "#FFF" }}>
        <h2>Repository Details</h2>
        <table style={{ width: "95%", background: "#2a2a2a", color: "#fff", borderRadius: "6px", marginTop: "1.5em" }}>
          <thead>
            <tr>
              <th style={{ padding: "8px" }}>Name</th>
              <th>Blast Radius</th>
              <th>Last Commit</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {repos.map(repo => (
              <tr key={repo.name}>
                <td style={{ padding: "7px" }}>{repo.name}</td>
                <td align="center" style={{ color: repo.blast_radius >= 6 ? "red" : "lime" }}>{repo.blast_radius}</td>
                <td align="center">{repo.last_commit}</td>
                <td><button onClick={() => handleDeploy(repo.name)}>Trigger Deploy</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;
