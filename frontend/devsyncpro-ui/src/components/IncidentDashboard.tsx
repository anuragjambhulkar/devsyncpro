import React, { useEffect, useState } from "react";

type Incident = {
  id: number;
  type: string;
  service: string;
  status: string;
  message: string;
  timestamp: string;
};

export const IncidentDashboard: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    // Fetch all current incidents first
    fetch("http://localhost:8081/incidents")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setIncidents(data.reverse()); // Newest first
        } else {
          setIncidents([]); // Defensive: never set to null!
        }
      })
      .catch(() => setIncidents([]));

    // Live updates: subscribe to websocket
    const ws = new WebSocket("ws://localhost:8081/ws");
    ws.onmessage = (evt) => {
      const incident = JSON.parse(evt.data);
      setIncidents(curr => [incident, ...curr]);
    };
    return () => ws.close();
  }, []);

  return (
    <div style={{ padding: "2em" }}>
      <h2 style={{ color: "#ffe397" }}>Live Incident Dashboard</h2>
      <table style={{
        color: "#fff",
        width: "100%",
        background: "#23242b",
        borderRadius: "10px",
        marginTop: "1em"
      }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Type</th>
            <th>Service</th>
            <th>Status</th>
            <th>Message</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {incidents.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "#aaa" }}>
                No incidents yet.
              </td>
            </tr>
          )}
          {incidents.map(inc => (
            <tr key={inc.id} style={inc.status === "active" ? { background: "#392b1c" } : {}}>
              <td>{inc.id}</td>
              <td>{inc.type}</td>
              <td>{inc.service}</td>
              <td>{inc.status}</td>
              <td>{inc.message}</td>
              <td>{new Date(inc.timestamp).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
