import React from "react";
import { render, screen } from "@testing-library/react";
import { IncidentDashboard } from "./IncidentDashboard";

test("renders dashboard header", () => {
  render(<IncidentDashboard />);
  expect(screen.getByText(/Live Incident Dashboard/i)).toBeInTheDocument();
});
