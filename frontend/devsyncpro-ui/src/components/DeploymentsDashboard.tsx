import React, { useEffect, useState } from "react";
import { CONFIG } from "../config";

type Deployment = {
  id: number;
  service: string;
  status: string;
  created: string;
};

export const DeploymentsDashboard: React.FC = () => {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchDeployments();
    const poll = setInterval(fetchDeployments, 5000);
    return () => clearInterval(poll);
  }, []);

  function fetchDeployments() {
    fetch(`${CONFIG.ORCHESTRATOR_API}/deployments`)
      .then(r => r.json())
      .then(data => setDeployments(Array.isArray(data) ? [...data].reverse() : []));
  }

  function startDeployment(service: string) {
    fetch(`${CONFIG.ORCHESTRATOR_API}/deployments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service })
    }).then(fetchDeployments);
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'var(--success)';
      case 'failed': return 'var(--error)';
      case 'running': return 'var(--primary)';
      default: return 'var(--text-dim)';
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h3 style={{ color: 'var(--primary)', margin: 0 }} className="glow-text">CI/CD Orchestration Hub</h3>
        <button
          onClick={() => startDeployment("repo-scanner")}
          style={{
            padding: '12px 24px',
            background: 'var(--primary)',
            color: '#000',
            fontWeight: 700,
            border: 'none',
            borderRadius: '12px'
          }}
        >
          Initiate Core Redeploy
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
        {deployments.map(dep => (
          <div key={dep.id} className="glass-panel" style={{ padding: '24px', borderLeft: `4px solid ${getStatusColor(dep.status)}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{dep.service}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>ID: #{dep.id.toString().padStart(4, '0')}</div>
              </div>
              <span style={{
                padding: '4px 12px',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: 700,
                background: 'rgba(255,255,255,0.05)',
                color: getStatusColor(dep.status),
                border: `1px solid ${getStatusColor(dep.status)}`
              }}>
                {dep.status.toUpperCase()}
              </span>
            </div>

            {dep.status === 'running' && (
              <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginBottom: '16px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: '60%',
                  background: 'var(--primary)',
                  boxShadow: '0 0 10px var(--primary)',
                  animation: 'pulse 1.5s infinite linear'
                }}></div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              <span>Sequence Start:</span>
              <span>{new Date(dep.created).toLocaleTimeString()}</span>
            </div>
          </div>
        ))}
      </div>

      {deployments.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-dim)', border: '1px dashed var(--glass-border)', borderRadius: '20px' }}>
          No orchestration sequences active. System stable.
        </div>
      )}
    </div>
  );
};
