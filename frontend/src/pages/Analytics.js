import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useMonitoring } from "../MonitoringContext";

function Analytics() {
  const { tableData } = useMonitoring();

  const analytics = useMemo(() => {
    const totalProcessed = tableData.length;
    const passed = tableData.filter((item) => item.status === "OK").length;
    const failed = totalProcessed - passed;
    const accuracy =
      totalProcessed > 0 ? ((passed / totalProcessed) * 100).toFixed(1) : "0.0";

    const mismatchCounts = {
      "Weight mismatch": 0,
      "Dimension mismatch": 0,
      "Name mismatch": 0,
      "Missing in document": 0,
      Other: 0,
    };

    const timeBuckets = {};
    const sessionSummary = [];
    const weightDistribution = {
      "0-20": 0,
      "21-40": 0,
      "41-60": 0,
      "61-80": 0,
      "81+": 0,
    };

    tableData.forEach((item, index) => {
      const status = item.status || "";
      const time = item.time || "Unknown";

      if (!timeBuckets[time]) {
        timeBuckets[time] = { time, processed: 0, errors: 0 };
      }
      timeBuckets[time].processed += 1;
      if (status !== "OK") timeBuckets[time].errors += 1;

      if (status.includes("Weight mismatch")) {
        mismatchCounts["Weight mismatch"] += 1;
      } else if (
        status.includes("length mismatch") ||
        status.includes("width mismatch") ||
        status.includes("height mismatch") ||
        status.includes("Dimension mismatch")
      ) {
        mismatchCounts["Dimension mismatch"] += 1;
      } else if (status.includes("Name mismatch")) {
        mismatchCounts["Name mismatch"] += 1;
      } else if (status.includes("Missing in document")) {
        mismatchCounts["Missing in document"] += 1;
      } else if (status !== "OK") {
        mismatchCounts["Other"] += 1;
      }

      const weight = Number(item.weight || 0);
      if (weight <= 20) weightDistribution["0-20"] += 1;
      else if (weight <= 40) weightDistribution["21-40"] += 1;
      else if (weight <= 60) weightDistribution["41-60"] += 1;
      else if (weight <= 80) weightDistribution["61-80"] += 1;
      else weightDistribution["81+"] += 1;

      sessionSummary.push({
        session: `Run-${index + 1}`,
        id: item.id,
        status: item.status,
        time: item.time,
      });
    });

    const trendData = Object.values(timeBuckets);

    const mismatchData = Object.entries(mismatchCounts).map(([name, value]) => ({
      name,
      value,
    }));

    const passFailData = [
      { name: "Passed", value: passed },
      { name: "Failed", value: failed },
    ];

    const weightData = Object.entries(weightDistribution).map(([range, count]) => ({
      range,
      count,
    }));

    return {
      totalProcessed,
      passed,
      failed,
      accuracy,
      trendData,
      mismatchData,
      passFailData,
      sessionSummary: sessionSummary.slice(0, 12),
      weightData,
    };
  }, [tableData]);

  const pieColors = ["#16a34a", "#dc2626"];
  const mismatchColors = ["#2563eb", "#f59e0b", "#dc2626", "#7c3aed", "#64748b"];

  return (
    <div style={pageStyle}>
      <h1 style={titleStyle}>Analytics Dashboard</h1>

      <div style={kpiGridStyle}>
        <div style={cardStyle}>
          <div style={kpiLabelStyle}>Total Processed</div>
          <div style={kpiValueStyle}>{analytics.totalProcessed}</div>
        </div>

        <div style={cardStyle}>
          <div style={kpiLabelStyle}>Passed</div>
          <div style={{ ...kpiValueStyle, color: "#16a34a" }}>{analytics.passed}</div>
        </div>

        <div style={cardStyle}>
          <div style={kpiLabelStyle}>Failed</div>
          <div style={{ ...kpiValueStyle, color: "#dc2626" }}>{analytics.failed}</div>
        </div>

        <div style={cardStyle}>
          <div style={kpiLabelStyle}>Accuracy</div>
          <div style={kpiValueStyle}>{analytics.accuracy}%</div>
        </div>
      </div>

      <div style={chartGridStyle}>
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Items Processed Over Time</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={analytics.trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="processed" stroke="#2563eb" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Errors Over Time</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={analytics.trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="errors" stroke="#dc2626" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={chartGridStyle}>
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Mismatch Breakdown</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={analytics.mismatchData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" interval={0} angle={-10} textAnchor="end" height={60} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value">
                {analytics.mismatchData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={mismatchColors[index % mismatchColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Pass vs Fail Ratio</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={analytics.passFailData}
                dataKey="value"
                nameKey="name"
                outerRadius={90}
                label
              >
                {analytics.passFailData.map((entry, index) => (
                  <Cell key={`pie-${index}`} fill={pieColors[index % pieColors.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={chartGridStyle}>
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Weight Distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={analytics.weightData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#0ea5e9" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Recent Session Summary</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Session</th>
                  <th style={thStyle}>Item ID</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Time</th>
                </tr>
              </thead>
              <tbody>
                {analytics.sessionSummary.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={emptyTdStyle}>
                      No analytics data yet
                    </td>
                  </tr>
                ) : (
                  analytics.sessionSummary.map((row, index) => (
                    <tr key={index}>
                      <td style={tdStyle}>{row.session}</td>
                      <td style={tdStyle}>{row.id}</td>
                      <td
                        style={{
                          ...tdStyle,
                          color: row.status === "OK" ? "#16a34a" : "#dc2626",
                          fontWeight: 600,
                        }}
                      >
                        {row.status}
                      </td>
                      <td style={tdStyle}>{row.time}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const pageStyle = {
  padding: "24px",
  background: "#eef2f7",
  minHeight: "calc(100vh - 58px)",
  color: "#1f2933",
  fontFamily: '"Segoe UI", Arial, sans-serif',
};

const titleStyle = {
  marginBottom: "20px",
  fontSize: "28px",
  fontWeight: 700,
  color: "#0f172a",
};

const sectionTitleStyle = {
  marginBottom: "12px",
  fontSize: "16px",
  fontWeight: 600,
  color: "#334155",
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: "16px",
  marginBottom: "20px",
};

const chartGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "20px",
  marginBottom: "20px",
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: "12px",
  boxShadow: "0 4px 14px rgba(15, 23, 42, 0.06)",
  padding: "16px",
};

const kpiLabelStyle = {
  fontSize: "13px",
  color: "#64748b",
  marginBottom: "8px",
};

const kpiValueStyle = {
  fontSize: "28px",
  fontWeight: 700,
  color: "#1f2933",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle = {
  textAlign: "left",
  padding: "10px",
  fontSize: "12px",
  color: "#64748b",
  borderBottom: "1px solid #e2e8f0",
  background: "#f8fafc",
};

const tdStyle = {
  padding: "10px",
  fontSize: "13px",
  borderBottom: "1px solid #e2e8f0",
  color: "#1f2933",
};

const emptyTdStyle = {
  padding: "20px",
  textAlign: "center",
  color: "#94a3b8",
  fontStyle: "italic",
};

export default Analytics;