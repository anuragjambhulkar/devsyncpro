import React, { useState } from "react";
import { DependencyScannerPanel } from "./DependencyScannerPanel";
import { IncidentAddForm } from "./IncidentAddForm";
import { IncidentDashboard } from "./IncidentDashboard";
import { DeploymentsDashboard } from "./DeploymentsDashboard";
import { MetricsPanel } from "./MetricsPanel";

export const DashboardTabs: React.FC = () => {
  const [tab, setTab] = useState<"scanner" | "incidents" | "deployments" | "metrics">("scanner");

  const navItemStyle = (active: boolean) => ({
    padding: "12px 24px",
    borderRadius: "12px",
    cursor: "pointer",
    border: "none",
    fontSize: "15px",
    fontWeight: 600,
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    background: active ? "linear-gradient(135deg, var(--primary), var(--secondary))" : "transparent",
    color: active ? "#fff" : "var(--text-dim)",
    boxShadow: active ? "0 8px 20px rgba(56, 189, 248, 0.3)" : "none",
    margin: "0 4px"
  });

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "40px 20px" }} className="animate-fade-in">
      <header style={{ marginBottom: "50px", textAlign: "center" }}>
        <h1 className="glow-text" style={{
          fontSize: "3.5rem",
          fontWeight: 800,
          background: "linear-gradient(to right, var(--primary), var(--secondary), var(--accent))",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: "12px",
          letterSpacing: "-0.02em"
        }}>
          DevSyncPro
        </h1>
        <p style={{ color: "var(--text-dim)", fontSize: "1.25rem", fontWeight: 300 }}>
          High-Velocity Engineering Workflow Orchestration
        </p>
      </header>

      <nav className="glass-panel" style={{
        display: "inline-flex",
        justifyContent: "center",
        padding: "8px",
        marginBottom: "40px",
        position: "sticky",
        top: "20px",
        zIndex: 100,
        left: "50%",
        transform: "translateX(-50%)"
      }}>
        <button style={navItemStyle(tab === "scanner")} onClick={() => setTab("scanner")}>Scanner</button>
        <button style={navItemStyle(tab === "incidents")} onClick={() => setTab("incidents")}>Incidents</button>
        <button style={navItemStyle(tab === "deployments")} onClick={() => setTab("deployments")}>Deployments</button>
        <button style={navItemStyle(tab === "metrics")} onClick={() => setTab("metrics")}>Metrics</button>
      </nav>

      <main className="glass-panel" style={{
        padding: "40px",
        minHeight: "600px",
        background: "rgba(15, 23, 42, 0.6)"
      }}>
        {tab === "scanner" && <DependencyScannerPanel />}
        {tab === "incidents" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "40px" }}>
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
      </main>

      <footer style={{
        marginTop: "80px",
        padding: "40px",
        borderTop: "1px solid var(--glass-border)",
        textAlign: "center",
        color: "var(--text-dim)",
        fontSize: "0.9rem"
      }}>
        &copy; 2026 DevSyncPro &bull; Precision Engineered for Scale &bull; ₹8k Daily Value Engine
      </footer>
    </div>
  );
};
