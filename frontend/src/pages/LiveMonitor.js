import React, { useEffect, useRef, useState } from "react";
import { useMonitoring } from "../MonitoringContext";

function LiveMonitor() {
  const {
    excelData,
    setExcelData,
    tableData,
    isRunning,
    setIsRunning,
    handleFile,
    resetBackend,
    conveyorRenderItems,
    trackRef,
  } = useMonitoring();

  const [pdfStatus, setPdfStatus] = useState("");
  const [excelFileName, setExcelFileName] = useState("");
  const excelInputRef = useRef(null);
  const pdfInputRef = useRef(null);

  const total = tableData.length;
  const okCount = tableData.filter((r) => r.status === "OK").length;
  const errorCount = total - okCount;

  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      * { box-sizing: border-box; margin: 0; padding: 0; }

      body, html {
        overflow: hidden;
        height: 100%;
        font-family: "Segoe UI", Arial, sans-serif;
        background: #eef2f7;
        color: #1f2933;
      }

      .app-root {
        display: flex;
        flex-direction: column;
        height: calc(100vh - 58px);
        padding: 10px 16px 16px;
        gap: 8px;
      }

      .header-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
        padding: 8px 12px;
        background: #cbd5e1;
        border: 1px solid #b6c2d2;
        border-radius: 10px;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
      }

      .header-title {
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.06em;
        color: #0f172a;
        text-transform: uppercase;
      }

      .header-controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .file-input {
        font-size: 11px;
        color: #475569;
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 4px 8px;
        cursor: pointer;
      }

      .file-input::file-selector-button {
        font-size: 11px;
        background: #e2e8f0;
        color: #0f172a;
        border: none;
        border-radius: 4px;
        padding: 3px 8px;
        margin-right: 6px;
        cursor: pointer;
      }

      .ctrl-btn {
        padding: 4px 12px;
        font-size: 11px;
        font-weight: 600;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        color: #fff;
        letter-spacing: 0.04em;
        box-shadow: 0 2px 6px rgba(15, 23, 42, 0.12);
      }

      .ctrl-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .status-pill {
        font-size: 11px;
        font-weight: 600;
        padding: 3px 10px;
        border-radius: 12px;
        letter-spacing: 0.04em;
      }

      .stats-row {
        display: flex;
        gap: 8px;
        flex-shrink: 0;
      }

      .stat-card {
        flex: 1;
        padding: 8px 12px;
        background: #ffffff;
        border: 1px solid #dbe3ee;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 600;
        color: #64748b;
        display: flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 3px 10px rgba(15, 23, 42, 0.06);
      }

      .stat-card span.val {
        font-size: 16px;
        font-weight: 700;
      }

      .stat-card.ok  { border-left: 3px solid #16a34a; }
      .stat-card.err { border-left: 3px solid #dc2626; }
      .stat-card.tot { border-left: 3px solid #2563eb; }

      .table-panel {
        flex: 1 1 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        background: #ffffff;
        border: 1px solid #dbe3ee;
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
      }

      .panel-label {
        flex-shrink: 0;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #64748b;
        padding: 6px 12px;
        border-bottom: 1px solid #e2e8f0;
        background: #f8fafc;
      }

      .table-scroll {
        flex: 1 1 0;
        overflow-y: auto;
        overflow-x: hidden;
      }

      .table-scroll::-webkit-scrollbar { width: 5px; }
      .table-scroll::-webkit-scrollbar-track { background: #f8fafc; }
      .table-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      .table-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
        table-layout: fixed;
      }

      thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: #f8fafc;
        color: #6b7280;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        padding: 6px 10px;
        text-align: left;
        border-bottom: 1px solid #e2e8f0;
      }

      tbody tr {
        border-bottom: 1px solid #e2e8f0;
        transition: background 0.15s;
      }

      tbody tr:hover { background: #eef4fb; }
      tbody tr.row-ok  { background: transparent; }
      tbody tr.row-err { background: rgba(220, 38, 38, 0.05); }

      tbody td {
        padding: 5px 10px;
        color: #1f2933;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      td.status-ok  { color: #16a34a; font-weight: 700; }
      td.status-err { color: #dc2626; font-weight: 700; }
      td.col-time   { color: #6b7280; font-size: 11px; }

      @keyframes rowIn {
        from { opacity: 0; background: rgba(37, 99, 235, 0.08); }
        to   { opacity: 1; }
      }

      tbody tr.row-new { animation: rowIn 0.5s ease forwards; }

      .conveyor-panel {
        flex-shrink: 0;
        min-height: 130px;
        background: #ffffff;
        border: 1px solid #dbe3ee;
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
      }

      .conveyor-track-wrap {
        flex: 1;
        position: relative;
        overflow: hidden;
        padding: 8px 12px 26px;
      }

      .conveyor-counter {
        position: absolute;
        top: 6px;
        right: 10px;
        font-size: 10px;
        color: #9ca3af;
        font-weight: 600;
        letter-spacing: 0.04em;
        z-index: 2;
      }

      .belt-stripe {
        position: absolute;
        bottom: 6px;
        left: 0;
        right: 0;
        height: 18px;
        background-image: repeating-linear-gradient(
          90deg,
          #cfd8e3 0px, #cfd8e3 24px,
          #e7edf5 24px, #e7edf5 40px
        );
        background-size: 40px 100%;
        border-top: 1px solid #d6dee8;
      }

      @keyframes beltMove {
        from { background-position: 0 0; }
        to   { background-position: -40px 0; }
      }

      .belt-box {
        position: absolute;
        bottom: 30px;
        left: 0;
        width: 58px;
        display: flex;
        flex-direction: column;
        align-items: center;
        will-change: transform;
      }

      .belt-box-inner {
        width: 54px;
        height: 48px;
        border-radius: 5px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        line-height: 1.3;
      }

      .belt-box-inner.ok {
        background: linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%);
        border: 1px solid #16a34a;
        color: #15803d;
        box-shadow: 0 6px 14px rgba(22, 163, 74, 0.14);
      }

      .belt-box-inner.err {
        background: linear-gradient(180deg, #fef2f2 0%, #fee2e2 100%);
        border: 1px solid #dc2626;
        color: #b91c1c;
        box-shadow: 0 6px 14px rgba(220, 38, 38, 0.14);
      }

      .belt-box-id {
        font-size: 9px;
        margin-top: 2px;
        opacity: 0.8;
        max-width: 52px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .belt-box-shadow {
        width: 48px;
        height: 5px;
        background: rgba(15, 23, 42, 0.18);
        border-radius: 50%;
        margin-top: 7px;
        filter: blur(1.5px);
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const handlePdfUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }
    try {
      setPdfStatus("Uploading PDFs...");
      const res = await fetch("https://smart-conveyor-copy-production.up.railway.app/upload-pdfs", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.error) {
        setPdfStatus(`PDF upload failed: ${data.error}`);
        return;
      }
      setPdfStatus(`PDF reference loaded: ${data.items_extracted} items`);
      setExcelFileName(data.excel_file || "");
      setExcelData(data.data || []);
    } catch (err) {
      console.error(err);
      setPdfStatus("Failed to upload PDFs");
    }
  };

  return (
    <div className="app-root">
      {/* ── Header ── */}
      <div className="header-bar">
        <span className="header-title">Port Knights</span>
        <div className="header-controls">

          {/* Hidden Excel input */}
          <input
            ref={excelInputRef}
            type="file"
            className="file-input"
            style={{ display: "none" }}
            onChange={handleFile}
          />

          {/* View Excel — only shown when a reference file exists */}
          {excelFileName && (
            <button
              style={{
                marginRight: "8px",
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                cursor: "pointer",
                fontSize: "12px",
              }}
              onClick={() => {
                window.open(
                  `https://smart-conveyor-copy-production.up.railway.app/download-excel/${excelFileName}`,
                  "_blank"
                );
              }}
            >
              📄 View Excel
            </button>
          )}

          {/* Choose Excel */}
          <button
            onClick={() => excelInputRef.current.click()}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              background: "#f1f5f9",
              cursor: "pointer",
            }}
          >
            📊 Choose Excel
          </button>

          {/* Hidden PDF input */}
          <input
            ref={pdfInputRef}
            type="file"
            className="file-input"
            accept=".pdf,application/pdf"
            multiple
            style={{ display: "none" }}
            onChange={handlePdfUpload}
          />

          {/* Choose PDFs */}
          <button
            onClick={() => pdfInputRef.current.click()}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              background: "#f1f5f9",
              cursor: "pointer",
            }}
          >
            📄 Choose PDFs
          </button>

          {/* START */}
          <button
            className="ctrl-btn"
            onClick={() => setIsRunning(true)}
            disabled={excelData.length === 0}
            style={{ background: "#16a34a" }}
          >
            ▶ START
          </button>

          {/* PAUSE */}
          <button
            className="ctrl-btn"
            onClick={() => setIsRunning(false)}
            style={{ background: "#d97706" }}
          >
            ⏸ PAUSE
          </button>

          {/* RESET */}
          <button
            className="ctrl-btn"
            onClick={resetBackend}
            style={{ background: "#dc2626" }}
          >
            ↺ RESET
          </button>

          {/* Running / Idle pill */}
          <span
            className="status-pill"
            style={{
              background: isRunning
                ? "rgba(22,163,74,0.12)"
                : "rgba(220,38,38,0.08)",
              color: isRunning ? "#16a34a" : "#dc2626",
              border: `1px solid ${isRunning ? "#16a34a" : "#dc2626"}`,
            }}
          >
            {isRunning ? "● RUNNING" : "○ IDLE"}
          </span>
        </div>
      </div>

      {/* ── PDF status banner ── */}
      {pdfStatus && (
        <div
          style={{
            fontSize: "11px",
            color: "#475569",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            padding: "6px 10px",
            marginTop: "6px",
          }}
        >
          {pdfStatus}
        </div>
      )}

      {/* ── Summary cards ── */}
      <div className="stats-row">
        <div className="stat-card tot">
          <span>TOTAL</span>
          <span className="val" style={{ color: "#2563eb" }}>{total}</span>
        </div>
        <div className="stat-card ok">
          <span>PASSED</span>
          <span className="val" style={{ color: "#16a34a" }}>{okCount}</span>
        </div>
        <div className="stat-card err">
          <span>FAILED</span>
          <span className="val" style={{ color: "#dc2626" }}>{errorCount}</span>
        </div>
        <div className="stat-card" style={{ borderLeft: "3px solid #94a3b8" }}>
          <span>DOC ROWS</span>
          <span className="val" style={{ color: "#6b7280" }}>{excelData.length}</span>
        </div>
      </div>

      {/* ── Inspection log table ── */}
      <div className="table-panel">
        <div className="panel-label">Inspection Log — latest first</div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: "9%" }}>ID</th>
                <th style={{ width: "18%" }}>Name</th>
                <th style={{ width: "11%" }}>Cargo Type</th>
                <th style={{ width: "10%" }}>Weight (kg)</th>
                <th style={{ width: "10%" }}>Volume (m³)</th>
                <th style={{ width: "9%" }}>HS Code</th>
                <th style={{ width: "21%" }}>Status</th>
                <th style={{ width: "12%" }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {tableData.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      textAlign: "center",
                      padding: "20px",
                      color: "#9ca3af",
                      fontStyle: "italic",
                      fontSize: "11px",
                    }}
                  >
                    No data yet — upload reference data and press START
                  </td>
                </tr>
              ) : (
                tableData.map((row, index) => (
                  <tr
                    key={row.id + row.time}
                    className={`${row.status === "OK" ? "row-ok" : "row-err"} ${
                      index === 0 ? "row-new" : ""
                    }`}
                  >
                    <td>{row.id}</td>
                    <td>{row.name}</td>
                    <td>{row.cargo_type ?? ""}</td>
                    <td>{row.weight != null ? Number(row.weight).toFixed(2) : ""}</td>
                    <td>{row.volume != null ? Number(row.volume).toFixed(4) : ""}</td>
                    <td>{row.hs_code ?? ""}</td>
                    <td className={row.status === "OK" ? "status-ok" : "status-err"}>
                      {row.status === "OK" ? "✓ OK" : `✗ ${row.status}`}
                    </td>
                    <td className="col-time">{row.time}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Conveyor belt ── */}
      <div className="conveyor-panel">
        <div className="panel-label">Conveyor Belt — live feed</div>
        <div className="conveyor-track-wrap" ref={trackRef}>
          <div
            className="belt-stripe"
            style={{
              animation: isRunning ? "beltMove 0.5s linear infinite" : "none",
            }}
          />

          <span className="conveyor-counter">
            {conveyorRenderItems.length} on belt
          </span>

          {conveyorRenderItems.length === 0 && (
            <span
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -60%)",
                fontSize: "11px",
                color: "#9ca3af",
                fontStyle: "italic",
                pointerEvents: "none",
              }}
            >
              Waiting for items…
            </span>
          )}

          {conveyorRenderItems.map((item) => (
            <div
              className="belt-box"
              key={item.uid}
              style={{ transform: `translateX(${item.x}px)` }}
            >
              <div
                className={`belt-box-inner ${
                  item.status === "OK" ? "ok" : "err"
                }`}
              >
                <span>{item.status === "OK" ? "✓" : "✗"}</span>
                <span className="belt-box-id">{String(item.id).slice(0, 7)}</span>
              </div>
              <div className="belt-box-shadow" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LiveMonitor;
