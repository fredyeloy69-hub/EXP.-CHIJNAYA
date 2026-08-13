"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebaseClient";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  limit,
} from "firebase/firestore";

const ESTADO_COLOR = {
  completa: "#2ecc71",
  incompleta: "#f39c12",
  vacia: "#e74c3c",
};

const AREA_COLORS = [
  "#3d7dff",
  "#a35bff",
  "#ff5ea3",
  "#ff8a3d",
  "#2ecc71",
  "#17b8a6",
  "#e0b800",
  "#6b7280",
];

function colorForArea(area) {
  let hash = 0;
  for (let i = 0; i < area.length; i++) hash = area.charCodeAt(i) + ((hash << 5) - hash);
  return AREA_COLORS[Math.abs(hash) % AREA_COLORS.length];
}

const EVENTO_LABEL = {
  archivo_subido: "subió",
  archivo_reemplazado: "reemplazó",
  archivo_borrado: "borró",
  carpeta_creada: "creó la carpeta",
  carpeta_borrada: "borró la carpeta",
  carpeta_movida: "movió la carpeta",
};

export default function Dashboard() {
  const [resumen, setResumen] = useState(null);
  const [carpetas, setCarpetas] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [filtroArea, setFiltroArea] = useState("Todas");
  const [filtroEstado, setFiltroEstado] = useState("Todas");

  useEffect(() => {
    const unsubResumen = onSnapshot(doc(db, "_meta", "resumen"), (snap) => {
      if (snap.exists()) setResumen(snap.data());
    });

    const unsubCarpetas = onSnapshot(collection(db, "carpetas"), (snap) => {
      setCarpetas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const eventosQuery = query(
      collection(db, "eventos"),
      orderBy("timestamp", "desc"),
      limit(50)
    );
    const unsubEventos = onSnapshot(eventosQuery, (snap) => {
      setEventos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubResumen();
      unsubCarpetas();
      unsubEventos();
    };
  }, []);

  const pct = resumen && resumen.totalFinales
    ? Math.round((resumen.completas / resumen.totalFinales) * 100)
    : 0;

  const areas = Array.from(
    new Set(carpetas.map((c) => c.area || "Sin área"))
  ).sort();

  // Estadisticas por area: total, completas, incompletas, vacias — para el circulo de progreso
  const areaStats = {};
  for (const c of carpetas) {
    const a = c.area || "Sin área";
    if (!areaStats[a]) areaStats[a] = { total: 0, completas: 0, incompletas: 0, vacias: 0 };
    areaStats[a].total++;
    if (c.estado === "completa") areaStats[a].completas++;
    if (c.estado === "incompleta") areaStats[a].incompletas++;
    if (c.estado === "vacia") areaStats[a].vacias++;
  }

  let pendientes = carpetas
    .filter((c) => c.estado !== "completa")
    .sort((a, b) => (a.ruta || "").localeCompare(b.ruta || ""));

  if (filtroArea !== "Todas") {
    pendientes = pendientes.filter((c) => (c.area || "Sin área") === filtroArea);
  }
  if (filtroEstado !== "Todas") {
    pendientes = pendientes.filter((c) => c.estado === filtroEstado);
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px", color: "#e8ecf1" }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Expediente Técnico — C.S. Chijnaya</h1>
      <p style={{ color: "#8a93a6", marginTop: 0, marginBottom: 28 }}>
        Estado en tiempo real de la carga de documentación
      </p>

      {/* Barra de progreso */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span>Avance general</span>
          <strong>{pct}%</strong>
        </div>
        <div style={{ height: 14, background: "#1c2333", borderRadius: 8, overflow: "hidden" }}>
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "linear-gradient(90deg,#ff8a3d,#ff5e3a)",
              transition: "width .4s ease",
            }}
          />
        </div>
      </div>

      {/* Contadores */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 32 }}>
        <Card label="Carpetas finales" value={resumen?.totalFinales ?? "–"} color="#3d7dff" />
        <Card label="Completas" value={resumen?.completas ?? "–"} color="#2ecc71" />
        <Card label="Incompletas" value={resumen?.incompletas ?? "–"} color="#f39c12" />
        <Card label="Vacías" value={resumen?.vacias ?? "–"} color="#e74c3c" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 24 }}>
        {/* Carpetas pendientes */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h2 style={{ fontSize: 16, color: "#c7cede", margin: 0 }}>Carpetas que faltan completar</h2>
          </div>

          {/* Chips de área — click directo para filtrar por especialidad */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => setFiltroArea("Todas")}
              style={chipStyle(filtroArea === "Todas", "#3d7dff")}
            >
              Todas ({carpetas.filter((c) => c.estado !== "completa").length})
            </button>
            {areas.map((a) => {
              const count = carpetas.filter(
                (c) => c.estado !== "completa" && (c.area || "Sin área") === a
              ).length;
              if (count === 0) return null;
              return (
                <button
                  key={a}
                  onClick={() => setFiltroArea(a)}
                  style={chipStyle(filtroArea === a, colorForArea(a))}
                >
                  {a} ({count})
                </button>
              );
            })}
          </div>

          {/* Panel de progreso circular — aparece al elegir una especialidad especifica */}
          {filtroArea !== "Todas" && areaStats[filtroArea] && (
            <AreaProgressPanel area={filtroArea} stats={areaStats[filtroArea]} color={colorForArea(filtroArea)} />
          )}

          {/* Filtro por estado */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              style={selectStyle}
            >
              <option value="Todas">Todos los estados</option>
              <option value="incompleta">Incompletas</option>
              <option value="vacia">Vacías</option>
            </select>
          </div>

          <div style={{ background: "#151b2b", borderRadius: 10, overflow: "hidden" }}>
            {pendientes.length === 0 && (
              <p style={{ padding: 16, color: "#8a93a6" }}>
                {carpetas.length === 0
                  ? "Sin datos todavía — esperando primera sincronización."
                  : "No hay carpetas que coincidan con el filtro."}
              </p>
            )}
            {pendientes.map((c) => {
              const area = c.area || "Sin área";
              const detalle = c.detalle || c.estado;
              const driveUrl = `https://drive.google.com/drive/folders/${c.id}`;
              return (
                
                  key={c.id}
                  href={driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block",
                    padding: "10px 16px",
                    borderBottom: "1px solid #1f2740",
                    textDecoration: "none",
                    color: "inherit",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#1b2338")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  title="Abrir esta carpeta en Google Drive"
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ fontSize: 13 }}>
                      {c.ruta || c.nombre} <span style={{ color: "#4a5164" }}>↗</span>
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 8px",
                        borderRadius: 20,
                        background: ESTADO_COLOR[c.estado] + "22",
                        color: ESTADO_COLOR[c.estado],
                        textTransform: "uppercase",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.estado}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: colorForArea(area) + "22",
                        color: colorForArea(area),
                        fontWeight: 600,
                      }}
                    >
                      {area}
                    </span>
                    <span style={{ fontSize: 11, color: "#8a93a6" }}>{detalle}</span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>

        {/* Log de actividad */}
        <div>
          <h2 style={{ fontSize: 16, color: "#c7cede" }}>Actividad reciente</h2>
          <div style={{ background: "#151b2b", borderRadius: 10, maxHeight: 480, overflowY: "auto" }}>
            {eventos.length === 0 && (
              <p style={{ padding: 16, color: "#8a93a6" }}>Sin eventos todavía.</p>
            )}
            {eventos.map((e) => (
              <div key={e.id} style={{ padding: "10px 16px", borderBottom: "1px solid #1f2740" }}>
                <div style={{ fontSize: 13 }}>
                  <strong>{e.usuario}</strong> {EVENTO_LABEL[e.tipo] || e.tipo}{" "}
                  <strong>{e.item}</strong>
                </div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>{e.ruta}</div>
                <div style={{ fontSize: 10, color: "#4a5164" }}>
                  {e.timestamp?.toDate ? e.timestamp.toDate().toLocaleString("es-PE") : "..."}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AreaProgressPanel({ area, stats, color }) {
  const pct = stats.total > 0 ? Math.round((stats.completas / stats.total) * 100) : 0;
  const size = 96;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        background: "#151b2b",
        border: `1px solid ${color}44`,
        borderRadius: 10,
        padding: "16px 20px",
        marginBottom: 12,
      }}
    >
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1f2740"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset .5s ease" }}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="20"
          fontWeight="700"
          fill="#e8ecf1"
        >
          {pct}%
        </text>
      </svg>

      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color, marginBottom: 6 }}>{area}</div>
        <div style={{ fontSize: 12, color: "#c7cede", lineHeight: 1.7 }}>
          <div>
            <span style={{ color: "#2ecc71", fontWeight: 700 }}>{stats.completas}</span> completas de{" "}
            <strong>{stats.total}</strong> carpetas
          </div>
          <div>
            <span style={{ color: "#f39c12", fontWeight: 700 }}>{stats.incompletas}</span> incompletas
            {"  ·  "}
            <span style={{ color: "#e74c3c", fontWeight: 700 }}>{stats.vacias}</span> vacías
          </div>
        </div>
      </div>
    </div>
  );
}

function chipStyle(active, color) {
  return {
    fontSize: 11,
    padding: "5px 10px",
    borderRadius: 20,
    border: `1px solid ${active ? color : "#2a3350"}`,
    background: active ? color + "33" : "#151b2b",
    color: active ? color : "#8a93a6",
    fontWeight: 600,
    cursor: "pointer",
  };
}

const selectStyle = {
  background: "#151b2b",
  color: "#e8ecf1",
  border: "1px solid #2a3350",
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 12,
};

function Card({ label, value, color }) {
  return (
    <div style={{ background: "#151b2b", borderRadius: 10, padding: "16px", borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#8a93a6" }}>{label}</div>
    </div>
  );
}
