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
import { generarReportePorArea } from "@/lib/exportarReporte";

const COLLAPSE_STORAGE_KEY = "chijnaya_grupos_colapsados";

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

const EVENTO_COLOR = {
  archivo_subido: "#2ecc71",
  archivo_reemplazado: "#f39c12",
  archivo_borrado: "#e74c3c",
  carpeta_creada: "#3d7dff",
  carpeta_borrada: "#e74c3c",
  carpeta_movida: "#a35bff",
};

const EVENTO_ICONO = {
  archivo_subido: "↑",
  archivo_reemplazado: "⟲",
  archivo_borrado: "✕",
  carpeta_creada: "+",
  carpeta_borrada: "✕",
  carpeta_movida: "⇄",
};

function tiempoRelativo(date) {
  if (!date) return "...";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "justo ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `hace ${diffD} d`;
  return date.toLocaleDateString("es-PE");
}

export default function Dashboard() {
  const [resumen, setResumen] = useState(null);
  const [carpetas, setCarpetas] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [filtroArea, setFiltroArea] = useState("Todas");
  const [filtroEstado, setFiltroEstado] = useState("pendientes"); // pendientes | incompleta | vacia | completa | todas
  const [sincronizando, setSincronizando] = useState(false);
  const [mensajeSync, setMensajeSync] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [colapsados, setColapsados] = useState({}); // { [groupKey]: true } => colapsado
  const [colapsoListo, setColapsoListo] = useState(false); // evita pisar localStorage antes de leerlo
  const [exportandoArea, setExportandoArea] = useState(null);

  // Cargar estado de colapso guardado (una sola vez, al montar)
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(COLLAPSE_STORAGE_KEY);
      if (guardado) setColapsados(JSON.parse(guardado));
    } catch {
      // localStorage no disponible o corrupto — seguimos con todo expandido
    }
    setColapsoListo(true);
  }, []);

  // Guardar cada vez que cambie (después de la carga inicial)
  useEffect(() => {
    if (!colapsoListo) return;
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(colapsados));
    } catch {
      // si falla el guardado no rompemos nada, solo no persiste
    }
  }, [colapsados, colapsoListo]);

  function toggleGrupo(key) {
    setColapsados((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleExportarArea(areaNombre, carpetasDelArea) {
    setExportandoArea(areaNombre);
    try {
      generarReportePorArea(areaNombre, carpetasDelArea);
    } finally {
      setExportandoArea(null);
    }
  }

  async function handleSync() {
    setSincronizando(true);
    setMensajeSync(null);
    try {
      const res = await fetch("/api/manual-sync", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setMensajeSync({ tipo: "ok", texto: `Listo — ${data.eventos} eventos nuevos detectados` });
      } else {
        setMensajeSync({ tipo: "error", texto: `Error: ${data.error || "desconocido"}` });
      }
    } catch (err) {
      setMensajeSync({ tipo: "error", texto: "Error de conexión al sincronizar" });
    } finally {
      setSincronizando(false);
    }
  }

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

  // Todas las carpetas de cada área (sin filtros), para exportar el reporte completo del área
  const carpetasPorArea = {};
  for (const c of carpetas) {
    const a = c.area || "Sin área";
    if (!carpetasPorArea[a]) carpetasPorArea[a] = [];
    carpetasPorArea[a].push(c);
  }

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

  let visibles = listaBase.sort((a, b) =>
    (a.ruta || "").localeCompare(b.ruta || "", undefined, { numeric: true, sensitivity: "base" })
  );

  if (filtroArea !== "Todas") {
    visibles = visibles.filter((c) => (c.area || "Sin área") === filtroArea);
  }

  if (busqueda.trim()) {
    const q = busqueda.trim().toLowerCase();
    visibles = visibles.filter((c) =>
      (c.nombre || "").toLowerCase().includes(q) || (c.ruta || "").toLowerCase().includes(q)
    );
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
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background:
          "radial-gradient(circle at 20% 0%, #1a2244 0%, #0a0e1a 45%, #060810 100%)",
      }}
    >
      <div style={{ maxWidth: 1500, margin: "0 auto", padding: "32px 28px", color: "#e8ecf1" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 4 }}>Expediente Técnico — C.S. Chijnaya</h1>
          <p style={{ color: "#8a93a6", marginTop: 0, marginBottom: 4 }}>
            Estado en tiempo real de la carga de documentación
          </p>
          {resumen?.ultimaSync?.toDate && (
            <p style={{ color: "#4a5164", fontSize: 11, marginTop: 0 }}>
              Última sincronización: {tiempoRelativo(resumen.ultimaSync.toDate())}
            </p>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <button
            onClick={handleSync}
            disabled={sincronizando}
            style={{
              fontSize: 20,
              fontWeight: 800,
              padding: "22px 42px",
              borderRadius: 16,
              border: "2px solid #ff8a3d88",
              background: sincronizando ? "#1c2333" : "linear-gradient(90deg,#ff8a3d33,#ff5e3a33)",
              color: sincronizando ? "#6b7280" : "#ffb27a",
              cursor: sincronizando ? "not-allowed" : "pointer",
              boxShadow: sincronizando ? "none" : "0 0 28px rgba(255,138,61,.4)",
              letterSpacing: 0.3,
            }}
          >
            {sincronizando ? "⟳ Sincronizando..." : "⟳ Sincronizar ahora"}
          </button>
          {mensajeSync && (
            <p
              style={{
                fontSize: 11,
                marginTop: 6,
                color: mensajeSync.tipo === "ok" ? "#2ecc71" : "#e74c3c",
              }}
            >
              {mensajeSync.texto}
            </p>
          )}
        </div>
      </div>

      {/* Barra de progreso — estilo "barra de energía", debe resaltar sobre el resto */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#c7cede", letterSpacing: 0.5 }}>
            <span style={{ color: "#ff8a3d" }}>»» </span>AVANCE GENERAL
          </span>
          <strong style={{ fontSize: 30, textShadow: "0 0 18px rgba(255,138,61,.6)" }}>{pct}%</strong>
        </div>
        <div
          style={{
            height: 34,
            background: "#11162a",
            borderRadius: 17,
            overflow: "hidden",
            boxShadow: "inset 0 2px 6px rgba(0,0,0,.5), 0 0 0 1px #1f2740",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(255,255,255,.16) 0px, rgba(255,255,255,.16) 9px, transparent 9px, transparent 18px), linear-gradient(90deg,#ff8a3d,#ff5e3a)",
              transition: "width .4s ease",
              boxShadow: "0 0 22px rgba(255,110,58,.65)",
              borderRadius: 17,
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ fontSize: 16, color: "#c7cede", margin: 0 }}>
              Carpetas — {ESTADO_FILTRO_LABEL[filtroEstado]}{areaLabel}
            </h2>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setColapsados((prev) => ({ ...prev, __all: !prev.__all }))}
                style={{ ...chipStyle(false, "#8a93a6"), fontWeight: 700 }}
              >
                {colapsados.__all ? "▸ Expandir todo" : "▾ Colapsar todo"}
              </button>
            </div>
          </div>

          {/* Buscador rápido por nombre/ruta de carpeta */}
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="🔍 Buscar carpeta por nombre..."
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "#151b2b",
              color: "#e8ecf1",
              border: "1px solid #2a3350",
              borderRadius: 8,
              padding: "9px 12px",
              fontSize: 13,
              marginBottom: 12,
              outline: "none",
            }}
          />

          {/* Exportar reporte institucional — un PDF por cada área */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {areas.map((a) => (
              <button
                key={a}
                onClick={() => handleExportarArea(a, carpetasPorArea[a] || [])}
                disabled={exportandoArea === a}
                style={{
                  fontSize: 11,
                  padding: "6px 12px",
                  borderRadius: 20,
                  border: "1px solid #2a3350",
                  background: "#151b2b",
                  color: exportandoArea === a ? "#4a5164" : "#c7cede",
                  fontWeight: 600,
                  cursor: exportandoArea === a ? "not-allowed" : "pointer",
                }}
                title={`Exportar reporte PDF de ${a}`}
              >
                📄 {exportandoArea === a ? "Generando..." : `Exportar ${a}`}
              </button>
            ))}
          </div>

          {/* Grilla de áreas — mini círculos de progreso, un click para filtrar */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
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

          <div
            style={{
              background: "rgba(21,27,43,.5)",
              backdropFilter: "blur(6px)",
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid #1f2740",
            }}
          >
            {visibles.length === 0 && (
              <p style={{ padding: 16, color: "#8a93a6" }}>
                {carpetas.length === 0
                  ? "Sin datos todavía — esperando primera sincronización."
                  : "No hay carpetas que coincidan con el filtro."}
              </p>
            )}
            {(() => {
              // Agrupar por "especialidad": segundo nivel de la ruta, dentro de cada area.
              // Ej: "PROYECTO PRINCIPAL / 11. ESTUDIOS BASICOS / 11.1_..." se agrupa bajo
              // el encabezado "PROYECTO PRINCIPAL › 11. ESTUDIOS BASICOS"
              const grupos = {};
              const ordenGrupos = [];
              for (const c of visibles) {
                const partes = (c.ruta || c.nombre || "").split(" / ").filter(Boolean);
                const especialidad = partes.length > 1 ? partes[1] : "(raíz)";
                const key = `${c.area || "Sin área"} / ${especialidad}`;
                if (!grupos[key]) {
                  grupos[key] = { area: c.area || "Sin área", especialidad, items: [] };
                  ordenGrupos.push(key);
                }
                grupos[key].items.push(c);
              }
              ordenGrupos.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

              return ordenGrupos.map((key) => {
                const g = grupos[key];
                const HEADER_COLOR = "#1a9c6b"; // verde con buen contraste sobre blanco
                const color = HEADER_COLOR;
                const pendientesGrupo = g.items.filter((c) => c.estado !== "completa").length;
                const vaciasGrupo = g.items.filter((c) => c.estado === "vacia").length;
                const tienePendientes = pendientesGrupo > 0;
                const grupoColapsado = colapsados.__all ? !colapsados[key] : !!colapsados[key];
                return (
                  <div key={key}>
                    <div
                      onClick={() => toggleGrupo(key)}
                      style={{
                        padding: "10px 16px 10px 14px",
                        background: "#ffffff",
                        borderLeft: `4px solid ${vaciasGrupo > 0 ? "#e74c3c" : tienePendientes ? "#f39c12" : "#2ecc71"}`,
                        borderTop: "1px solid #1f2740",
                        borderBottom: "1px solid #d8dde5",
                        display: "flex",
                        alignItems: "baseline",
                        gap: 8,
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                      title={grupoColapsado ? "Click para expandir" : "Click para colapsar"}
                    >
                      <span style={{ fontSize: 12, color: "#8a93a6", transform: grupoColapsado ? "rotate(-90deg)" : "none", display: "inline-block", transition: "transform .15s ease" }}>
                        ▾
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: 0.4 }}>
                        {g.area}
                      </span>
                      <span style={{ color: "#9aa1ae", fontSize: 12 }}>›</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#000000" }}>{g.especialidad}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                        {tienePendientes && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: "2px 8px",
                              borderRadius: 20,
                              background: (vaciasGrupo > 0 ? "#e74c3c" : "#f39c12") + "22",
                              color: vaciasGrupo > 0 ? "#c0392b" : "#c67c0e",
                              fontWeight: 700,
                            }}
                          >
                            {pendientesGrupo} pendiente{pendientesGrupo !== 1 ? "s" : ""}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: "#8a93a6", fontWeight: 600 }}>
                          {g.items.length} carpeta{g.items.length !== 1 ? "s" : ""}
                        </span>
                      </span>
                    </div>
                    {!grupoColapsado && g.items.map((c) => {
                      const detalle = c.detalle || c.estado;
                      const driveUrl = `https://drive.google.com/drive/folders/${c.id}`;
                      return (
                        <div
                          key={c.id}
                          onClick={() => window.open(driveUrl, "_blank", "noopener,noreferrer")}
                          style={{
                            padding: "10px 16px 10px 24px",
                            borderBottom: "1px solid #1f2740",
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#1b2338")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          title="Abrir esta carpeta en Google Drive"
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                            <RutaJerarquica ruta={c.ruta} nombre={c.nombre} skipLevels={2} />
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
                          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                            <span style={{ fontSize: 11, color: "#8a93a6" }}>{detalle}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Log de actividad */}
        <div>
          <h2 style={{ fontSize: 16, color: "#c7cede", marginBottom: 8 }}>Actividad reciente</h2>

          {/* Resumen de conteo por tipo, de los ultimos eventos cargados */}
          {eventos.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {Object.entries(
                eventos.reduce((acc, e) => {
                  acc[e.tipo] = (acc[e.tipo] || 0) + 1;
                  return acc;
                }, {})
              ).map(([tipo, count]) => (
                <span
                  key={tipo}
                  style={{
                    fontSize: 10,
                    padding: "3px 9px",
                    borderRadius: 20,
                    background: (EVENTO_COLOR[tipo] || "#6b7280") + "22",
                    color: EVENTO_COLOR[tipo] || "#6b7280",
                    fontWeight: 700,
                  }}
                >
                  {EVENTO_ICONO[tipo] || "•"} {count} {EVENTO_LABEL[tipo] || tipo}
                </span>
              ))}
            </div>
          )}

          <div
            style={{
              background: "rgba(21,27,43,.5)",
              backdropFilter: "blur(6px)",
              borderRadius: 12,
              maxHeight: 480,
              overflowY: "auto",
              border: "1px solid #1f2740",
            }}
          >
            {eventos.length === 0 && (
              <p style={{ padding: 16, color: "#8a93a6" }}>Sin eventos todavía.</p>
            )}
            {eventos.map((e) => {
              const color = EVENTO_COLOR[e.tipo] || "#6b7280";
              const icono = EVENTO_ICONO[e.tipo] || "•";
              const fecha = e.timestamp?.toDate ? e.timestamp.toDate() : null;
              return (
                <div
                  key={e.id}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "10px 14px",
                    borderBottom: "1px solid #1f2740",
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: color + "22",
                      border: `1.5px solid ${color}`,
                      color: color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: 700,
                      marginTop: 1,
                    }}
                  >
                    {icono}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13 }}>
                      <strong>{e.usuario}</strong>{" "}
                      <span style={{ color }}>{EVENTO_LABEL[e.tipo] || e.tipo}</span>{" "}
                      <strong>{e.item}</strong>
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{e.ruta}</div>
                    <div style={{ fontSize: 10, color: "#4a5164", marginTop: 2 }} title={fecha ? fecha.toLocaleString("es-PE") : ""}>
                      {tiempoRelativo(fecha)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

// Muestra la ruta como breadcrumb jerarquico: niveles padre chicos/grises,
// nombre final de la carpeta grande y resaltado. Si hay mas de 4 niveles,
// colapsa los del medio con "…" para que siga siendo legible.
function RutaJerarquica({ ruta, nombre, skipLevels = 0 }) {
  let partes = (ruta || nombre || "").split(" / ").filter(Boolean);
  if (skipLevels > 0 && partes.length > skipLevels) {
    partes = partes.slice(skipLevels);
  }
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
  const size = 128;
  const stroke = 11;
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
        gap: 10,
        padding: "18px 10px",
        borderRadius: 14,
        border: `2px solid ${active ? color : "#1f2740"}`,
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
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize="28" fontWeight="700" fill="#e8ecf1">
          {pct}%
        </text>
      </svg>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: active ? color : "#c7cede",
          textAlign: "center",
          lineHeight: 1.25,
          maxWidth: 160,
        }}
      >
        {area}
      </div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{total} carpetas</div>
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
    <div
      style={{
        background: "rgba(21,27,43,.65)",
        backdropFilter: "blur(6px)",
        borderRadius: 12,
        padding: "18px",
        border: `1px solid ${color}33`,
        borderTop: `3px solid ${color}`,
        boxShadow: `0 0 20px ${color}22`,
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, textShadow: `0 0 14px ${color}55` }}>{value}</div>
      <div style={{ fontSize: 12, color: "#8a93a6", letterSpacing: 0.3 }}>{label}</div>
    </div>
  );
}
