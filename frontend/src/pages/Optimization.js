import React, { useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Edges, OrbitControls } from "@react-three/drei";
import { useMonitoring } from "../MonitoringContext";

function Optimization() {
  const { tableData } = useMonitoring();

  const [container, setContainer] = useState({
    length: 12,
    width: 6,
    height: 6,
    maxWeight: 500,
  });

  const [packedBoxes, setPackedBoxes] = useState([]);
  const [unplacedBoxes, setUnplacedBoxes] = useState([]);
  const [message, setMessage] = useState("Waiting for conveyor data.");

  const queuedBoxes = useMemo(() => {
    return tableData
      .filter(
        (item) =>
          Number(item.length) > 0 &&
          Number(item.width) > 0 &&
          Number(item.height) > 0 &&
          Number(item.weight) > 0
      )
      .map((item, index) => ({
        id: item.id || `BOX-${index + 1}`,
        name: item.name || `Item ${index + 1}`,
        length: Number(item.length),
        width: Number(item.width),
        height: Number(item.height),
        weight: Number(item.weight),
        status: item.status || "Unknown",
        color: getColor(index),
      }));
  }, [tableData]);

  const totalContainerVolume =
    container.length * container.width * container.height;

  const queuedVolume = useMemo(() => {
    return queuedBoxes.reduce(
      (sum, box) => sum + box.length * box.width * box.height,
      0
    );
  }, [queuedBoxes]);

  const queuedWeight = useMemo(() => {
    return queuedBoxes.reduce((sum, box) => sum + box.weight, 0);
  }, [queuedBoxes]);

  const packedVolume = useMemo(() => {
    return packedBoxes.reduce(
      (sum, box) => sum + box.length * box.width * box.height,
      0
    );
  }, [packedBoxes]);

  const packedWeight = useMemo(() => {
    return packedBoxes.reduce((sum, box) => sum + box.weight, 0);
  }, [packedBoxes]);

  const utilization =
    totalContainerVolume > 0
      ? ((packedVolume / totalContainerVolume) * 100).toFixed(1)
      : "0.0";

  const hasOptimized = packedBoxes.length > 0 || unplacedBoxes.length > 0;

  const optimizePacking = () => {
    if (
      container.length <= 0 ||
      container.width <= 0 ||
      container.height <= 0 ||
      container.maxWeight <= 0
    ) {
      setMessage("All container values must be greater than 0.");
      return;
    }

    if (queuedBoxes.length === 0) {
      setPackedBoxes([]);
      setUnplacedBoxes([]);
      setMessage("No valid conveyor boxes available yet.");
      return;
    }

    const result = packBoxes({
      boxes: queuedBoxes,
      container,
    });

    setPackedBoxes(result.packed);
    setUnplacedBoxes(result.unplaced);

    if (result.packed.length === 0) {
      setMessage("No boxes could be packed into the container.");
    } else if (result.unplaced.length === 0) {
      setMessage(
        `Optimization complete. Packed all ${result.packed.length} boxes successfully.`
      );
    } else {
      setMessage(
        `Optimization complete. Packed ${result.packed.length} boxes. ${result.unplaced.length} boxes could not be placed due to space or weight limits.`
      );
    }
  };

  const resetOptimization = () => {
    setPackedBoxes([]);
    setUnplacedBoxes([]);
    setMessage("Optimization reset.");
  };

  const handleContainerChange = (field, value) => {
    setContainer((prev) => ({
      ...prev,
      [field]: Number(value),
    }));
  };

  return (
    <div style={pageStyle}>
      <h1 style={titleStyle}>Container Optimization</h1>

      <div style={topGridStyle}>
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Container Setup</h3>

          <Label>Length</Label>
          <input
            type="number"
            value={container.length}
            onChange={(e) => handleContainerChange("length", e.target.value)}
            style={inputStyle}
          />

          <Label>Width</Label>
          <input
            type="number"
            value={container.width}
            onChange={(e) => handleContainerChange("width", e.target.value)}
            style={inputStyle}
          />

          <Label>Height</Label>
          <input
            type="number"
            value={container.height}
            onChange={(e) => handleContainerChange("height", e.target.value)}
            style={inputStyle}
          />

          <Label>Max Container Weight</Label>
          <input
            type="number"
            value={container.maxWeight}
            onChange={(e) => handleContainerChange("maxWeight", e.target.value)}
            style={inputStyle}
          />

          <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
            <button
              onClick={optimizePacking}
              style={{ ...buttonStyle, background: "#2563eb" }}
            >
              Optimize
            </button>
            <button
              onClick={resetOptimization}
              style={{ ...buttonStyle, background: "#dc2626" }}
            >
              Reset
            </button>
          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Live Cargo Queue</h3>
          <Metric label="Boxes collected" value={queuedBoxes.length} />
          <Metric label="Queue volume" value={queuedVolume} />
          <Metric label="Queue weight" value={queuedWeight} />
          <Metric label="Container volume" value={totalContainerVolume} />
          <Metric label="Max weight" value={container.maxWeight} />
          <div style={messageStyle}>{message}</div>
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Optimization Result</h3>
          <Metric label="Packed boxes" value={packedBoxes.length} />
          <Metric label="Unplaced boxes" value={unplacedBoxes.length} />
          <Metric label="Packed volume" value={packedVolume} />
          <Metric label="Packed weight" value={packedWeight} />
          <Metric label="Utilization" value={`${utilization}%`} />
        </div>
      </div>

      <div style={viewerCardStyle}>
        <h3 style={sectionTitleStyle}>3D Container View</h3>
        <div style={canvasWrapperStyle}>
          <Canvas camera={{ position: [0, 12, 18], fov: 45 }}>
            <ambientLight intensity={0.95} />
            <directionalLight position={[12, 14, 12]} intensity={1.0} />
            <directionalLight position={[-8, 10, -6]} intensity={0.35} />

            <AutoScaledScene
              container={container}
              queuedBoxes={queuedBoxes}
              packedBoxes={packedBoxes}
              unplacedBoxes={unplacedBoxes}
              hasOptimized={hasOptimized}
            />
<OrbitControls
  enablePan={false}
  enableZoom={true}
  enableRotate={true}
  target={[5, 0, 0]}
  minAzimuthAngle={-Infinity}
  maxAzimuthAngle={Infinity}
  minPolarAngle={0.15}
  maxPolarAngle={Math.PI / 2 - 0.05}
/>
          </Canvas>
        </div>
      </div>

      <div style={bottomGridStyle}>
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Packed Boxes</h3>
          <TableBoxList boxes={packedBoxes} emptyText="Nothing packed yet." />
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Unplaced Boxes</h3>
          <TableBoxList
            boxes={unplacedBoxes}
            emptyText="All queued boxes fit within current space and weight limits."
          />
        </div>
      </div>
    </div>
  );
}

function AutoScaledScene({
  container,
  queuedBoxes,
  packedBoxes,
  unplacedBoxes,
  hasOptimized,
}) {
  const layout = useMemo(() => {
    return buildSceneLayout({
      container,
      queuedBoxes,
      packedBoxes,
      unplacedBoxes,
      hasOptimized,
    });
  }, [container, queuedBoxes, packedBoxes, unplacedBoxes, hasOptimized]);

  return (
    <group scale={[layout.sceneScale, layout.sceneScale, layout.sceneScale]}>
      <SceneContent layout={layout} />
    </group>
  );
}

function SceneContent({ layout }) {
  const packedMap = new Map(layout.packedBoxes.map((b) => [b.id, b]));
  const unplacedSet = new Set(layout.unplacedBoxes.map((b) => b.id));

  return (
    <>
      {/* Flat ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[layout.groundCenterX, 0, 0]}>
        <planeGeometry args={[layout.groundWidth, layout.groundDepth]} />
        <meshStandardMaterial color="#dbe3ee" />
      </mesh>

      {/* Container wireframe */}
      <mesh
        position={[
          layout.containerX + layout.containerLength / 2,
          layout.containerHeight / 2,
          0,
        ]}
      >
        <boxGeometry
          args={[
            layout.containerLength,
            layout.containerHeight,
            layout.containerWidth,
          ]}
        />
        <meshStandardMaterial transparent opacity={0.08} color="#94a3b8" />
        <Edges color="#334155" />
      </mesh>

      {/* Subtle dock marker area */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[layout.dockCenterX, 0.01, 0]}>
        <planeGeometry args={[layout.dockWidth, layout.dockDepth]} />
        <meshStandardMaterial color="#e9eef5" />
      </mesh>

      {/* Boxes */}
      {layout.displayBoxes.map((box) => {
        const packed = packedMap.get(box.id);
        const unplaced = unplacedSet.has(box.id);

        const visual = packed && layout.hasOptimized ? packed : box;

        return (
          <mesh
            key={box.id}
            position={[
              visual.x + visual.vLength / 2,
              visual.z + visual.vHeight / 2,
              visual.y + visual.vWidth / 2,
            ]}
          >
            <boxGeometry args={[visual.vLength, visual.vHeight, visual.vWidth]} />
            <meshStandardMaterial
              color={box.color}
              opacity={unplaced && layout.hasOptimized ? 0.35 : 1}
              transparent={unplaced && layout.hasOptimized}
            />
            <Edges color="#0f172a" />
          </mesh>
        );
      })}
    </>
  );
}

function buildSceneLayout({
  container,
  queuedBoxes,
  packedBoxes,
  unplacedBoxes,
  hasOptimized,
}) {
  const targetContainerLength = 10;
  const containerScale = targetContainerLength / Math.max(container.length, 1);

  const containerLength = container.length * containerScale;
  const containerWidth = container.width * containerScale;
  const containerHeight = container.height * containerScale;

  const containerX = -4;

  const stagedBoxes = buildHorizontalStagingPositions(queuedBoxes);

  const packedMap = new Map();
  packedBoxes.forEach((box) => {
    packedMap.set(box.id, {
      ...box,
      x: containerX + box.length * containerScale * 0 + box.x * containerScale,
      y: -containerWidth / 2 + box.y * containerScale,
      z: box.z * containerScale,
      vLength: box.length * containerScale,
      vWidth: box.width * containerScale,
      vHeight: box.height * containerScale,
    });
  });

  const maxDockX =
    stagedBoxes.length > 0
      ? Math.max(...stagedBoxes.map((b) => b.x + b.vLength))
      : containerX + containerLength + 6;

  const minDockX =
    stagedBoxes.length > 0
      ? Math.min(...stagedBoxes.map((b) => b.x))
      : containerX + containerLength + 2;

  const dockCenterX = (minDockX + maxDockX) / 2;
  const dockWidth = Math.max(8, maxDockX - minDockX + 2);
  const dockDepth = Math.max(containerWidth + 2, 8);

  const groundCenterX = (containerX + containerLength / 2 + dockCenterX) / 2;
  const groundWidth = Math.max(28, maxDockX - containerX + 6);
  const groundDepth = Math.max(containerWidth + 8, 14);

  const totalSceneWidth = Math.max(18, maxDockX - containerX + 4);
  const totalSceneHeight = Math.max(containerHeight + 4, 8);

  const fitScale = Math.min(1, 20 / totalSceneWidth, 11 / totalSceneHeight);

  return {
    hasOptimized,
    packedBoxes: Array.from(packedMap.values()),
    unplacedBoxes,
    displayBoxes: stagedBoxes,
    containerX,
    containerLength,
    containerWidth,
    containerHeight,
    dockCenterX,
    dockWidth,
    dockDepth,
    groundCenterX,
    groundWidth,
    groundDepth,
    sceneScale: fitScale,
  };
}

function buildHorizontalStagingPositions(boxes) {
  const dockStartX = 8.5;
  const dockStartY = -3.2;
  const gap = 0.45;
  const rowGap = 0.85;
  const maxRows = 3;

  let currentX = dockStartX;
  let currentY = dockStartY;
  let row = 0;

  const staged = [];

  for (const box of boxes) {
    const v = getVisualBoxSize(box);

    if (currentX + v.length > 17) {
      row += 1;
      currentX = dockStartX;
      currentY += rowGap + 1.4;
    }

    if (row >= maxRows) break;

    staged.push({
      ...box,
      x: currentX,
      y: currentY,
      z: 0,
      vLength: v.length,
      vWidth: v.width,
      vHeight: v.height,
    });

    currentX += v.length + gap;
  }

  return staged;
}

function getVisualBoxSize(box) {
  const normalize = (value) => {
    const minVisual = 0.8;
    const maxVisual = 1.8;
    const scaled = 0.12 * value;
    return Math.max(minVisual, Math.min(maxVisual, scaled));
  };

  return {
    length: normalize(box.length),
    width: normalize(box.width),
    height: normalize(box.height),
  };
}

function packBoxes({ boxes, container }) {
  const sortedBoxes = [...boxes].sort((a, b) => {
    const volumeA = a.length * a.width * a.height;
    const volumeB = b.length * b.width * b.height;
    return volumeB - volumeA;
  });

  const packed = [];
  const unplaced = [];

  let usedWeight = 0;

  let x = 0;
  let y = 0;
  let z = 0;
  let currentRowWidth = 0;
  let currentLayerHeight = 0;

  for (const box of sortedBoxes) {
    if (
      box.length > container.length ||
      box.width > container.width ||
      box.height > container.height
    ) {
      unplaced.push({ ...box, reason: "Too large for container" });
      continue;
    }

    if (usedWeight + box.weight > container.maxWeight) {
      unplaced.push({ ...box, reason: "Exceeds max weight" });
      continue;
    }

    let placeX = x;
    let placeY = y;
    let placeZ = z;
    let rowWidth = currentRowWidth;
    let layerHeight = currentLayerHeight;

    if (placeX + box.length > container.length) {
      placeX = 0;
      placeY = placeY + rowWidth;
      rowWidth = 0;
    }

    if (placeY + box.width > container.width) {
      placeX = 0;
      placeY = 0;
      placeZ = placeZ + layerHeight;
      rowWidth = 0;
      layerHeight = 0;
    }

    if (placeZ + box.height > container.height) {
      unplaced.push({ ...box, reason: "No remaining volume" });
      continue;
    }

    packed.push({
      ...box,
      x: placeX,
      y: placeY,
      z: placeZ,
    });

    usedWeight += box.weight;

    x = placeX + box.length;
    y = placeY;
    z = placeZ;
    currentRowWidth = Math.max(rowWidth, box.width);
    currentLayerHeight = Math.max(layerHeight, box.height);
  }

  return { packed, unplaced };
}

function TableBoxList({ boxes, emptyText }) {
  if (boxes.length === 0) {
    return <div style={emptyListStyle}>{emptyText}</div>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>ID</th>
            <th style={thStyle}>Size</th>
            <th style={thStyle}>Weight</th>
          </tr>
        </thead>
        <tbody>
          {boxes.map((box) => (
            <tr key={box.id}>
              <td style={tdStyle}>{box.id}</td>
              <td style={tdStyle}>
                {box.length} × {box.width} × {box.height}
              </td>
              <td style={tdStyle}>{box.weight}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Label({ children }) {
  return <div style={labelStyle}>{children}</div>;
}

function Metric({ label, value }) {
  return (
    <div style={metricRowStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getColor(index) {
  const colors = [
    "#60a5fa",
    "#34d399",
    "#fbbf24",
    "#f87171",
    "#a78bfa",
    "#22d3ee",
    "#fb7185",
    "#4ade80",
  ];
  return colors[index % colors.length];
}

const pageStyle = {
  padding: "24px",
  background: "#eef2f7",
  minHeight: "calc(100vh - 58px)",
  fontFamily: '"Segoe UI", Arial, sans-serif',
};

const titleStyle = {
  fontSize: "28px",
  fontWeight: 700,
  marginBottom: "20px",
  color: "#0f172a",
};

const topGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: "18px",
  marginBottom: "20px",
};

const bottomGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "18px",
  marginTop: "20px",
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: "12px",
  boxShadow: "0 4px 14px rgba(15, 23, 42, 0.06)",
  padding: "16px",
};

const viewerCardStyle = {
  background: "#ffffff",
  border: "1px solid #dbe3ee",
  borderRadius: "12px",
  boxShadow: "0 4px 14px rgba(15, 23, 42, 0.06)",
  padding: "16px",
};

const sectionTitleStyle = {
  marginBottom: "14px",
  fontSize: "16px",
  fontWeight: 600,
  color: "#334155",
};

const labelStyle = {
  fontSize: "12px",
  color: "#64748b",
  marginBottom: "6px",
  marginTop: "8px",
};

const inputStyle = {
  width: "100%",
  padding: "10px",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  fontSize: "14px",
  outline: "none",
};

const buttonStyle = {
  padding: "10px 14px",
  border: "none",
  borderRadius: "8px",
  color: "#ffffff",
  fontWeight: 600,
  cursor: "pointer",
};

const metricRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: "10px",
  color: "#475569",
  fontSize: "14px",
};

const messageStyle = {
  marginTop: "12px",
  padding: "10px",
  borderRadius: "8px",
  background: "#f8fafc",
  color: "#475569",
  fontSize: "13px",
  border: "1px solid #e2e8f0",
};

const canvasWrapperStyle = {
  width: "100%",
  height: "540px",
  borderRadius: "10px",
  overflow: "hidden",
  background: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
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

const emptyListStyle = {
  color: "#94a3b8",
  fontStyle: "italic",
  fontSize: "13px",
  padding: "8px 0",
};

export default Optimization;