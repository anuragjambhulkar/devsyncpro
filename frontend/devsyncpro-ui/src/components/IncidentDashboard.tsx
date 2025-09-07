import React, { useEffect, useState } from "react";

type Incident = {
  id: number;
  type: string;
  service: string;
  status: string;
  message: string;
  timestamp: string;
  severity?: string;
  warRoomUrl?: string;
};

export const IncidentDashboard: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [diag, setDiag] = useState<{ ids: number[], text: string } | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");

  useEffect(() => {
    fetchIncidents();
    const ws = new WebSocket("ws://localhost:8081/ws");
    ws.onmessage = evt => {
      const incident = JSON.parse(evt.data);
      setIncidents(curr => [incident, ...curr]);
    };
    return () => ws.close();
  }, []);

  function fetchIncidents() {
    setLoading(true);
    fetch("http://localhost:8081/incidents")
      .then(r => r.json())
      .then(data => {
        setIncidents(Array.isArray(data) ? [...data].reverse() : []);
        setLoading(false);
        setSelectedIds([]);
      })
      .catch(() => { setIncidents([]); setLoading(false); });
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleSelectAll(ev: React.ChangeEvent<HTMLInputElement>) {
    if (ev.target.checked)
      setSelectedIds(filtered.map(i => i.id));
    else
      setSelectedIds([]);
  }
  function bulkResolve() {
    selectedIds.forEach(id => resolveIncident(id, false));
    setActionMsg("Resolving selected incidents...");
    setTimeout(fetchIncidents, 700);
    setSelectedIds([]);
  }
  function bulkDiagnose() {
    Promise.all(selectedIds.map(id =>
      fetch("http://localhost:8081/diagnose", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      }).then(r => r.json().then(d => ({ id, fix: d.fix || "No suggestion" })))
    )).then(results => {
      setDiag({
        ids: results.map(r => r.id),
        text: results.map(r => `[${r.id}] ${r.fix}`).join("\n")
      });
    }).catch(() => setDiag({ ids: selectedIds, text: "Diagnosis failed" }));
  }
  function exportSelectedCSV() {
    const headers = ['id', 'type', 'service', 'status', 'severity', 'message', 'timestamp'];
    const sel = incidents.filter(i => selectedIds.includes(i.id));
    const rows = sel.map(i =>
      [String(i.id), i.type, i.service, i.status, i.severity || "", i.message, new Date(i.timestamp).toLocaleString()]);
    const csvRows = [headers, ...rows];
    let csv = csvRows
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "incidents-selected.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function resolveIncident(id: number, refresh = true) {
    fetch("http://localhost:8081/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    })
      .then(() => {
        setActionMsg("Incident resolved!");
        if (refresh) fetchIncidents();
        setTimeout(() => setActionMsg(null), 1500);
      })
      .catch(() => {
        setActionMsg("Error resolving incident!");
        setTimeout(() => setActionMsg(null), 1500);
      });
  }

  const filtered = filter === "all" ? incidents : incidents.filter(i => i.status === filter);

  return (
    <div style={{ padding: "2em" }}>
      <h2 style={{ color: "#ffe397" }}>Live Incident Dashboard</h2>
      <div style={{ marginBottom: 10 }}>
        <button disabled={!selectedIds.length} onClick={bulkResolve}>Bulk Resolve</button>
        <button disabled={!selectedIds.length} onClick={bulkDiagnose} style={{ marginLeft: 8 }}>Bulk Diagnose</button>
        <button disabled={!selectedIds.length} onClick={exportSelectedCSV} style={{ marginLeft: 8 }}>Export Selected CSV</button>
        <span style={{ marginLeft: 16, color: "#eee" }}>
          {selectedIds.length ? `${selectedIds.length} selected` : ""}
        </span>
      </div>
      <div style={{ display: "inline-block", marginBottom: 10 }}>
        <label>Status filter: </label>
        <select value={filter} onChange={e => setFilter(e.target.value as any)}>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>
      {actionMsg &&
        <div style={{
          background: "#23242b", color: actionMsg.includes("Error") ? "#e55" : "#5e5",
          padding: "6px 18px", borderRadius: 6, marginBottom: 10, display: "inline-block"
        }}>{actionMsg}</div>
      }
      {diag &&
        <div style={{
          background: "#1e2233", color: "#ffea90", padding: 16, margin: "8px 0",
          borderRadius: 8, maxWidth: 440, whiteSpace: "pre-wrap"
        }}>
          <b>Bulk Suggestion:</b>
          <br />{diag.text}
          <button style={{ float: "right" }} onClick={() => setDiag(null)}>✕</button>
        </div>
      }
      <table style={{
        color: "#fff", width: "100%", background: "#23242b",
        borderRadius: "10px", marginTop: "1em"
      }}>
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
            <th>ID</th>
            <th>Type</th>
            <th>Service</th>
            <th>Status</th>
            <th>Severity</th>
            <th>Message</th>
            <th>Time</th>
            <th>War Room</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={9} style={{ textAlign: "center", color: "#aaa" }}>Loading incidents...</td></tr>
          )}
          {filtered.length === 0 && !loading && (
            <tr>
              <td colSpan={9} style={{ textAlign: "center", color: "#aaa" }}>No incidents yet.</td>
            </tr>
          )}
          {filtered.map(inc => (
            <tr key={inc.id} style={{
              background:
                inc.status === "resolved"
                  ? "#183441"
                  : inc.status === "active"
                    ? "#392b1c"
                    : "#2c2323"
            }}>
              <td>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(inc.id)}
                  onChange={() => toggleSelect(inc.id)}
                />
              </td>
              <td>{inc.id}</td>
              <td>{inc.type}</td>
              <td>{inc.service}</td>
              <td style={{
                color: inc.status === "resolved" ? "#5e5" : inc.status === "active" ? "#ffe397" : "#e55"
              }}>{inc.status}</td>
              <td style={{
                color:
                  inc.severity === "critical"
                    ? "#ff3737"
                    : inc.severity === "major"
                      ? "#ffa500"
                      : "#46D7B7",
                fontWeight: inc.severity === "critical" ? "bold" : undefined
              }}>{inc.severity || ""}</td>
              <td>{inc.message}</td>
              <td>{new Date(inc.timestamp).toLocaleTimeString()}</td>
              <td>
                {(inc.severity === "critical" && inc.warRoomUrl) ? (
                  <a href={inc.warRoomUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "#00c6ff",
                      fontWeight: "bold",
                      background: "#1a257b",
                      padding: "3px 8px",
                      borderRadius: 4,
                      textDecoration: "none"
                    }}>
                    Join War Room
                  </a>
                ) : (
                  "-"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
