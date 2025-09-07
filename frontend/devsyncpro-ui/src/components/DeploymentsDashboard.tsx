import React, { useState, useEffect } from "react";

type Deployment = {
  id: number;
  service: string;
  status: string;
  created: string;
};

export const DeploymentsDashboard: React.FC = () => {
  const [service, setService] = useState("");
  const [jobs, setJobs] = useState<Deployment[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "running" | "success" | "failed">("all");

  useEffect(() => {
    fetchDeployments();
    const poll = setInterval(fetchDeployments, 2000);
    return () => clearInterval(poll);
  }, []);

  function fetchDeployments() {
    fetch("http://localhost:8081/deployments")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setJobs([...data].reverse());
        else setJobs([]);
        setSelectedIds([]);
      })
      .catch(() => setJobs([]));
  }

  function launchDeploy(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setLoading(true);
    fetch("http://localhost:8081/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service })
    })
      .then(r => r.json())
      .then(job => {
        setMsg("Deployment started!");
        setService("");
        setJobs(jobs => [job, ...jobs]);
        setTimeout(() => setMsg(null), 1300);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  // Multi-select logic
  function toggleSelect(id: number) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleSelectAll(ev: React.ChangeEvent<HTMLInputElement>) {
    if (ev.target.checked) setSelectedIds(filtered.map(j => j.id));
    else setSelectedIds([]);
  }

  // Bulk mark as "success" (demo bulk action - replace with real as needed)
  function bulkMarkSuccess() {
    selectedIds.forEach(id => markSuccess(id, false));
    setMsg("Marking as success...");
    setTimeout(fetchDeployments, 900);
    setSelectedIds([]);
  }

  // Bulk CSV export
  function exportSelectedCSV() {
    const headers = ['id', 'service', 'status', 'created'];
    const sel = jobs.filter(j => selectedIds.includes(j.id));
    const rows = sel.map(j =>
      [String(j.id), j.service, j.status, new Date(j.created).toLocaleString()]);
    const csvRows = [headers, ...rows];
    let csv = csvRows
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "deployments-selected.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Mark as successful (dummy implementation, replace with actual)
  function markSuccess(id: number, refresh = true) {
    fetch(`http://localhost:8081/deployment/mark-success`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    })
      .then(() => { if (refresh) fetchDeployments(); })
      .catch(() => {});
  }

  const filtered = filter === "all" ? jobs : jobs.filter(j => j.status === filter);

  return (
    <div style={{ padding: "2em" }}>
      <h2>Deployments Dashboard</h2>
      {msg && <div style={{
        background: "#23242b", color: "#5e5",
        padding: "6px 18px", borderRadius: 6, marginBottom: 10, display: "inline-block"
      }}>{msg}</div>}
      <form onSubmit={e => { e.preventDefault(); setConfirm(true); }} style={{ marginBottom: 16 }}>
        <input value={service} onChange={e => setService(e.target.value)}
          required placeholder="Service name" style={{ marginRight: 8 }}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !service}>
          {loading ? "Deploying..." : "Deploy"}
        </button>
      </form>
      {confirm && (
        <div style={{ background: "#1e2233", color: "#ffea90", padding: 10, borderRadius: 8, marginBottom: 12 }}>
          Launch deployment for <b>{service}</b>?
          <button style={{ margin: "0 10px" }} onClick={() => { launchDeploy(); setConfirm(false); }}>Yes</button>
          <button onClick={() => setConfirm(false)}>No</button>
        </div>
      )}
      <div style={{ marginBottom: 10 }}>
        <button disabled={!selectedIds.length} onClick={bulkMarkSuccess}>Bulk Mark Success</button>
        <button disabled={!selectedIds.length} onClick={exportSelectedCSV} style={{ marginLeft: 8 }}>Export Selected CSV</button>
        <span style={{ marginLeft: 16, color: "#eee" }}>
          {selectedIds.length ? `${selectedIds.length} selected` : ""}
        </span>
      </div>
      <div style={{ display: "inline-block", marginBottom: 10 }}>
        <label>Status filter:&nbsp;</label>
        <select value={filter} onChange={e => setFilter(e.target.value as any)}>
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      <table style={{ width: "100%", color: "#fff", background: "#23242b", borderRadius: 10 }}>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={selectedIds.length === filtered.length && filtered.length > 0}
                onChange={toggleSelectAll}
                style={{ marginRight: 6 }}
              />
            </th>
            <th>ID</th><th>Service</th><th>Status</th><th>Created</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={5} style={{ textAlign: "center" }}>No deployments yet.</td></tr>
          )}
          {filtered.map(j =>
            <tr key={j.id} style={{
              background: j.status === "failed" ? "#702922"
                : j.status === "success" ? "#234f1f"
                : j.status === "running" ? "#23606d"
                : j.status === "pending" ? "#334"
                : undefined
            }}>
              <td>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(j.id)}
                  onChange={() => toggleSelect(j.id)}
                />
              </td>
              <td>{j.id}</td>
              <td>{j.service}</td>
              <td style={{
                color: j.status === "failed" ? "#e55"
                  : j.status === "success" ? "#5e5"
                  : j.status === "running" ? "#ffe397"
                  : "#fff"
              }}>
                {j.status}
              </td>
              <td>{new Date(j.created).toLocaleTimeString()}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
