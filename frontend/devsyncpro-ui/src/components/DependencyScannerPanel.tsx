import React, { useEffect, useState } from "react";
import { DependencyGraph } from "./DependencyGraph";
import { CONFIG } from "../config";

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
  for (const edge of edges) {
    if (!graph[edge.from]) graph[edge.from] = [];
    graph[edge.from].push(edge.to);
    // ensure target exists in map so it shows in node list
    if (!graph[edge.to]) graph[edge.to] = graph[edge.to] || [];
  }
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
  ) as Record<string, number>;
}

const API_BASE = CONFIG.SCANNER_API;
const POLL_INTERVAL_MS = 700;
const POLL_TIMEOUT_MS = 30000;

export const DependencyScannerPanel: React.FC = () => {
  const [dependencyGraph, setDependencyGraph] = useState<DepGraph>({ nodes: [], edges: [] });
  const [incidents, setIncidents] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // default to a git URL for easier frontend testing; change as needed
  const [repoPath, setRepoPath] = useState("https://github.com/golang/example.git");
  const [lastRaw, setLastRaw] = useState<any>(null); // raw /graph response for debugging
  const [reportId, setReportId] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);

  useEffect(() => {
    // Check for report_id in URL
    const params = new URLSearchParams(window.location.search);
    const rid = params.get("report_id");
    if (rid) {
      setLoading(true);
      fetchReport(rid);
    } else {
      // initial load of last saved graph (if any)
      fetchGraphOnce().then((raw) => {
        if (!raw) return;
        const converted = convertBackendGraph(raw);
        if (Object.keys(converted).length > 0) {
          const { nodes, edges } = adjacencyToNodesEdges(converted);
          setDependencyGraph({ nodes, edges });
        }
      });
    }

    // periodically fetch incidents for health status
    fetchIncidents();
    const incidentPoll = setInterval(fetchIncidents, 5000);

    return () => clearInterval(incidentPoll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchReport(id: string) {
    try {
      const res = await fetch(`${API_BASE}/reports/${id}`);
      if (!res.ok) throw new Error("Report not found");
      const data = await res.json();
      setReportId(data.id);
      const converted = convertBackendGraph(data.graph);
      const { nodes, edges } = adjacencyToNodesEdges(converted);
      setDependencyGraph({ nodes, edges });
      setLastRaw(data);
    } catch (e: any) {
      setError("Failed to load report: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchIncidents() {
    try {
      const r = await fetch(`${CONFIG.ORCHESTRATOR_API}/incidents`);
      const data = await r.json();
      setIncidents(Array.isArray(data) ? data : []);
    } catch (e) { console.error("Health poll failed", e); }
  }

  // fetch /graph once (no conversion here)
  async function fetchGraphOnce(): Promise<any | null> {
    try {
      const res = await fetch(`${API_BASE}/graph`, { method: "GET" });
      if (!res.ok) {
        console.warn("/graph returned non-OK:", res.status);
        return null;
      }
      const body = await res.json();
      console.debug("/graph raw:", body);
      setLastRaw(body);
      return body;
    } catch (err) {
      console.warn("fetchGraphOnce error:", err);
      return null;
    }
  }

  // poll /graph until converted adjacency map is non-empty or timeout
  async function pollGraphUntilReady(timeoutMs = POLL_TIMEOUT_MS, intervalMs = POLL_INTERVAL_MS) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const raw = await fetchGraphOnce();
      if (!raw) {
        await new Promise(r => setTimeout(r, intervalMs));
        continue;
      }
      const converted = convertBackendGraph(raw);
      if (Object.keys(converted).length > 0) {
        return converted;
      }
      // small sleep before next attempt
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return null;
  }

  // Performs the scan by POSTing to /scan and then polling /graph for results
  async function scanRepo() {
    setLoading(true);
    setError(null);
    try {
      // detect if input looks like a URL -> send repo_url; otherwise send repoPath
      const isUrl = /^(https?:\/\/|git@|ssh:\/\/)/i.test(repoPath.trim());
      const payload: any = isUrl ? { repo_url: repoPath.trim(), ref: "" } : { repoPath: repoPath.trim() };

      console.info("Starting scan; payload:", payload);
      const res = await fetch(`${API_BASE}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setError(`Scan endpoint returned ${res.status}`);
        setLoading(false);
        return;
      }

      // 1. Try to use direct response first
      const raw = await res.json();
      console.debug("/scan root result:", raw);
      const directConverted = convertBackendGraph(raw);
      if (Object.keys(directConverted).length > 0) {
        const { nodes, edges } = adjacencyToNodesEdges(directConverted);
        setDependencyGraph({ nodes, edges });
        setLastRaw(raw);
        if (raw.report_id) {
          setShareLink(`${window.location.origin}${window.location.pathname}?report_id=${raw.report_id}`);
        }
        setLoading(false);
        return;
      }

      // 2. Fallback to polling if direct response was empty/incomplete
      const converted = await pollGraphUntilReady();
      if (converted) {
        const { nodes, edges } = adjacencyToNodesEdges(converted);
        setDependencyGraph({ nodes, edges });
      }
      else {
        // final attempt: fetch once more and convert
        const raw = await fetchGraphOnce();
        const conv2 = convertBackendGraph(raw);
        const { nodes, edges } = adjacencyToNodesEdges(conv2);
        setDependencyGraph({ nodes, edges });
        if (Object.keys(conv2).length === 0) {
          setError("Scan completed but no dependency graph available (timeout). Check backend logs.");
        }
      }
    } catch (err: any) {
      console.error("scanRepo error:", err);
      setError("Scan failed: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }

  // Convert many backend shapes into adjacency map { node: [deps] }
  function convertBackendGraph(resp: any): Record<string, string[]> {
    if (!resp) return {};

    // If backend wraps in { graph: {...} }
    const candidate = resp.graph || resp;

    // 1. Check if candidate has nodes + edges arrays
    const nodes = candidate.nodes || candidate.Nodes || resp.nodes || resp.Nodes;
    const edges = candidate.edges || candidate.Edges || resp.edges || resp.Edges;
    if (Array.isArray(nodes) && Array.isArray(edges)) {
      const map: Record<string, string[]> = {};
      nodes.forEach((n: string) => (map[n] = map[n] || []));
      edges.forEach((e: any) => {
        if (!e) return;
        const from = e.from || e.source || e.From; // handle Go exported field names too
        const to = e.to || e.target || e.To;
        if (!from || !to) return;
        if (!map[from]) map[from] = [];
        map[from].push(to);
        if (!map[to]) map[to] = map[to] || [];
      });
      console.debug("convertBackendGraph: converted nodes+edges -> adjacency", { nodes: nodes.length, edges: edges.length });
      return map;
    }

    // 2. If it looks like an adjacency map { node: [arr] }
    const keys = Object.keys(candidate || {});
    // Prevent matching { nodes: [...], edges: [...] } as an adjacency map where "nodes" is a node name
    if (keys.length > 0 && keys.every(k => Array.isArray(candidate[k])) && !keys.includes("nodes") && !keys.includes("edges")) {
      const map: Record<string, string[]> = {};
      keys.forEach(k => (map[k] = candidate[k]));
      console.debug("convertBackendGraph: adjacency shape detected");
      return map;
    }

    // 3. If resp looks like an array of edges
    if (Array.isArray(resp)) {
      const map: Record<string, string[]> = {};
      (resp as any[]).forEach((e: any) => {
        const from = e.from || e.source || e.From;
        const to = e.to || e.target || e.To;
        if (!from || !to) return;
        if (!map[from]) map[from] = [];
        map[from].push(to);
        if (!map[to]) map[to] = map[to] || [];
      });
      console.debug("convertBackendGraph: converted edge-array -> adjacency");
      return map;
    }

    // Unknown shape
    console.warn("convertBackendGraph: unknown response shape", resp);
    return {};
  }

  // helper: convert adjacency map back to nodes+edges arrays
  function adjacencyToNodesEdges(adj: Record<string, string[]>) {
    const nodes = Object.keys(adj || {});
    const edges: Edge[] = [];
    nodes.forEach(n => {
      (adj[n] || []).forEach(t => edges.push({ from: n, to: t }));
    });
    return { nodes, edges };
  }

  // adjacency + blast map for the DependencyGraph component
  const adj = asAdjacencyList(dependencyGraph.nodes, dependencyGraph.edges);

  // compute health map from active incidents
  const healthMap: Record<string, string> = {};
  incidents.forEach(inc => {
    if (inc.status === "active") {
      const current = healthMap[inc.service];
      if (inc.severity === "critical") {
        healthMap[inc.service] = "critical";
      } else if (inc.severity === "major" && current !== "critical") {
        healthMap[inc.service] = "warning";
      } else if (!current) {
        healthMap[inc.service] = "warning";
      }
    }
  });

  return (
    <div>
      <h1>DevSyncPro Scanner</h1>

      {error && <div style={{ color: "#e55", padding: "1em" }}>{error}</div>}

      <div style={{ marginBottom: "1em" }}>
        <input
          value={repoPath}
          onChange={e => setRepoPath(e.target.value)}
          style={{ width: 420, marginRight: 10, padding: "0.4em" }}
          placeholder="Git repo URL or local path (e.g. https://github.com/org/repo.git or C:\\path\\to\\repo)"
          disabled={loading}
        />
        <button onClick={scanRepo} disabled={loading}>
          {loading ? "Scanning..." : "Scan Repo"}
        </button>
      </div>

      {shareLink && (
        <div style={{
          background: "rgba(0, 210, 255, 0.1)",
          border: "1px solid #00d2ff",
          padding: "15px",
          borderRadius: "12px",
          marginBottom: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <div>
            <span style={{ color: "#00d2ff", fontWeight: "bold" }}>Shareable Report:</span>
            <code style={{ marginLeft: "10px", color: "#fff" }}>{shareLink}</code>
          </div>
          <button style={{ background: "#00d2ff", color: "#000", border: "none", padding: "5px 15px", borderRadius: "6px", cursor: "pointer" }} onClick={() => {
            navigator.clipboard.writeText(shareLink);
            alert("Copied to clipboard!");
          }}>Copy Link</button>
        </div>
      )}

      <h2>Dependency Graph</h2>

      {loading ? (
        <div style={{ color: "#aaa" }}>Loading (scan in progress)...</div>
      ) : dependencyGraph.nodes.length > 0 ? (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "10px" }}>
            <button style={{
              background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
              color: "#fff",
              border: "none",
              padding: "10px 20px",
              borderRadius: "12px",
              fontWeight: "bold",
              cursor: "pointer",
              boxShadow: "0 4px 15px rgba(245, 87, 108, 0.4)"
            }} onClick={async () => {
              try {
                const res = await fetch(`${CONFIG.ORCHESTRATOR_API}/payments/checkout`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ service: "AI_Fix_Refactor", amount: 800 })
                });
                const data = await res.json();
                alert(`Redirecting to: ${data.checkout_url}\nSession ID: ${data.session_id}`);
                window.location.reload(); // Refresh to see DRR update in experiments
              } catch (e) {
                alert("Payment failed to initialize.");
              }
            }}>
              ✨ Fix & Refactor with AI (₹800)
            </button>
          </div>
          <DependencyGraph graph={adj} healthMap={healthMap as Record<string, "healthy" | "warning" | "critical">} />
        </>
      ) : (
        <div style={{ color: "#fff" }}>
          No data yet.
          {lastRaw ? (
            <div style={{ marginTop: 12, color: "#ccc", fontSize: 12 }}>
              <div>Last /graph raw response (debug):</div>
              <pre style={{ maxHeight: 240, overflow: "auto", background: "#111", padding: 8, color: "#ddd" }}>
                {JSON.stringify(lastRaw, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default DependencyScannerPanel;
