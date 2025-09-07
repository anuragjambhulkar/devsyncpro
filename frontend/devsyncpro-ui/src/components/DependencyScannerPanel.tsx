import React, { useEffect, useState } from "react";
import axios from "axios";
import { DependencyGraph } from "./DependencyGraph";

interface Edge {
  from: string;
  to: string;
}
interface DepGraph {
  nodes: string[];
  edges: Edge[];
}

function asAdjacencyList(nodes: string[], edges: Edge[]) {
  const graph: Record<string, string[]> = {};
  for (const n of nodes) graph[n] = [];
  for (const edge of edges) graph[edge.from].push(edge.to);
  return graph;
}

function computeTransitiveBlastRadius(graph: Record<string, string[]>) {
  function dfs(node: string, visited: Set<string>) {
    if (!graph[node]) return;
    for (const neighbor of graph[node]) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        dfs(neighbor, visited);
      }
    }
  }
  return Object.fromEntries(
    Object.keys(graph).map(node => {
      const visited = new Set<string>();
      dfs(node, visited);
      return [node, visited.size];
    })
  );
}

const API_BASE = "http://localhost:8081";

export const DependencyScannerPanel: React.FC = () => {
  const [dependencyGraph, setDependencyGraph] = useState<DepGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [repoPath, setRepoPath] = useState("C:\\Users\\ADMIN\\Desktop\\Projects\\DEVSYNCPRO");

  useEffect(() => { fetchGraph(); }, []);

  async function fetchGraph() {
    setLoading(true); setError(null);
    try {
      const res = await axios.get<DepGraph>(`${API_BASE}/graph`);
      setDependencyGraph(res.data);
    } catch (err: any) {
      setError("Backend /graph not reachable: " + (err?.message || err));
      setDependencyGraph(null);
    }
    setLoading(false);
  }

  async function scanRepo() {
    setLoading(true); setError(null);
    try {
      await axios.post(`${API_BASE}/scan`, { repoPath });
      await fetchGraph();
    } catch (err: any) {
      const msg =
        err?.response?.data?.toString?.() ||
        err?.response?.data ||
        err?.message ||
        "Unknown error";
      setError("Scan failed: " + msg);
      setLoading(false);
    }
  }

  const adj =
    dependencyGraph && dependencyGraph.nodes.length > 0
      ? asAdjacencyList(dependencyGraph.nodes, dependencyGraph.edges)
      : {};

  const blastRadiusMap = computeTransitiveBlastRadius(adj);

  return (
    <div>
      {error && <div style={{ color: "#e55", padding: "1em" }}>{error}</div>}
      <h1>DevSyncPro Scanner</h1>
      <div style={{ marginBottom: "1em" }}>
        <input
          value={repoPath}
          onChange={e => setRepoPath(e.target.value)}
          style={{ width: 380, marginRight: 10, padding: "0.4em" }}
          placeholder="Absolute path to your go.mod folder"
          disabled={loading}
        />
        <button onClick={scanRepo} disabled={loading}>
          {loading ? "Scanning..." : "Scan Repo"}
        </button>
      </div>
      <h2>Dependency Graph</h2>
      {dependencyGraph && dependencyGraph.nodes.length > 0 ? (
        <DependencyGraph graph={adj} blastRadiusMap={blastRadiusMap} />
      ) : (
        <div style={{ color: "#fff" }}>No data yet.</div>
      )}
    </div>
  );
};
