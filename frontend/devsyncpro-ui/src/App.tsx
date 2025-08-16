import React, { useEffect, useState } from "react";
import axios from "axios";
import { DependencyGraph } from "./components/DependencyGraph";
import "./App.css"; // Make sure dark styles are applied!

type Repo = { name: string; dependencies: string[]; last_commit: string; blast_radius: number };

const API_BASE = "http://localhost:8080";

function App() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [eventFeed, setEventFeed] = useState<string[]>([]);
  const [dependencyGraph, setDependencyGraph] = useState<Record<string, string[]>>({});
  const blastRadiusMap: Record<string, number> = {};
  repos.forEach(repo => {
    blastRadiusMap[repo.name] = repo.blast_radius;
  });
  useEffect(() => {
    // Fetch /repos with error handling
    axios.get(`${API_BASE}/repos`)
      .then(res => setRepos(res.data))
      .catch(err => {
        setRepos([]);
        console.error("API error /repos:", err);
        alert("Backend not reachable—check Go server on :8080!");
      });

    // Fetch /dependencies with error handling
    axios.get(`${API_BASE}/dependencies`)
      .then(res => setDependencyGraph(res.data))
      .catch(err => {
        setDependencyGraph({});
        console.error("API error /dependencies:", err);
        alert("Backend not reachable—check Go server on :8080!");
      });

    // WebSocket for live event feed
    const ws = new window.WebSocket("ws://localhost:8081");
    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.type === "repo-update") {
        setEventFeed(feed => [
          `${data.repo} ${data.event} @ ${data.timestamp}`,
          ...feed.slice(0, 9)
        ]);
      }
    };
    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };
    return () => {
      ws.close();
    };
  }, []);
  const handleDeploy = (repoName: string) => {
    axios.post(`${API_BASE}/deploy`, { repo: repoName })
      .then(() => {
        // Optionally: ping the websocket HTTP server to emit deploy event
        axios.post("http://localhost:9000/emit-deploy", { repo: repoName });
        alert(`Deploy triggered for ${repoName}!`);
      })
      .catch(err => {
        alert(`Failed to trigger deploy: ${repoName}`);
        console.error(err);
      });
  };


  return (
    <div>
      <h1>DevSyncPro Dashboard (Graph!)</h1>
      <h2>Event Feed</h2>
      <ul>
        {eventFeed.map((e, idx) => (<li key={idx}>{e}</li>))}
      </ul>

      <h2>Dependency Graph</h2>
      <DependencyGraph graph={dependencyGraph} blastRadiusMap={blastRadiusMap} />
      {/* Styled Next Steps Section Below */}
      <h2>Repos</h2>
      <ul>
        {repos.map((repo) => (
          <li key={repo.name}>
            {repo.name}{" "}
            <button onClick={() => handleDeploy(repo.name)}>
              Trigger Deploy
            </button>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: "2rem", color: "#FFF" }}>
        <h2>Next Steps</h2>
        <ul>
          <li>Add “Trigger Deploy” button for CI/CD simulation</li>
          <li>Show repo status history here</li>
          <li>Upgrade graph with node colors by blast radius</li>
        </ul>
      </div>
    </div>
  );
}

export default App;
