import React from "react";
import { DashboardTabs } from "./components/DashboardTabs";

function App() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#181a20",
      color: "#FAFAFA",
      padding: "2em 0",
      fontFamily: "Segoe UI,Roboto,Arial,sans-serif"
    }}>
      <DashboardTabs />
    </div>
  );
}

export default App;
