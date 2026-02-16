import React, { useEffect, useState } from "react";
import { CONFIG } from "../config";

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
  const [actionMsg, setActionMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [diag, setDiag] = useState<{ ids: number[], text: string } | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");

  useEffect(() => {
    fetchIncidents();
    const ws = new WebSocket(CONFIG.WS_URL);
    ws.onmessage = evt => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload && payload.id && payload.service) {
          setIncidents(curr => [payload as Incident, ...curr]);
        }
      } catch (e) { console.error("WS error:", e); }
    };
    return () => ws.close();
  }, []);

  function fetchIncidents() {
    setLoading(true);
    fetch(`${CONFIG.ORCHESTRATOR_API}/incidents`)
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

  function bulkResolve() {
    selectedIds.forEach(id => resolveIncident(id, false));
    setActionMsg({ text: "Applying resolution sequences...", type: 'success' });
    setTimeout(fetchIncidents, 700);
    setSelectedIds([]);
  }

  async function bulkDiagnose() {
    setActionMsg({ text: "AI Neural Analysis in progress...", type: 'success' });
    try {
      const results = await Promise.all(selectedIds.map(id => {
        const inc = incidents.find(i => i.id === id);
        return fetch(`${CONFIG.ANALYZER_API}/analyze`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id, type: inc?.type || "unknown", service: inc?.service || "unknown", message: inc?.message || ""
          })
        }).then(r => r.json().then(d => ({ id, fix: d.root_cause || "No suggestion" })))
      }));
      setDiag({
        ids: results.map(r => r.id),
        text: results.map(r => `[ID ${r.id}] ${r.fix}`).join("\n")
      });
      setActionMsg(null);
    } catch {
      setActionMsg({ text: "AI analysis failed. Neural link timeout.", type: 'error' });
    }
  }

  function resolveIncident(id: number, refresh = true) {
    fetch(`${CONFIG.ORCHESTRATOR_API}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    }).then(() => {
      if (refresh) fetchIncidents();
    });
  }

  const filtered = filter === "all" ? incidents : incidents.filter(i => i.status === filter);

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'var(--warning)',
      resolved: 'var(--success)',
      critical: 'var(--error)'
    };
    return (
      <span style={{
        padding: '2px 10px',
        borderRadius: '6px',
        fontSize: '0.75rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        background: `rgba(255,255,255,0.05)`,
        color: colors[status] || 'var(--text-dim)',
        border: `1px solid ${colors[status] || 'var(--text-dim)'}`
      }}>
        {status}
      </span>
    );
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h3 style={{ color: 'var(--primary)', margin: 0 }} className="glow-text">Incident Command Control</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button disabled={!selectedIds.length} onClick={bulkResolve} style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--success)', color: '#000', fontWeight: 600 }}>Bulk Resolve</button>
          <button disabled={!selectedIds.length} onClick={bulkDiagnose} style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--primary)', color: '#000', fontWeight: 600 }}>Bulk AI Diagnose</button>
        </div>
      </div>

      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Telemetry Filter:</span>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as any)}
          style={{
            background: 'var(--bg-slate)',
            color: '#fff',
            border: '1px solid var(--glass-border)',
            padding: '6px 12px',
            borderRadius: '8px',
            outline: 'none'
          }}
        >
          <option value="all">All Events</option>
          <option value="active">Active Anomaly</option>
          <option value="resolved">Resolved</option>
        </select>
        {actionMsg && (
          <span style={{ color: actionMsg.type === 'success' ? 'var(--success)' : 'var(--error)', fontSize: '0.85rem' }}>
            &bull; {actionMsg.text}
          </span>
        )}
      </div>

      {diag && (
        <div className="glass-panel animate-fade-in" style={{ padding: '20px', marginBottom: '24px', border: '1px solid var(--primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--primary)' }}>Neural Diagnostics:</strong>
            <button onClick={() => setDiag(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)' }}>✕</button>
          </div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', color: 'var(--text-main)' }}>{diag.text}</div>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
          <td style={{ padding: '16px' }}>{statusBadge(inc.status)}</td>
          <td style={{ padding: '16px' }}>
            <span style={{ color: inc.severity === 'critical' ? 'var(--error)' : inc.severity === 'major' ? 'var(--warning)' : 'var(--text-main)' }}>
              {inc.severity || 'normal'}
            </span>
          </td>
          <td style={{ padding: '16px', fontSize: '0.9rem', maxWidth: '300px' }}>{inc.message}</td>
          <td style={{ padding: '16px', borderRadius: '0 12px 12px 0' }}>
            {inc.severity === 'critical' && inc.warRoomUrl ? (
              <a href={inc.warRoomUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.85rem' }}>Neural Link →</a>
            ) : "-"}
          </td>
        </tr>
            ))}
      </tbody>
    </table>
      </div >
    </div >
  );
};
