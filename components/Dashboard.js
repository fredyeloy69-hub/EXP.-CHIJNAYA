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
import { generarReporteExcelPorArea } from "@/lib/exportarExcel";

const COLLAPSE_STORAGE_KEY = "chijnaya_grupos_colapsados";

const ESTADO_COLOR = {
  completa: "#2ecc71",
  incompleta: "#f39c12",
  vacia: "#e74c3c",
};

const AREA_COLORS = [
  "#e0a640",
  "#c9622a",
  "#ff6f61",
  "#ff8a3d",
  "#2ecc71",
  "#8c3b1b",
  "#e0b800",
  "#9c8a76",
];

function colorForArea(area) {
  let hash = 0;
  for (let i = 0; i < area.length; i++) hash = area.charCodeAt(i) + ((hash << 5) - hash);
  return AREA_COLORS[Math.abs(hash) % AREA_COLORS.length];
}

const ESTADO_OPTIONS = [
  { value: "pendientes", label: "Pendientes", color: "#e0a640" },
  { value: "incompleta", label: "Incompletas", color: "#f39c12" },
  { value: "vacia", label: "Vacías", color: "#e74c3c" },
  { value: "completa", label: "Completas", color: "#2ecc71" },
  { value: "todas", label: "Todas", color: "#b0a08c" },
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
  carpeta_creada: "#e0a640",
  carpeta_borrada: "#e74c3c",
  carpeta_movida: "#c9622a",
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
  const [exportandoExcelArea, setExportandoExcelArea] = useState(null);
  const [modoPresentacion, setModoPresentacion] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [eventosHeatmap, setEventosHeatmap] = useState([]);

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

  function handleExportarExcelArea(areaNombre, carpetasDelArea) {
    setExportandoExcelArea(areaNombre);
    try {
      generarReporteExcelPorArea(areaNombre, carpetasDelArea);
    } finally {
      setExportandoExcelArea(null);
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

    // Ventana más amplia de eventos solo para el heatmap de actividad (no se muestra en la lista)
    const eventosHeatmapQuery = query(
      collection(db, "eventos"),
      orderBy("timestamp", "desc"),
      limit(600)
    );
    const unsubEventosHeatmap = onSnapshot(eventosHeatmapQuery, (snap) => {
      setEventosHeatmap(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // Historial diario (guardado por syncEngine) para el gráfico de tendencia
    const historialQuery = query(
      collection(db, "historial"),
      orderBy("fecha", "asc"),
      limit(90)
    );
    const unsubHistorial = onSnapshot(historialQuery, (snap) => {
      setHistorial(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubResumen();
      unsubCarpetas();
      unsubEventos();
      unsubEventosHeatmap();
      unsubHistorial();
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
          "radial-gradient(circle at 20% 0%, #2b1810 0%, #170d08 45%, #0d0705 100%)",
      }}
    >
      <div style={{ maxWidth: 1500, margin: "0 auto", padding: "32px 28px", color: "#f5ede0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 4 }}>Expediente Técnico — C.S. Chijnaya</h1>
          <p style={{ color: "#b0a08c", marginTop: 0, marginBottom: 4 }}>
            Estado en tiempo real de la carga de documentación
          </p>
          {resumen?.ultimaSync?.toDate && (
            <p style={{ color: "#8a7a68", fontSize: 11, marginTop: 0 }}>
              Última sincronización: {tiempoRelativo(resumen.ultimaSync.toDate())}
            </p>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <button
            onClick={() => setModoPresentacion((v) => !v)}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "6px 14px",
              borderRadius: 20,
              border: "1px solid #4a3020",
              background: modoPresentacion ? "#e0a64022" : "#221510",
              color: modoPresentacion ? "#e0a640" : "#b0a08c",
              cursor: "pointer",
              marginBottom: 10,
            }}
          >
            {modoPresentacion ? "✕ Salir de presentación" : "🖥 Modo presentación"}
          </button>
          <br />
          <button
            onClick={handleSync}
            disabled={sincronizando}
            style={{
              fontSize: 20,
              fontWeight: 800,
              padding: "22px 42px",
              borderRadius: 16,
              border: "2px solid #ff8a3d88",
              background: sincronizando ? "#241a12" : "linear-gradient(90deg,#ff8a3d33,#ff5e3a33)",
              color: sincronizando ? "#9c8a76" : "#ffb27a",
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
          <span style={{ fontSize: 16, fontWeight: 700, color: "#e8dcc8", letterSpacing: 0.5 }}>
            <span style={{ color: "#ff8a3d" }}>»» </span>AVANCE GENERAL
          </span>
          <strong style={{ fontSize: 30, textShadow: "0 0 18px rgba(255,138,61,.6)" }}>{pct}%</strong>
        </div>
        <div
          style={{
            height: 34,
            background: "#1c120a",
            borderRadius: 17,
            overflow: "hidden",
            boxShadow: "inset 0 2px 6px rgba(0,0,0,.5), 0 0 0 1px #3a2418",
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
        <Card label="Carpetas finales" value={resumen?.totalFinales ?? "–"} color="#e0a640" />
        <Card label="Completas" value={resumen?.completas ?? "–"} color="#2ecc71" />
        <Card label="Incompletas" value={resumen?.incompletas ?? "–"} color="#f39c12" />
        <Card label="Vacías" value={resumen?.vacias ?? "–"} color="#e74c3c" />
      </div>

      {/* Tendencia de avance + mapa de calor de actividad — siempre visibles */}
      <div style={{ display: "grid", gridTemplateColumns: modoPresentacion ? "1fr" : "1.4fr 1fr", gap: 16, marginBottom: 32 }}>
        <TendenciaChart historial={historial} grande={modoPresentacion} />
        <ActividadHeatmap eventos={eventosHeatmap} grande={modoPresentacion} />
      </div>

      {modoPresentacion && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          {areas.map((a) => {
            const stats = areaStats[a] || { total: 0, completas: 0 };
            const pctArea = stats.total > 0 ? Math.round((stats.completas / stats.total) * 100) : 0;
            return (
              <AreaMiniCard
                key={a}
                area={a}
                pct={pctArea}
                total={stats.total}
                color={colorForArea(a)}
                active={false}
                onClick={() => {}}
                tamano={170}
              />
            );
          })}
        </div>
      )}

      {!modoPresentacion && (
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 24 }}>
        {/* Carpetas pendientes */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ fontSize: 16, color: "#e8dcc8", margin: 0 }}>
              Carpetas — {ESTADO_FILTRO_LABEL[filtroEstado]}{areaLabel}
            </h2>
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
              background: "#221510",
              color: "#f5ede0",
              border: "1px solid #4a3020",
              borderRadius: 8,
              padding: "9px 12px",
              fontSize: 13,
              marginBottom: 12,
              outline: "none",
            }}
          />

          {/* Exportar reporte institucional — un PDF y un Excel por cada área */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            {areas.map((a) => (
              <div key={a} style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => handleExportarArea(a, carpetasPorArea[a] || [])}
                  disabled={exportandoArea === a}
                  style={{
                    fontSize: 11,
                    padding: "6px 12px",
                    borderRadius: "20px 0 0 20px",
                    border: "1px solid #4a3020",
                    background: "#221510",
                    color: exportandoArea === a ? "#8a7a68" : "#e8dcc8",
                    fontWeight: 600,
                    cursor: exportandoArea === a ? "not-allowed" : "pointer",
                  }}
                  title={`Exportar reporte PDF de ${a}`}
                >
                  📄 {exportandoArea === a ? "Generando..." : `PDF ${a}`}
                </button>
                <button
                  onClick={() => handleExportarExcelArea(a, carpetasPorArea[a] || [])}
                  disabled={exportandoExcelArea === a}
                  style={{
                    fontSize: 11,
                    padding: "6px 12px",
                    borderRadius: "0 20px 20px 0",
                    border: "1px solid #4a3020",
                    borderLeft: "none",
                    background: "#221510",
                    color: exportandoExcelArea === a ? "#8a7a68" : "#7fd88f",
                    fontWeight: 600,
                    cursor: exportandoExcelArea === a ? "not-allowed" : "pointer",
                  }}
                  title={`Exportar reporte Excel (editable) de ${a}`}
                >
                  📊 {exportandoExcelArea === a ? "Generando..." : "Excel"}
                </button>
              </div>
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
              color="#e0a640"
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
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            {ESTADO_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFiltroEstado(opt.value)}
                style={chipStyle(filtroEstado === opt.value, opt.color)}
              >
                {opt.label}
              </button>
            ))}
            <button
              onClick={() => setColapsados((prev) => ({ ...prev, __all: !prev.__all }))}
              style={{ ...chipStyle(false, "#b0a08c"), fontWeight: 700 }}
            >
              {colapsados.__all ? "▸ Expandir todo" : "▾ Colapsar todo"}
            </button>
          </div>

          <div
            style={{
              background: "rgba(21,27,43,.5)",
              backdropFilter: "blur(6px)",
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid #3a2418",
            }}
          >
            {visibles.length === 0 && (
              <p style={{ padding: 16, color: "#b0a08c" }}>
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
                        background: "#f5e6d3",
                        borderLeft: `4px solid ${vaciasGrupo > 0 ? "#e74c3c" : tienePendientes ? "#f39c12" : "#2ecc71"}`,
                        borderTop: "1px solid #3a2418",
                        borderBottom: "1px solid #d9c2a0",
                        display: "flex",
                        alignItems: "baseline",
                        gap: 8,
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                      title={grupoColapsado ? "Click para expandir" : "Click para colapsar"}
                    >
                      <span style={{ fontSize: 12, color: "#8a6a4a", transform: grupoColapsado ? "rotate(-90deg)" : "none", display: "inline-block", transition: "transform .15s ease" }}>
                        ▾
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: 0.4 }}>
                        {g.area}
                      </span>
                      <span style={{ color: "#a3856a", fontSize: 12 }}>›</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#4a2a12" }}>{g.especialidad}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                        <MiniDona completas={g.items.length - pendientesGrupo} total={g.items.length} />
                        {tienePendientes && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: "2px 8px",
                              borderRadius: 20,
                              background: (vaciasGrupo > 0 ? "#e74c3c" : "#f39c12") + "22",
                              color: vaciasGrupo > 0 ? "#c0392b" : "#93590a",
                              fontWeight: 700,
                            }}
                          >
                            {pendientesGrupo} pendiente{pendientesGrupo !== 1 ? "s" : ""}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: "#8a6a4a", fontWeight: 600 }}>
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
                            borderBottom: "1px solid #3a2418",
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#2e1f14")}
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
                            <span style={{ fontSize: 11, color: "#b0a08c" }}>{detalle}</span>
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
          <h2 style={{ fontSize: 16, color: "#e8dcc8", marginBottom: 8 }}>Actividad reciente</h2>

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
                    background: (EVENTO_COLOR[tipo] || "#9c8a76") + "22",
                    color: EVENTO_COLOR[tipo] || "#9c8a76",
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
              border: "1px solid #3a2418",
            }}
          >
            {eventos.length === 0 && (
              <p style={{ padding: 16, color: "#b0a08c" }}>Sin eventos todavía.</p>
            )}
            {eventos.map((e) => {
              const color = EVENTO_COLOR[e.tipo] || "#9c8a76";
              const icono = EVENTO_ICONO[e.tipo] || "•";
              const fecha = e.timestamp?.toDate ? e.timestamp.toDate() : null;
              return (
                <div
                  key={e.id}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "10px 14px",
                    borderBottom: "1px solid #3a2418",
                  }}
                >
                  {e.thumbnailLink && (
                    <img
                      src={e.thumbnailLink}
                      alt=""
                      style={{
                        flexShrink: 0,
                        width: 34,
                        height: 34,
                        objectFit: "cover",
                        borderRadius: 6,
                        border: "1px solid #4a3020",
                        marginTop: 1,
                      }}
                      onError={(ev) => {
                        ev.currentTarget.style.display = "none";
                      }}
                    />
                  )}
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
                    <div style={{ fontSize: 11, color: "#9c8a76", marginTop: 2 }}>{e.ruta}</div>
                    <div style={{ fontSize: 10, color: "#8a7a68", marginTop: 2 }} title={fecha ? fecha.toLocaleString("es-PE") : ""}>
                      {tiempoRelativo(fecha)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}
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
            {i > 0 && <span style={{ color: "#5c4530", fontSize: 11 }}>›</span>}
            <span
              style={{
                fontSize: esUltimo ? 14 : 11,
                fontWeight: esUltimo ? 700 : 500,
                color: esUltimo ? "#f5ede0" : "#a08e78",
              }}
            >
              {p}
              {esUltimo && <span style={{ color: "#8a7a68", marginLeft: 4 }}>↗</span>}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function AreaMiniCard({ area, pct, total, color, active, onClick, tamano }) {
  const size = tamano || 128;
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
        border: `2px solid ${active ? color : "#3a2418"}`,
        background: active ? color + "18" : "#221510",
        cursor: "pointer",
        transition: "all .15s ease",
      }}
      title={`${area} — ${pct}% completo (${total} carpetas)`}
    >
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#3a2418" strokeWidth={stroke} />
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
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize="28" fontWeight="700" fill="#f5ede0">
          {pct}%
        </text>
      </svg>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: active ? color : "#e8dcc8",
          textAlign: "center",
          lineHeight: 1.25,
          maxWidth: 160,
        }}
      >
        {area}
      </div>
      <div style={{ fontSize: 12, color: "#9c8a76" }}>{total} carpetas</div>
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
        background: "#221510",
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
          stroke="#3a2418"
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
          fill="#f5ede0"
        >
          {pct}%
        </text>
      </svg>

      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color, marginBottom: 6 }}>{area}</div>
        <div style={{ fontSize: 12, color: "#e8dcc8", lineHeight: 1.7 }}>
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

// Mini dona de progreso (completas vs total), para meter dentro del header de cada grupo
function MiniDona({ completas, total }) {
  const size = 22;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = total > 0 ? completas / total : 0;
  const offset = circumference - pct * circumference;
  const color = pct >= 1 ? "#2ecc71" : pct > 0 ? "#f39c12" : "#e74c3c";

  return (
    <svg width={size} height={size} title={`${completas} de ${total} completas`}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#d9c2a0" strokeWidth={stroke} />
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
      />
    </svg>
  );
}

function chipStyle(active, color) {
  return {
    fontSize: 11,
    padding: "5px 10px",
    borderRadius: 20,
    border: `1px solid ${active ? color : "#4a3020"}`,
    background: active ? color + "33" : "#221510",
    color: active ? color : "#b0a08c",
    fontWeight: 600,
    cursor: "pointer",
  };
}

const selectStyle = {
  background: "#221510",
  color: "#f5ede0",
  border: "1px solid #4a3020",
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 12,
};

function Card({ label, value, color }) {
  return (
    <div
      style={{
        background: "rgba(34,21,16,.65)",
        backdropFilter: "blur(6px)",
        borderRadius: 12,
        padding: "18px",
        border: `1px solid ${color}33`,
        borderTop: `3px solid ${color}`,
        boxShadow: `0 0 20px ${color}22`,
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, textShadow: `0 0 14px ${color}55` }}>{value}</div>
      <div style={{ fontSize: 12, color: "#b0a08c", letterSpacing: 0.3 }}>{label}</div>
    </div>
  );
}

// Gráfico de línea simple (SVG a mano, sin librerías) mostrando el % de avance
// general día a día, usando los puntos guardados en la colección "historial".
function TendenciaChart({ historial, grande }) {
  const alto = grande ? 220 : 150;
  const ancho = 600; // viewBox — el SVG escala solo al ancho real del contenedor

  return (
    <div
      style={{
        background: "#221510",
        border: "1px solid #4a3020",
        borderRadius: 12,
        padding: "16px 18px",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: "#e8dcc8", marginBottom: 10 }}>
        📈 Tendencia de avance {historial.length > 0 ? `(últimos ${historial.length} días)` : ""}
      </div>

      {historial.length < 2 ? (
        <div style={{ fontSize: 12, color: "#8a7a68", padding: "20px 0" }}>
          Todavía no hay suficiente historial — este gráfico se va llenando con cada sincronización diaria.
        </div>
      ) : (
        (() => {
          const padding = 26;
          const puntos = historial.map((h, i) => {
            const x = padding + (i / (historial.length - 1)) * (ancho - padding * 2);
            const y = alto - padding - (h.pct / 100) * (alto - padding * 2);
            return { x, y, pct: h.pct, fecha: h.fecha };
          });
          const pathLinea = puntos.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
          const pathArea =
            `M ${puntos[0].x} ${alto - padding} ` +
            puntos.map((p) => `L ${p.x} ${p.y}`).join(" ") +
            ` L ${puntos[puntos.length - 1].x} ${alto - padding} Z`;

          return (
            <svg viewBox={`0 0 ${ancho} ${alto}`} style={{ width: "100%", height: alto, display: "block" }}>
              {/* líneas guía horizontales */}
              {[0, 25, 50, 75, 100].map((v) => {
                const y = alto - padding - (v / 100) * (alto - padding * 2);
                return (
                  <line key={v} x1={padding} y1={y} x2={ancho - padding} y2={y} stroke="#4a3020" strokeWidth="1" strokeDasharray="3,4" />
                );
              })}
              <path d={pathArea} fill="url(#tendenciaGradient)" opacity="0.35" />
              <path d={pathLinea} fill="none" stroke="#ff8a3d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {puntos.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={i === puntos.length - 1 ? 4.5 : 2.5} fill="#ff8a3d">
                  <title>{`${p.fecha} — ${p.pct}%`}</title>
                </circle>
              ))}
              <defs>
                <linearGradient id="tendenciaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff8a3d" />
                  <stop offset="100%" stopColor="#ff8a3d" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* etiqueta del último valor */}
              <text x={puntos[puntos.length - 1].x} y={puntos[puntos.length - 1].y - 10} textAnchor="end" fontSize="13" fontWeight="700" fill="#ffb27a">
                {puntos[puntos.length - 1].pct}%
              </text>
            </svg>
          );
        })()
      )}
    </div>
  );
}

// Mapa de calor tipo GitHub — cuadraditos por día mostrando cuánta actividad hubo
// (subidas, reemplazos, borrados, etc.), usando la colección "eventos".
function ActividadHeatmap({ eventos, grande }) {
  const DIAS = grande ? 119 : 84; // ~17 o ~12 semanas

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  // Cuenta eventos por día (clave YYYY-MM-DD)
  const conteoPorDia = {};
  for (const e of eventos) {
    const fecha = e.timestamp?.toDate ? e.timestamp.toDate() : null;
    if (!fecha) continue;
    const key = fecha.toISOString().slice(0, 10);
    conteoPorDia[key] = (conteoPorDia[key] || 0) + 1;
  }

  const dias = [];
  for (let i = DIAS - 1; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dias.push({ key, count: conteoPorDia[key] || 0, fecha: d });
  }

  const maxCount = Math.max(1, ...dias.map((d) => d.count));
  function intensidad(count) {
    if (count === 0) return "#3a2418";
    const ratio = count / maxCount;
    if (ratio > 0.66) return "#ff5e3a";
    if (ratio > 0.33) return "#ff8a3d";
    return "#e0a640";
  }

  // Agrupar en semanas (columnas) para el layout tipo GitHub
  const semanas = [];
  for (let i = 0; i < dias.length; i += 7) {
    semanas.push(dias.slice(i, i + 7));
  }

  const celda = grande ? 13 : 11;
  const gap = 3;

  return (
    <div
      style={{
        background: "#221510",
        border: "1px solid #4a3020",
        borderRadius: 12,
        padding: "16px 18px",
        overflowX: "auto",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: "#e8dcc8", marginBottom: 10 }}>
        🔥 Actividad ({DIAS} días)
      </div>
      <div style={{ display: "flex", gap: gap }}>
        {semanas.map((semana, si) => (
          <div key={si} style={{ display: "flex", flexDirection: "column", gap: gap }}>
            {semana.map((d) => (
              <div
                key={d.key}
                title={`${d.fecha.toLocaleDateString("es-PE")} — ${d.count} evento${d.count !== 1 ? "s" : ""}`}
                style={{
                  width: celda,
                  height: celda,
                  borderRadius: 3,
                  background: intensidad(d.count),
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 10, color: "#8a7a68" }}>
        Menos
        <div style={{ width: 10, height: 10, borderRadius: 2, background: "#3a2418" }} />
        <div style={{ width: 10, height: 10, borderRadius: 2, background: "#e0a640" }} />
        <div style={{ width: 10, height: 10, borderRadius: 2, background: "#ff8a3d" }} />
        <div style={{ width: 10, height: 10, borderRadius: 2, background: "#ff5e3a" }} />
        Más
      </div>
    </div>
  );
}
