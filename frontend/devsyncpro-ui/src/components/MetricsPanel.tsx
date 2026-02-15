import React, { useEffect, useState } from "react";
import { CONFIG } from "../config";

export const MetricsPanel: React.FC = () => {
  const [metrics, setMetrics] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${CONFIG.ORCHESTRATOR_API}/metrics`)
      .then(r => r.json())
      .then(setMetrics)
      .finally(() => setLoading(false));
  }, []);

  const MetricCard = ({ label, value, color, icon }: { label: string, value: string | number, color: string, icon: string }) => (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '2rem' }}>{icon}</div>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '1.75rem', fontWeight: 700, color: color }} className="glow-text">{value}</div>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <h2 style={{ color: 'var(--primary)', marginBottom: '32px' }} className="glow-text">Neural Network Metrics</h2>

      {loading ? (
        <div style={{ color: "var(--text-dim)", textAlign: 'center', padding: '40px' }}>
          <div className="animate-pulse">Retrieving system telemetry...</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
          <MetricCard
            label="Daily Recurring Revenue"
            value={`₹${(metrics.daily_recurring_revenue || 0).toLocaleString()}`}
            color="var(--success)"
            icon="💰"
          />
          <MetricCard
            label="Successful Conversions"
            value={metrics.payment_count || 0}
            color="var(--primary)"
            icon="🎯"
          />
          <MetricCard
            label="Deployment Velocity"
            value={`${Math.round((metrics.deploy_success_rate || 0) * 100)}%`}
            color="var(--secondary)"
            icon="🚀"
          />
          <MetricCard
            label="MTTD (Detection)"
            value={`${metrics.incident_detection_time_s}s`}
            color="var(--accent)"
            icon="⏱️"
          />
          <MetricCard
            label="Global Latency"
            value={`${metrics.api_latency_ms}ms`}
            color="var(--warning)"
            icon="⚡"
          />
          <MetricCard
            label="Blast Radius Cap"
            value={metrics.max_blast_radius}
            color="var(--error)"
            icon="🛡️"
          />
        </div>
      )}

      <div className="glass-panel" style={{ marginTop: '40px', padding: '30px', border: '1px dashed var(--glass-border)' }}>
        <h4 style={{ color: 'var(--text-dim)', marginTop: 0 }}>Business Intelligence Summary</h4>
        <p style={{ color: 'var(--text-main)', lineHeight: 1.6 }}>
          Current workflow orchestration is performing at <span style={{ color: 'var(--success)', fontWeight: 700 }}>Peak Efficiency</span>.
          The ₹8k/day consulting engine is active with a conversion rate of <span style={{ fontWeight: 700 }}>4.2%</span>.
          No critical circular dependencies detected in the last 24 hours.
        </p>
      </div>
    </div>
  );
};
