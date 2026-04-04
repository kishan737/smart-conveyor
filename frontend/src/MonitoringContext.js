import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";

const MonitoringContext = createContext();

export function MonitoringProvider({ children }) {
  const [excelData, setExcelData] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [isRunning, setIsRunning] = useState(false);

  // Conveyor system state
  const conveyorItemsRef = useRef([]);
  const [conveyorRenderItems, setConveyorRenderItems] = useState([]);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);
  const isRunningRef = useRef(false);
  const trackRef = useRef(null);
  const uidRef = useRef(0);

  // Tracks the key of the last row that triggered a belt box spawn.
  // Format: `${row.id}-${row.time}`. Prevents re-spawning on repeated polls
  // when the hardware has stopped sending new data.
  const lastSeenKeyRef = useRef(null);

  const BELT_SPEED = 80;

  // Keep running state in sync with ref
  useEffect(() => {
    isRunningRef.current = isRunning;
    if (!isRunning) lastTimeRef.current = null;
  }, [isRunning]);

  // Conveyor animation loop (ALWAYS RUNNING)
  useEffect(() => {
    const loop = (ts) => {
      rafRef.current = requestAnimationFrame(loop);

      if (!isRunningRef.current) return;

      if (lastTimeRef.current === null) {
        lastTimeRef.current = ts;
        return;
      }

      const delta = Math.min((ts - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = ts;

      const trackWidth = trackRef.current ? trackRef.current.offsetWidth : 900;

      const next = conveyorItemsRef.current
        .map((item) => ({
          ...item,
          x: item.x + BELT_SPEED * delta,
        }))
        .filter((item) => item.x < trackWidth + 80);

      conveyorItemsRef.current = next;
      setConveyorRenderItems([...next]);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Backend polling — consumes /live-data which returns canonical schema + status
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        if (excelData.length === 0 || !isRunning) return;

        const res = await fetch("https://smart-conveyor.onrender.com/live-data");
        const data = await res.json();

        if (!Array.isArray(data) || data.length === 0) return;

        const latest = data[data.length - 1];
        if (!latest) return;

        // Normalise fields — backend is authoritative, just guard missing values
        const row = {
          id:         String(latest.id         ?? ""),
          name:       String(latest.name       ?? ""),
          cargo_type: String(latest.cargo_type ?? ""),
          weight:     latest.weight  != null ? Number(latest.weight)  : 0,
          volume:     latest.volume  != null ? Number(latest.volume)  : 0,
          hs_code:    String(latest.hs_code    ?? ""),
          status:     String(latest.status     ?? ""),
          time:       String(latest.time       ?? new Date().toLocaleTimeString()),
        };

        // Deduplicate by id — only add if not already present
        setTableData((prev) => {
          if (prev.find((r) => r.id === row.id)) return prev;
          return [row, ...prev].slice(0, 50);
        });

        // Build a unique key for this row. Only spawn a belt box when the key
        // is genuinely different from the last one we acted on, so a stale
        // repeated poll result never re-adds the same item.
        const rowKey = `${row.id}-${row.time}`;
        if (rowKey === lastSeenKeyRef.current) return;

        lastSeenKeyRef.current = rowKey;

        // Spawn a new box on the left side of the conveyor belt
        const newItem = {
          uid:    uidRef.current++,
          id:     row.id,
          status: row.status,
          time:   row.time,
          x:      -70,
        };

        conveyorItemsRef.current = [...conveyorItemsRef.current, newItem];
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [excelData, isRunning]);

  // Excel file upload handler
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      // Upload to backend so it can be used as reference data
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("http://smart-conveyor.onrender.com/upload", {
          method: "POST",
          body: formData,
        });
        const result = await res.json();
        // Use backend-normalised data if available, otherwise fall back to parsed sheet
        setExcelData(result.data && result.data.length > 0 ? result.data : jsonData);
      } catch (err) {
        console.error("Excel upload error:", err);
        // Still set local data so the UI is not blocked
        setExcelData(jsonData);
      }

      setTableData([]);
      conveyorItemsRef.current = [];
      setConveyorRenderItems([]);
      setIsRunning(false);
      uidRef.current = 0;
    };

    reader.readAsArrayBuffer(file);
  };

  // Full system reset
  const resetBackend = async () => {
    try {
      await fetch("http://smart-conveyor.onrendor.com/clear-data", { method: "DELETE" });
    } catch (err) {
      console.error("Reset error:", err);
    }

    setTableData([]);
    setExcelData([]);
    setIsRunning(false);

    conveyorItemsRef.current = [];
    setConveyorRenderItems([]);

    // Clear the remembered key so the next session starts fresh
    lastSeenKeyRef.current = null;

    uidRef.current = 0;
  };

  return (
    <MonitoringContext.Provider
      value={{
        excelData,
        setExcelData,
        tableData,
        isRunning,
        setIsRunning,
        handleFile,
        resetBackend,
        conveyorRenderItems,
        trackRef,
      }}
    >
      {children}
    </MonitoringContext.Provider>
  );
}

// Custom hook
export function useMonitoring() {
  return useContext(MonitoringContext);
}
