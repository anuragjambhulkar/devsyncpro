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

  return (
    <div style={{ padding: 24 }}>
      <h2>System Metrics</h2>
      {loading ? (
        <div style={{ color: "#aaa" }}>Loading...</div>
      ) : (
        <ul style={{ fontSize: "1.2em" }}>
          <li>Daily Recurring Revenue: <b style={{ color: "#4caf50" }}>₹{metrics.daily_recurring_revenue || 0}</b></li>
          <li>Successful Conversions: <b>{metrics.payment_count || 0}</b></li>
          <li>Deployment Success Rate: <b>{Math.round((metrics.deploy_success_rate || 0) * 100)}%</b></li>
          <li>Incident Detection Time: <b>{metrics.incident_detection_time_s} sec</b></li>
          <li>API Latency: <b>{metrics.api_latency_ms} ms</b></li>
          <li>Blast Radius Max: <b>{metrics.max_blast_radius}</b></li>
        </ul>
      )}
    </div>
  );
};
