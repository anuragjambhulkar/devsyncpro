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
  const [msg, setMsg] = useState<string | null>(null);

  function launchDeploy(e?: React.FormEvent) {
    if (e) e.preventDefault();
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
      });
  }

  useEffect(() => {
    const poll = setInterval(() => {
      fetch("http://localhost:8081/deployments")
        .then(r => r.json())
        .then(data => setJobs(data.reverse()));
    }, 2000);
    return () => clearInterval(poll);
  }, []);

  return (
    <div style={{ padding: "2em" }}>
      <h2>Deployments Dashboard</h2>
      <form onSubmit={launchDeploy} style={{ marginBottom: 16 }}>
        <input value={service} onChange={e => setService(e.target.value)}
          required placeholder="Service name" style={{ marginRight: 8 }} />
        <button type="submit">Deploy</button>
        {msg && <span style={{ marginLeft: 15 }}>{msg}</span>}
      </form>
      <table style={{ width: "100%", color: "#fff", background: "#23242b", borderRadius: 10 }}>
        <thead>
          <tr>
            <th>ID</th><th>Service</th><th>Status</th><th>Created</th>
          </tr>
        </thead>
        <tbody>
          {jobs.length === 0 && (
            <tr><td colSpan={4} style={{ textAlign: "center" }}>No deployments yet.</td></tr>
          )}
          {jobs.map(j =>
            <tr key={j.id}>
              <td>{j.id}</td>
              <td>{j.service}</td>
              <td>{j.status}</td>
              <td>{new Date(j.created).toLocaleTimeString()}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
