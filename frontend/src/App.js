import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { MonitoringProvider } from "./MonitoringContext";
import LiveMonitor from "./pages/LiveMonitor";

import Analytics from "./pages/Analytics";

function App() {
  return (
    <MonitoringProvider>
      <Router>
        <div style={{ fontFamily: "Arial", minHeight: "100vh", background: "#eef2f7" }}>
          <div style={headerStyle}>
            <div style={brandStyle}>Port Knights</div>

            <div style={navStyle}>
              <Link to="/" style={linkStyle}>Live Monitor</Link>
           
              <Link to="/analytics" style={linkStyle}>Analytics</Link>
            </div>
          </div>

          <Routes>
            <Route path="/" element={<LiveMonitor />} />
           
            <Route path="/analytics" element={<Analytics />} />
          </Routes>
        </div>
      </Router>
    </MonitoringProvider>
  );
}

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 24px",
  background: "#cbd5e1",
  borderBottom: "1px solid #b6c2d2",
  boxShadow: "0 2px 8px rgba(15, 23, 42, 0.08)",
};

const brandStyle = {
  fontWeight: "700",
  fontSize: "18px",
  color: "#0f172a",
  letterSpacing: "0.04em",
};

const navStyle = {
  display: "flex",
  gap: "24px",
};

const linkStyle = {
  color: "#0f172a",
  textDecoration: "none",
  fontWeight: "600",
  fontSize: "14px",
};

export default App;
