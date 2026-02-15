import React, { useState } from "react";
import { CONFIG } from "../config";

export const IncidentAddForm: React.FC<{ onAdd?: () => void }> = ({ onAdd }) => {
  const [form, setForm] = useState<{ type: string; service: string; message: string; severity: string }>({
    type: "",
    service: "",
    message: "",
    severity: "major"
  });
  const [msg, setMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.type || !form.service || !form.message) {
      setMsg({ text: "All fields required", type: 'error' });
      return;
    }

    fetch(`${CONFIG.ORCHESTRATOR_API}/incidents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    })
      .then(async r => {
        if (r.ok) {
          setMsg({ text: "Incident documented in blockchain ledger.", type: 'success' });
          setForm({ type: "", service: "", message: "", severity: "major" });
          if (onAdd) onAdd();
        } else {
          setMsg({ text: "Submission failed: " + (await r.text()), type: 'error' });
        }
        setTimeout(() => setMsg(null), 3000);
      })
      .catch(err => {
        setMsg({ text: "Neural link error: " + (err?.message || err), type: 'error' });
        setTimeout(() => setMsg(null), 3000);
      });
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid var(--glass-border)',
    borderRadius: '12px',
    color: 'var(--text-main)',
    marginBottom: '16px',
    outline: 'none',
    transition: 'border-color 0.3s'
  };

  return (
    <div className="glass-panel" style={{ padding: '30px' }}>
      <h3 style={{ color: 'var(--secondary)', marginBottom: '24px' }}>Log New Incident</h3>
      <form onSubmit={handleSubmit}>
        <input
          name="type"
          value={form.type}
          onChange={handleChange}
          placeholder="Anomaly Type (e.g. Memory Leak)"
          required
          style={inputStyle}
        />
        <input
          name="service"
          value={form.service}
          onChange={handleChange}
          placeholder="Affected Microservice"
          required
          style={inputStyle}
        />
        <input
          name="message"
          value={form.message}
          onChange={handleChange}
          placeholder="Diagnostic Message"
          required
          style={inputStyle}
        />
        <select
          name="severity"
          value={form.severity}
          onChange={handleChange}
          style={inputStyle}
          required
        >
          <option value="minor">Minor Anomaly</option>
          <option value="major">Major Incident</option>
          <option value="critical">Critical System Failure</option>
        </select>

        <button type="submit" style={{
          width: '100%',
          padding: '14px',
          background: 'linear-gradient(135deg, var(--secondary), var(--accent))',
          color: '#fff',
          fontWeight: 700,
          border: 'none',
          borderRadius: '12px',
          boxShadow: '0 4px 15px rgba(129, 140, 248, 0.3)'
        }}>
          Deploy Repair Sequence
        </button>
      </form>

      {msg && (
        <div style={{
          marginTop: '20px',
          padding: '12px',
          borderRadius: '8px',
          textAlign: 'center',
          background: msg.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          color: msg.type === 'success' ? 'var(--success)' : 'var(--error)',
          border: `1px solid ${msg.type === 'success' ? 'var(--success)' : 'var(--error)'}`,
          fontSize: '0.9rem'
        }}>
          {msg.text}
        </div>
      )}
    </div>
  );
};
