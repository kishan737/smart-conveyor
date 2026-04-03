import React, { useMemo } from "react";
import { useMonitoring } from "../MonitoringContext";

// ── Helper functions ──────────────────────────────────────────────────────────

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return isNaN(n) ? fallback : n;
}

function getMismatchCounts(rows) {
  const counts = {
    "Missing in document": 0,
    "Weight mismatch":     0,
    "Volume mismatch":     0,
    "HS mismatch":         0,
    "Type mismatch":       0,
    "Name mismatch":       0,
    "Other":               0,
  };
  rows.forEach((row) => {
    const s = row.status || "";
    if (s === "OK") return;
    if (s.includes("Missing in document")) counts["Missing in document"] += 1;
    else if (s.includes("Weight mismatch")) counts["Weight mismatch"]    += 1;
    else if (s.includes("Volume mismatch")) counts["Volume mismatch"]    += 1;
    else if (s.includes("HS mismatch"))     counts["HS mismatch"]        += 1;
    else if (s.includes("Type mismatch"))   counts["Type mismatch"]      += 1;
    else if (s.includes("Name mismatch"))   counts["Name mismatch"]      += 1;
    else                                    counts["Other"]              += 1;
  });
  return counts;
}

function getSeverity(status) {
  if (!status || status === "OK") return null;
  if (status.includes("Missing in document")) return "High";
  const reasons = [
    "Weight mismatch", "Volume mismatch", "HS mismatch",
    "Type mismatch", "Name mismatch",
  ].filter((r) => status.includes(r));
  if (reasons.length >= 2) return "High";
  if (status.includes("HS mismatch") || status.includes("Type mismatch")) return "Medium";
  return "Low";
}

function groupByTime(rows) {
  const buckets = {};
  rows.forEach((row) => {
    const t = row.time || "Unknown";
    if (!buckets[t]) buckets[t] = { time: t, processed: 0, failed: 0 };
    buckets[t].processed += 1;
    if (row.status && row.status !== "OK") buckets[t].failed += 1;
  });
  return Object.values(buckets);
}

function getCargoTypeDistribution(rows) {
  const counts = {};
  rows.forEach((row) => {
    const ct = (row.cargo_type || "").trim();
    if (!ct) return;
    counts[ct] = (counts[ct] || 0) + 1;
  });
  const total = rows.length || 1;
  return Object.entries(counts)
    .map(([type, count]) => ({ type, count, pct: ((count / total) * 100).toFixed(1) }))
    .sort((a, b) => b.count - a.count);
}

function getHsCodeDistribution(rows) {
  const counts = {};
  rows.forEach((row) => {
    const hs = (row.hs_code || "").trim();
    if (!hs) return;
    counts[hs] = (counts[hs] || 0) + 1;
  });
  const total = rows.length || 1;
  return Object.entries(counts)
    .map(([code, count]) => ({ code, count, pct: ((count / total) * 100).toFixed(1) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

// ── Severity color helpers ────────────────────────────────────────────────────

const SEVERITY_COLOR = {
  High:   { bg: "rgba(220,38,38,0.08)",   border: "#fca5a5", text: "#dc2626" },
  Medium: { bg: "rgba(234,179,8,0.08)",   border: "#fde68a", text: "#b45309" },
  Low:    { bg: "rgba(148,163,184,0.08)", border: "#cbd5e1", text: "#475569" },
};

const MISMATCH_COLORS = [
  "#dc2626", "#2563eb", "#7c3aed",
  "#d97706", "#0891b2", "#64748b", "#94a3b8",
];

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, color, accent }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #dbe3ee",
      borderLeft: `3px solid ${accent || "#dbe3ee"}`,
      borderRadius: "10px",
      padding: "14px 16px",
      boxShadow: "0 2px 8px rgba(15,23,42,0.05)",
    }}>
      <div style={{ fontSize: "11px", color: "#64748b", letterSpacing: "0.06em",
                    textTransform: "uppercase", marginBottom: "6px" }}>
        {label}
      </div>
      <div style={{ fontSize: "26px", fontWeight: 700, color: color || "#1f2933",
                    lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em",
                  textTransform: "uppercase", color: "#64748b", marginBottom: "14px" }}>
      {children}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #dbe3ee",
      borderRadius: "12px",
      padding: "18px 20px",
      boxShadow: "0 3px 12px rgba(15,23,42,0.05)",
      ...style,
    }}>
      {children}
    </div>
  );
}

function EmptyState({ text = "No analytics available yet." }) {
  return (
    <div style={{ padding: "28px", textAlign: "center", color: "#94a3b8",
                  fontStyle: "italic", fontSize: "13px" }}>
      {text}
    </div>
  );
}

// Inline bar — used for CSS-based bar charts (no library required)
function InlineBar({ value, max, color = "#2563eb", height = 8 }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ background: "#f1f5f9", borderRadius: "4px", height, overflow: "hidden", flex: 1 }}>
      <div style={{
        width: `${pct}%`, height: "100%",
        background: color, borderRadius: "4px",
        transition: "width 0.4s ease",
        minWidth: value > 0 ? "4px" : 0,
      }} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function Analytics() {
  const { tableData } = useMonitoring();

  const data = useMemo(() => {
    const total   = tableData.length;
    const passed  = tableData.filter((r) => r.status === "OK").length;
    const failed  = total - passed;
    const accuracy = total > 0 ? ((passed / total) * 100).toFixed(1) : "0.0";

    const totalWeight = tableData.reduce((s, r) => s + safeNumber(r.weight), 0);
    const totalVolume = tableData.reduce((s, r) => s + safeNumber(r.volume), 0);
    const avgWeight   = total > 0 ? (totalWeight / total).toFixed(2) : "0.00";
    const avgVolume   = total > 0 ? (totalVolume / total).toFixed(3) : "0.000";

    const mismatchCounts   = getMismatchCounts(tableData);
    const throughput       = groupByTime(tableData);
    const cargoTypeDist    = getCargoTypeDistribution(tableData);
    const hsCodeDist       = getHsCodeDistribution(tableData);

    const highRisk = tableData
      .filter((r) => r.status && r.status !== "OK")
      .slice(0, 10)
      .map((r) => ({ ...r, severity: getSeverity(r.status) }));

    return {
      total, passed, failed, accuracy,
      totalWeight: totalWeight.toFixed(2),
      totalVolume: totalVolume.toFixed(3),
      avgWeight, avgVolume,
      mismatchCounts,
      throughput,
      cargoTypeDist,
      hsCodeDist,
      highRisk,
    };
  }, [tableData]);

  const mismatchEntries = Object.entries(data.mismatchCounts);
  const maxMismatch     = Math.max(...mismatchEntries.map(([, v]) => v), 1);
  const maxCargo        = data.cargoTypeDist.length > 0 ? data.cargoTypeDist[0].count : 1;

  return (
    <div style={{
      padding: "24px",
      background: "#eef2f7",
      minHeight: "calc(100vh - 58px)",
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: "#1f2933",
    }}>
      {/* ── Title ── */}
      <div style={{ marginBottom: "22px" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.14em",
                      textTransform: "uppercase", color: "#94a3b8", marginBottom: "4px" }}>
          Operations
        </div>
        <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
          Analytics
        </h1>
      </div>

      {/* ── Row 1: Verification KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px",
                    marginBottom: "14px" }}>
        <KpiCard label="Total Processed" value={data.total}          accent="#2563eb" />
        <KpiCard label="Passed"          value={data.passed}         accent="#16a34a" color="#16a34a" />
        <KpiCard label="Failed"          value={data.failed}         accent="#dc2626" color="#dc2626" />
        <KpiCard label="Accuracy"        value={`${data.accuracy}%`} accent="#0891b2" />
      </div>

      {/* ── Row 2: Operational totals ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px",
                    marginBottom: "20px" }}>
        <KpiCard label="Total Weight (kg)"    value={data.totalWeight} accent="#64748b" />
        <KpiCard label="Total Volume (m³)"    value={data.totalVolume} accent="#64748b" />
        <KpiCard label="Avg Weight / Item"    value={`${data.avgWeight} kg`}  accent="#94a3b8" />
        <KpiCard label="Avg Volume / Item"    value={`${data.avgVolume} m³`}  accent="#94a3b8" />
      </div>

      {/* ── Row 3: Mismatch breakdown + Cargo type distribution ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px",
                    marginBottom: "18px" }}>

        {/* Mismatch breakdown */}
        <Card>
          <SectionTitle>Mismatch Breakdown</SectionTitle>
          {data.failed === 0 ? (
            <EmptyState text="No mismatches recorded." />
          ) : (
            <div>
              {mismatchEntries.map(([label, count], i) => {
                const pct = data.failed > 0
                  ? ((count / data.failed) * 100).toFixed(0)
                  : 0;
                return (
                  <div key={label} style={{ marginBottom: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                                  marginBottom: "4px", fontSize: "12px" }}>
                      <span style={{ color: "#334155", fontWeight: count > 0 ? 600 : 400 }}>
                        {label}
                      </span>
                      <span style={{ color: count > 0 ? MISMATCH_COLORS[i % MISMATCH_COLORS.length] : "#cbd5e1",
                                     fontWeight: 600 }}>
                        {count}
                        {count > 0 && (
                          <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: "4px" }}>
                            ({pct}%)
                          </span>
                        )}
                      </span>
                    </div>
                    <InlineBar
                      value={count}
                      max={maxMismatch}
                      color={count > 0 ? MISMATCH_COLORS[i % MISMATCH_COLORS.length] : "#e2e8f0"}
                      height={6}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Cargo type distribution */}
        <Card>
          <SectionTitle>Cargo Type Distribution</SectionTitle>
          {data.cargoTypeDist.length === 0 ? (
            <EmptyState text="No cargo type data yet." />
          ) : (
            <div>
              {data.cargoTypeDist.map((item, i) => {
                const palette = ["#2563eb","#16a34a","#d97706","#7c3aed","#0891b2","#dc2626","#64748b"];
                const col = palette[i % palette.length];
                return (
                  <div key={item.type} style={{ marginBottom: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                                  marginBottom: "4px", fontSize: "12px" }}>
                      <span style={{ color: "#334155", fontWeight: 600,
                                     textTransform: "capitalize" }}>
                        {item.type}
                      </span>
                      <span style={{ color: col, fontWeight: 600 }}>
                        {item.count}
                        <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: "4px" }}>
                          ({item.pct}%)
                        </span>
                      </span>
                    </div>
                    <InlineBar value={item.count} max={maxCargo} color={col} height={6} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── Row 4: High-risk items table ── */}
      <Card style={{ marginBottom: "18px" }}>
        <SectionTitle>High-Risk Items</SectionTitle>
        {data.highRisk.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "#16a34a",
                        fontSize: "13px", fontWeight: 600 }}>
            ✓ No flagged items — all verified items passed.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["ID", "Name", "Cargo Type", "HS Code", "Issue", "Severity"].map((h) => (
                    <th key={h} style={{
                      textAlign: "left", padding: "8px 10px", fontSize: "11px",
                      color: "#64748b", borderBottom: "1px solid #e2e8f0",
                      background: "#f8fafc", letterSpacing: "0.06em",
                      textTransform: "uppercase", fontWeight: 700,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.highRisk.map((row, i) => {
                  const sev = row.severity;
                  const sc  = SEVERITY_COLOR[sev] || SEVERITY_COLOR["Low"];
                  return (
                    <tr key={row.id + i}
                        style={{ borderBottom: "1px solid #f1f5f9",
                                 background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                      <td style={td}>{row.id || "—"}</td>
                      <td style={{ ...td, maxWidth: "140px", overflow: "hidden",
                                   textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.name || "—"}
                      </td>
                      <td style={td}>{row.cargo_type || "—"}</td>
                      <td style={td}>{row.hs_code || "—"}</td>
                      <td style={{ ...td, color: "#dc2626", maxWidth: "200px",
                                   overflow: "hidden", textOverflow: "ellipsis",
                                   whiteSpace: "nowrap" }}>
                        {row.status}
                      </td>
                      <td style={td}>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "10px",
                          fontSize: "11px",
                          fontWeight: 700,
                          background: sc.bg,
                          border: `1px solid ${sc.border}`,
                          color: sc.text,
                          letterSpacing: "0.04em",
                        }}>
                          {sev}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Row 5: Throughput over time + HS code distribution ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px",
                    marginBottom: "18px" }}>

        {/* Throughput over time */}
        <Card>
          <SectionTitle>Throughput Over Time</SectionTitle>
          {data.throughput.length === 0 ? (
            <EmptyState text="No throughput data yet." />
          ) : (
            <div style={{ overflowY: "auto", maxHeight: "320px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Time", "Processed", "Failed", "Pass Rate"].map((h) => (
                      <th key={h} style={{
                        position: "sticky", top: 0, zIndex: 1,
                        textAlign: "left", padding: "7px 10px", fontSize: "11px",
                        color: "#64748b", borderBottom: "1px solid #e2e8f0",
                        background: "#f8fafc", letterSpacing: "0.06em",
                        textTransform: "uppercase", fontWeight: 700,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.throughput.map((row, i) => {
                    const passRate = row.processed > 0
                      ? (((row.processed - row.failed) / row.processed) * 100).toFixed(0)
                      : "100";
                    const isBad = row.failed > 0;
                    return (
                      <tr key={row.time + i}
                          style={{ borderBottom: "1px solid #f1f5f9",
                                   background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                        <td style={{ ...td, color: "#475569", fontVariantNumeric: "tabular-nums" }}>
                          {row.time}
                        </td>
                        <td style={{ ...td, fontWeight: 600 }}>{row.processed}</td>
                        <td style={{ ...td, color: isBad ? "#dc2626" : "#16a34a",
                                     fontWeight: isBad ? 700 : 400 }}>
                          {row.failed}
                        </td>
                        <td style={td}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <InlineBar
                              value={parseInt(passRate)}
                              max={100}
                              color={parseInt(passRate) >= 90 ? "#16a34a" :
                                     parseInt(passRate) >= 70 ? "#d97706" : "#dc2626"}
                              height={6}
                            />
                            <span style={{ fontSize: "11px", color: "#64748b",
                                           minWidth: "34px", textAlign: "right" }}>
                              {passRate}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Top HS codes */}
        <Card>
          <SectionTitle>Top HS Codes</SectionTitle>
          {data.hsCodeDist.length === 0 ? (
            <EmptyState text="No HS code data available." />
          ) : (
            <div>
              {data.hsCodeDist.map((item) => {
                const maxHs = data.hsCodeDist[0]?.count || 1;
                return (
                  <div key={item.code} style={{ marginBottom: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                                  alignItems: "baseline", marginBottom: "5px" }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: "14px",
                                       color: "#1f2933", marginRight: "6px" }}>
                          {item.code}
                        </span>
                        <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                          Chapter {item.code.slice(0, 2)}
                        </span>
                      </div>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "#2563eb" }}>
                        {item.count}
                        <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: "4px" }}>
                          ({item.pct}%)
                        </span>
                      </span>
                    </div>
                    <InlineBar value={item.count} max={maxHs} color="#2563eb" height={7} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── Shared cell style ─────────────────────────────────────────────────────────

const td = {
  padding: "8px 10px",
  fontSize: "12px",
  color: "#1f2933",
};

export default Analytics;
