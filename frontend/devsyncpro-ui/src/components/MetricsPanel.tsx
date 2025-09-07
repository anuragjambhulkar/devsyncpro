import React, { useEffect, useState } from "react";

export const MetricsPanel: React.FC = () => {
  const [metrics, setMetrics] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("http://localhost:8081/metrics")
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
        <ul style={{fontSize: "1.2em"}}>
          <li>Deployment Success Rate: <b>{Math.round((metrics.deploy_success_rate || 0) * 100)}%</b></li>
          <li>Incident Detection Time: <b>{metrics.incident_detection_time_s} sec</b></li>
          <li>API Latency: <b>{metrics.api_latency_ms} ms</b></li>
          <li>Blast Radius Max: <b>{metrics.max_blast_radius}</b></li>
        </ul>
      )}
    </div>
  );
};
