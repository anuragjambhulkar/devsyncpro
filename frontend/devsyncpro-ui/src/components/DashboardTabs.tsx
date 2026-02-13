import React, { useState } from "react";
import { DependencyScannerPanel } from "./DependencyScannerPanel";
import { IncidentAddForm } from "./IncidentAddForm";
import { IncidentDashboard } from "./IncidentDashboard";
import { DeploymentsDashboard } from "./DeploymentsDashboard";
import { MetricsPanel } from "./MetricsPanel";

export const DashboardTabs: React.FC = () => {
  const [tab, setTab] = useState<"scanner" | "incidents" | "deployments" | "metrics">("scanner");

  const navItemStyle = (active: boolean) => ({
    padding: "10px 20px",
    borderRadius: "12px",
    cursor: "pointer",
    border: "none",
    fontSize: "15px",
    fontWeight: 600,
    transition: "all 0.3s ease",
    background: active ? "linear-gradient(135deg, #3a7bd5, #00d2ff)" : "transparent",
    color: active ? "#fff" : "#a0a0a0",
    boxShadow: active ? "0 4px 15px rgba(0, 210, 255, 0.3)" : "none",
  });

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px" }}>
      <header style={{ marginBottom: "40px", textAlign: "center" }}>
        <h1 style={{
          fontSize: "2.5rem",
          fontWeight: 800,
          background: "linear-gradient(to right, #00d2ff, #3a7bd5)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: "8px"
        }}>
          DevSyncPro
        </h1>
        <p style={{ color: "#707070", fontSize: "1.1rem" }}>Engineering Workflow Orchestration Platform</p>
      </header>

      <nav style={{
        display: "flex",
        justifyContent: "center",
        gap: "10px",
        background: "rgba(35, 36, 43, 0.5)",
        backdropFilter: "blur(10px)",
        padding: "8px",
        borderRadius: "16px",
        marginBottom: "32px",
        border: "1px solid rgba(255, 255, 255, 0.05)",
        position: "sticky",
        top: "20px",
        zIndex: 100
      }}>
        <button style={navItemStyle(tab === "scanner")} onClick={() => setTab("scanner")}>Scanner</button>
        <button style={navItemStyle(tab === "incidents")} onClick={() => setTab("incidents")}>Incidents</button>
        <button style={navItemStyle(tab === "deployments")} onClick={() => setTab("deployments")}>Deployments</button>
        <button style={navItemStyle(tab === "metrics")} onClick={() => setTab("metrics")}>Metrics</button>
      </nav>

      <div style={{
        background: "rgba(25, 26, 31, 0.4)",
        borderRadius: "24px",
        padding: "30px",
        minHeight: "500px",
        border: "1px solid rgba(255, 255, 255, 0.03)",
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)"
      }}>
        {tab === "scanner" && <DependencyScannerPanel />}
        {tab === "incidents" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "30px" }}>
            <div style={{ position: "sticky", top: "100px", height: "fit-content" }}>
              <IncidentAddForm />
            </div>
            <div>
              <IncidentDashboard />
            </div>
          </div>
        )}
        {tab === "deployments" && <DeploymentsDashboard />}
        {tab === "metrics" && <MetricsPanel />}
      </div>

      <footer style={{ marginTop: "60px", padding: "40px", borderTop: "1px solid rgba(255, 255, 255, 0.05)", textAlign: "center", color: "#505050" }}>
        &copy; 2026 DevSyncPro &bull; Cloud-Native CI/CD Orchestration
      </footer>
    </div>
  );
};
