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
    if (!graph[edge.to]) graph[edge.to] = graph[edge.to] || [];
  }
  return graph;
}

const API_BASE = CONFIG.SCANNER_API;
const POLL_INTERVAL_MS = 700;
const POLL_TIMEOUT_MS = 30000;

export const DependencyScannerPanel: React.FC = () => {
  const [dependencyGraph, setDependencyGraph] = useState<DepGraph>({ nodes: [], edges: [] });
  const [incidents, setIncidents] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [repoPath, setRepoPath] = useState("https://github.com/golang/example.git");
  const [lastRaw, setLastRaw] = useState<any>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);

  // AI Refactor State
  const [refacting, setRefacting] = useState(false);
  const [aiFix, setAiFix] = useState<{ original: string, refactored: string, explanation: string, impact: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rid = params.get("report_id");
    if (rid) {
      setLoading(true);
      fetchReport(rid);
    } else {
      fetchGraphOnce().then((raw) => {
        if (!raw) return;
        const converted = convertBackendGraph(raw);
        if (Object.keys(converted).length > 0) {
          const { nodes, edges } = adjacencyToNodesEdges(converted);
          setDependencyGraph({ nodes, edges });
        }
      });
    }

    fetchIncidents();
    const incidentPoll = setInterval(fetchIncidents, 5000);
    return () => clearInterval(incidentPoll);
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
      const url = `${CONFIG.ORCHESTRATOR_API}/incidents`;
      console.log("FETCH_DEBUG: Polling incidents from", url);
      const r = await fetch(url);
      if (!r.ok) {
        console.warn(`Incidents endpoint returned ${r.status}`);
        return;
      }
      const data = await r.json();
      setIncidents(Array.isArray(data) ? data : []);
      setError(null); // Clear error if it was a cold start issue
    } catch (e) {
      console.error("Incident poll failed:", e);
    }
  }

  async function fetchGraphOnce(retries = 3): Promise<any | null> {
    const url = `${API_BASE}/graph`;
    console.log("FETCH_DEBUG: Polling graph from", url);
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, { method: "GET" });
        if (res.ok) {
          const body = await res.json();
          setLastRaw(body);
          setError(null);
          return body;
        }
        if (res.status === 404) {
          console.warn(`Graph 404 (Attempt ${i + 1}/${retries}). Possible cold start.`);
        }
      } catch (err) {
        console.error(`Graph fetch attempt ${i + 1} failed:`, err);
      }
      if (i < retries - 1) await new Promise(r => setTimeout(r, 2000));
    }
    return null;
  }

  async function scanRepo() {
    setLoading(true);
    setError(null);
    try {
      const isUrl = /^(https?:\/\/|git@|ssh:\/\/)/i.test(repoPath.trim());
      const payload: any = isUrl ? { repo_url: repoPath.trim(), ref: "" } : { repoPath: repoPath.trim() };

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

      const raw = await res.json();
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
    } catch (err: any) {
      setError("Scan failed: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }

  function convertBackendGraph(resp: any): Record<string, string[]> {
    if (!resp) return {};
    const candidate = resp.graph || resp;
    const nodes = candidate.nodes || candidate.Nodes || resp.nodes || resp.Nodes;
    const edges = candidate.edges || candidate.Edges || resp.edges || resp.Edges;
    if (Array.isArray(nodes) && Array.isArray(edges)) {
      const map: Record<string, string[]> = {};
      nodes.forEach((n: string) => (map[n] = map[n] || []));
      edges.forEach((e: any) => {
        if (!e) return;
        const from = e.from || e.source || e.From;
        const to = e.to || e.target || e.To;
        if (!from || !to) return;
        if (!map[from]) map[from] = [];
        map[from].push(to);
        if (!map[to]) map[to] = map[to] || [];
      });
      return map;
    }
    return {};
  }

  function adjacencyToNodesEdges(adj: Record<string, string[]>) {
    const nodes = Object.keys(adj || {});
    const edges: Edge[] = [];
    nodes.forEach(n => {
      (adj[n] || []).forEach(t => edges.push({ from: n, to: t }));
    });
    return { nodes, edges };
  }

  const adj = asAdjacencyList(dependencyGraph.nodes, dependencyGraph.edges);

  const healthMap: Record<string, string> = {};
  incidents.forEach(inc => {
    if (inc.status === "active") {
      const current = healthMap[inc.service];
      if (inc.severity === "critical") healthMap[inc.service] = "critical";
      else if (inc.severity === "major" && current !== "critical") healthMap[inc.service] = "warning";
      else if (!current) healthMap[inc.service] = "warning";
    }
  });

  const handleAiFix = async () => {
    setRefacting(true);
    try {
      const res = await fetch(`${CONFIG.ANALYZER_API}/refactor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code_context: "// Sample problematic code with circular dependencies and memory leaks",
          focus_area: "architecture & performance"
        })
      });
      const data = await res.json();
      setAiFix({
        original: data.original_code,
        refactored: data.refactored_code,
        explanation: data.explanation,
        impact: data.estimated_impact
      });
    } catch (e) {
      alert("AI Refactor failed to initialize.");
    } finally {
      setRefacting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "30px" }}>
        <div>
          <h2 style={{ color: "var(--primary)", marginBottom: "8px" }} className="glow-text">System Dependency GPS</h2>
          <p style={{ color: "var(--text-dim)", margin: 0 }}>Visualizing architectural blast radius and health status.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <input
            value={repoPath}
            onChange={e => setRepoPath(e.target.value)}
            style={{
              width: 350,
              padding: "12px 16px",
              background: "rgba(15, 23, 42, 0.8)",
              border: "1px solid var(--glass-border)",
              borderRadius: "12px",
              color: "#fff",
              outline: "none"
            }}
            placeholder="Git repo URL or local path..."
            disabled={loading}
          />
          <button
            onClick={scanRepo}
            disabled={loading}
            style={{
              padding: "12px 24px",
              background: "var(--primary)",
              color: "#000",
              fontWeight: 700,
              border: "none",
              borderRadius: "12px",
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? "Analyzing..." : "Exploration Mode"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid var(--error)",
          color: "var(--error)",
          padding: "16px",
          borderRadius: "12px",
          marginBottom: "24px"
        }}>
          {error}
        </div>
      )}

      {shareLink && (
        <div className="glass-panel" style={{
          padding: "20px",
          marginBottom: "30px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          border: "1px solid var(--primary)"
        }}>
          <div>
            <span style={{ color: "var(--primary)", fontWeight: "bold" }}>Production Report URL:</span>
            <code style={{ marginLeft: "12px", color: "var(--text-main)" }}>{shareLink}</code>
          </div>
          <button style={{
            background: "var(--primary)",
            color: "#000",
            border: "none",
            padding: "8px 20px",
            borderRadius: "8px",
            fontWeight: "bold"
          }} onClick={() => {
            navigator.clipboard.writeText(shareLink);
          }}>Copy Secure Link</button>
        </div>
      )}

      <div style={{ position: "relative" }}>
        {loading ? (
          <div style={{ height: "400px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)" }}>
            <div className="animate-pulse">Mapping dependencies into interactive matrix...</div>
          </div>
        ) : dependencyGraph.nodes.length > 0 ? (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "20px", gap: "12px" }}>
              <button
                onClick={handleAiFix}
                className="glow-text"
                style={{
                  background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                  color: "#fff",
                  border: "none",
                  padding: "12px 28px",
                  borderRadius: "14px",
                  fontWeight: "bold",
                  boxShadow: "0 8px 20px rgba(245, 87, 108, 0.3)"
                }}
              >
                {refacting ? "AI Optimizing..." : "✨ Fix & Refactor with AI (₹8,000 Quality)"}
              </button>
            </div>

            {aiFix && (
              <div className="glass-panel animate-fade-in" style={{ padding: "30px", marginBottom: "30px", border: "1px solid var(--accent)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
                  <h3 style={{ color: "var(--accent)", margin: 0 }}>AI Refactoring Report</h3>
                  <button onClick={() => setAiFix(null)} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: "1.2rem" }}>✕</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                  <div>
                    <h4 style={{ color: "var(--text-dim)", marginBottom: "8px" }}>Original Complexity</h4>
                    <pre style={{ background: "rgba(0,0,0,0.3)", padding: "16px", borderRadius: "12px", fontSize: "0.85rem", overflow: "auto", border: "1px solid rgba(255,255,255,0.05)" }}>
                      {aiFix.original}
                    </pre>
                  </div>
                  <div>
                    <h4 style={{ color: "var(--success)", marginBottom: "8px" }}>AI Optimized High-Quality Output</h4>
                    <pre style={{ background: "rgba(0,0,0,0.5)", padding: "16px", borderRadius: "12px", fontSize: "0.85rem", overflow: "auto", border: "1px solid var(--success)" }}>
                      {aiFix.refactored}
                    </pre>
                  </div>
                </div>
                <div style={{ marginTop: "20px", display: "flex", gap: "40px", borderTop: "1px solid var(--glass-border)", paddingTop: "20px" }}>
                  <div>
                    <div style={{ color: "var(--text-dim)", fontSize: "0.8rem", textTransform: "uppercase" }}>Optimization Strategy</div>
                    <div style={{ fontWeight: 600 }}>{aiFix.explanation}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-dim)", fontSize: "0.8rem", textTransform: "uppercase" }}>Engineering Impact</div>
                    <div style={{ fontWeight: 700, color: "var(--primary)" }}>{aiFix.impact}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="glass-panel" style={{ padding: "20px" }}>
              <DependencyGraph graph={adj} healthMap={healthMap as Record<string, "healthy" | "warning" | "critical">} />
            </div>
          </>
        ) : (
          <div style={{ height: "400px", display: "flex", alignItems: "center", justifyContent: "center", border: "2px dashed var(--glass-border)", borderRadius: "24px" }}>
            <div style={{ textAlign: "center", color: "var(--text-dim)" }}>
              <div style={{ fontSize: "3rem", marginBottom: "16px" }}>🛰️</div>
              <div>No repositories mapped yet. Start a scan to see the magic.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DependencyScannerPanel;
