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

const ESTADO_OPTIONS = [
  { value: "pendientes", label: "Pendientes", color: "#3d7dff" },
  { value: "incompleta", label: "Incompletas", color: "#f39c12" },
  { value: "vacia", label: "Vacías", color: "#e74c3c" },
  { value: "completa", label: "Completas", color: "#2ecc71" },
  { value: "todas", label: "Todas", color: "#8a93a6" },
];

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
  const [filtroEstado, setFiltroEstado] = useState("pendientes"); // pendientes | incompleta | vacia | completa | todas

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

  let listaBase = carpetas;
  if (filtroEstado === "pendientes") {
    listaBase = carpetas.filter((c) => c.estado !== "completa");
  } else if (filtroEstado !== "todas") {
    listaBase = carpetas.filter((c) => c.estado === filtroEstado);
  }

  let visibles = listaBase.sort((a, b) => (a.ruta || "").localeCompare(b.ruta || ""));

  if (filtroArea !== "Todas") {
    visibles = visibles.filter((c) => (c.area || "Sin área") === filtroArea);
  }

  const ESTADO_FILTRO_LABEL = {
    pendientes: "Pendientes (incompletas + vacías)",
    incompleta: "Solo incompletas",
    vacia: "Solo vacías",
    completa: "Solo completas",
    todas: "Todas las carpetas",
  };
  const areaLabel = filtroArea !== "Todas" ? ` · ${filtroArea}` : "";

  return (
    <div style={{ maxWidth: 1500, margin: "0 auto", padding: "32px 28px", color: "#e8ecf1" }}>
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
            <h2 style={{ fontSize: 16, color: "#c7cede", margin: 0 }}>
              Carpetas — {ESTADO_FILTRO_LABEL[filtroEstado]}{areaLabel}
            </h2>
          </div>

          {/* Grilla de áreas — mini círculos de progreso, un click para filtrar */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
              gap: 8,
              marginBottom: 14,
            }}
          >
            <AreaMiniCard
              area="Todas"
              pct={pct}
              total={resumen?.totalFinales ?? 0}
              color="#3d7dff"
              active={filtroArea === "Todas"}
              onClick={() => setFiltroArea("Todas")}
            />
            {areas.map((a) => {
              const s = areaStats[a];
              if (!s) return null;
              const areaPct = s.total > 0 ? Math.round((s.completas / s.total) * 100) : 0;
              return (
                <AreaMiniCard
                  key={a}
                  area={a}
                  pct={areaPct}
                  total={s.total}
                  color={colorForArea(a)}
                  active={filtroArea === a}
                  onClick={() => setFiltroArea(filtroArea === a ? "Todas" : a)}
                />
              );
            })}
          </div>

          {/* Panel de progreso circular — detalle ampliado de la especialidad elegida */}
          {filtroArea !== "Todas" && areaStats[filtroArea] && (
            <AreaProgressPanel area={filtroArea} stats={areaStats[filtroArea]} color={colorForArea(filtroArea)} />
          )}

          {/* Filtro por estado — botones de un click, sin desplegable */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {ESTADO_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFiltroEstado(opt.value)}
                style={chipStyle(filtroEstado === opt.value, opt.color)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ background: "#151b2b", borderRadius: 10, overflow: "hidden" }}>
            {visibles.length === 0 && (
              <p style={{ padding: 16, color: "#8a93a6" }}>
                {carpetas.length === 0
                  ? "Sin datos todavía — esperando primera sincronización."
                  : "No hay carpetas que coincidan con el filtro."}
              </p>
            )}
            {visibles.map((c) => {
              const area = c.area || "Sin área";
              const detalle = c.detalle || c.estado;
              const driveUrl = `https://drive.google.com/drive/folders/${c.id}`;
              return (
                <div
                  key={c.id}
                  onClick={() => window.open(driveUrl, "_blank", "noopener,noreferrer")}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid #1f2740",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#1b2338")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  title="Abrir esta carpeta en Google Drive"
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <RutaJerarquica ruta={c.ruta} nombre={c.nombre} />
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
                        flexShrink: 0,
                      }}
                    >
                      {c.estado}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
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
                </div>
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

// Muestra la ruta como breadcrumb jerarquico: niveles padre chicos/grises,
// nombre final de la carpeta grande y resaltado. Si hay mas de 4 niveles,
// colapsa los del medio con "…" para que siga siendo legible.
function RutaJerarquica({ ruta, nombre }) {
  const partes = (ruta || nombre || "").split(" / ").filter(Boolean);
  let mostrar = partes;
  if (partes.length > 4) {
    mostrar = [partes[0], "…", partes[partes.length - 2], partes[partes.length - 1]];
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 4, flex: 1, minWidth: 0 }}>
      {mostrar.map((p, i) => {
        const esUltimo = i === mostrar.length - 1;
        return (
          <span key={i} style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
            {i > 0 && <span style={{ color: "#3d4560", fontSize: 11 }}>›</span>}
            <span
              style={{
                fontSize: esUltimo ? 14 : 11,
                fontWeight: esUltimo ? 700 : 500,
                color: esUltimo ? "#e8ecf1" : "#7a8299",
              }}
            >
              {p}
              {esUltimo && <span style={{ color: "#4a5164", marginLeft: 4 }}>↗</span>}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function AreaMiniCard({ area, pct, total, color, active, onClick }) {
  const size = 56;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        padding: "10px 6px",
        borderRadius: 10,
        border: `1.5px solid ${active ? color : "#1f2740"}`,
        background: active ? color + "18" : "#151b2b",
        cursor: "pointer",
        transition: "all .15s ease",
      }}
      title={`${area} — ${pct}% completo (${total} carpetas)`}
    >
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1f2740" strokeWidth={stroke} />
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
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight="700" fill="#e8ecf1">
          {pct}%
        </text>
      </svg>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: active ? color : "#c7cede",
          textAlign: "center",
          lineHeight: 1.2,
          maxWidth: 84,
        }}
      >
        {area}
      </div>
      <div style={{ fontSize: 8, color: "#6b7280" }}>{total} carpetas</div>
    </button>
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
