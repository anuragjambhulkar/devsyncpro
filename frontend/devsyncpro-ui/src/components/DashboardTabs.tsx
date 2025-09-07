import React, { useState } from "react";
import { DependencyScannerPanel } from "./DependencyScannerPanel";
import { IncidentAddForm } from "./IncidentAddForm";
import { IncidentDashboard } from "./IncidentDashboard";
import { DeploymentsDashboard } from "./DeploymentsDashboard";
import { MetricsPanel } from "./MetricsPanel";

export const DashboardTabs: React.FC = () => {
  const [tab, setTab] = useState<
    "scanner" | "incidents" | "deployments" | "metrics"
  >("scanner");

  return (
    <div>
      <nav style={{
        display: "flex", gap: 12, background: "#23242b",
        padding: 9, borderRadius: 8, marginBottom: 16
      }}>
        <button onClick={() => setTab("scanner")}>Scanner</button>
        <button onClick={() => setTab("incidents")}>Incidents</button>
        <button onClick={() => setTab("deployments")}>Deployments</button>
        <button onClick={() => setTab("metrics")}>Metrics</button>
      </nav>
      <div style={{ marginTop: 10 }}>
        {tab === "scanner" && <DependencyScannerPanel />}
        {tab === "incidents" && (
          <>
            <IncidentAddForm />
            <IncidentDashboard />
          </>
        )}
        {tab === "deployments" && <DeploymentsDashboard />}
        {tab === "metrics" && <MetricsPanel />}
      </div>
    </div>
  );
};
