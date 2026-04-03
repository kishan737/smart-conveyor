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

  const BELT_SPEED = 80;

  // Keep running state in sync
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

  // Backend polling (ALWAYS RUNNING)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        if (excelData.length === 0 || !isRunning) return;

        const res = await fetch("http://127.0.0.1:8000/hardware-data");
        const data = await res.json();
        const latest = data[data.length - 1];

        if (!latest) return;

        const match = excelData.find((item) => item.id === latest.id);

        let status = "";

        if (!match) {
          status = "Missing in document";
        } else {
          const errors = [];

          if (match.name !== latest.name) errors.push("Name mismatch");
          if (match.weight !== latest.weight) errors.push("Weight mismatch");

          ["length", "width", "height"].forEach((dim) => {
            if (match[dim] !== latest[dim]) {
              errors.push(`${dim} mismatch`);
            }
          });

          status = errors.length ? errors.join(", ") : "OK";
        }

        const time = new Date().toLocaleTimeString();

        setTableData((prev) => {
          if (prev.find((row) => row.id === latest.id)) return prev;
          return [{ ...latest, status, time }, ...prev].slice(0, 50);
        });

        // Add new item to conveyor (LEFT side)
        const newItem = {
          uid: uidRef.current++,
          id: latest.id,
          status,
          time,
          x: -70,
        };

        conveyorItemsRef.current = [
          ...conveyorItemsRef.current,
          newItem,
        ];
      } catch (err) {
        console.error(err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [excelData, isRunning]);

  // File upload handler
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      setExcelData(jsonData);
      setTableData([]);

      conveyorItemsRef.current = [];
      setConveyorRenderItems([]);

      setIsRunning(false);
      uidRef.current = 0;
    };

    reader.readAsArrayBuffer(file);
  };

  // Reset system
  const resetBackend = async () => {
    await fetch("http://127.0.0.1:8000/clear-data", {
      method: "DELETE",
    });

    setTableData([]);
    setExcelData([]);
    setIsRunning(false);

    conveyorItemsRef.current = [];
    setConveyorRenderItems([]);

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