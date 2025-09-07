import React, { useEffect, useState } from "react";
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
  const [dependencyGraph, setDependencyGraph] = useState<DepGraph>({nodes: [], edges: []});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [repoPath, setRepoPath] = useState("C:\\Users\\ADMIN\\Desktop\\Projects\\DEVSYNCPRO");

  useEffect(() => { fetchGraph(); }, []);

  async function fetchGraph() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/graph`);
      const data = await res.json();
      if (Array.isArray(data.nodes) && Array.isArray(data.edges)) {
        setDependencyGraph(data);
      } else {
        setDependencyGraph({nodes: [], edges: []});
      }
    } catch (err: any) {
      setError("Backend /graph not reachable: " + (err?.message || err));
      setDependencyGraph({nodes: [], edges: []});
    }
    setLoading(false);
  }

  async function scanRepo() {
    setLoading(true);
    setError(null);
    try {
      await fetch(`${API_BASE}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath })
      });
      await fetchGraph();
    } catch (err: any) {
      const msg =
        err?.message ||
        "Unknown error";
      setError("Scan failed: " + msg);
      setLoading(false);
    }
  }

  const adj = asAdjacencyList(dependencyGraph.nodes, dependencyGraph.edges);
  const blastRadiusMap = computeTransitiveBlastRadius(adj);

  return (
    <div>
      <h1>DevSyncPro Scanner</h1>
      {error && <div style={{ color: "#e55", padding: "1em" }}>{error}</div>}
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
      {loading ? (
        <div style={{ color: "#aaa" }}>Loading...</div>
      ) : (
        dependencyGraph.nodes.length > 0 ?
          <DependencyGraph graph={adj} blastRadiusMap={blastRadiusMap} /> :
          <div style={{ color: "#fff" }}>No data yet.</div>
      )}
    </div>
  );
};
