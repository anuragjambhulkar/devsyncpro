import React, { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

interface Edge {
  from: string;
  to: string;
}
interface DepGraph {
  nodes: string[];
  edges: Edge[];
}

const API_BASE = "http://localhost:8081";

function DependencyGraph({ graph }: { graph: DepGraph | null }) {
  if (!graph) return <div style={{ color: "#fff" }}>No data yet.</div>;
  return (
    <pre style={{ background: "#222", color: "#0f0", padding: "1em" }}>
      {JSON.stringify(graph, null, 2)}
    </pre>
  );
}

const App: React.FC = () => {
  const [dependencyGraph, setDependencyGraph] = useState<DepGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [repoPath, setRepoPath] = useState("/root/testdata/sample-go");

  useEffect(() => {
    fetchGraph();
    // eslint-disable-next-line
  }, []);

  async function fetchGraph() {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<DepGraph>(`${API_BASE}/graph`);
      setDependencyGraph(res.data);
    } catch (err: any) {
      setError("Backend /graph not reachable: " + (err.message || err));
    }
    setLoading(false);
  }

  async function scanRepo() {
    setLoading(true);
    setError(null);
    try {
      await axios.post(`${API_BASE}/scan`, { repoPath });
      await fetchGraph();
    } catch (err: any) {
      setError("Scan failed: " + (err.message || err));
      setLoading(false);
    }
  }

  return (
    <div style={{ color: "#fff", padding: "2em", fontFamily: "sans-serif" }}>
      {error && <div style={{ color: "#e55", padding: "1em" }}>{error}</div>}
      <h1>DevSyncPro Scanner</h1>
      <div style={{ marginBottom: "1em" }}>
        <input
          value={repoPath}
          onChange={e => setRepoPath(e.target.value)}
          style={{ width: 300, marginRight: 10 }}
          placeholder="/root/testdata/sample-go"
        />
        <button onClick={scanRepo} disabled={loading}>
          {loading ? "Scanning..." : "Scan Repo"}
        </button>
      </div>
      <h2>Dependency Graph</h2>
      <DependencyGraph graph={dependencyGraph} />
    </div>
  );
};

export default App;
