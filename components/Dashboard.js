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
import { LOGO_PUNO_BASE64 } from "@/lib/logoPuno";

const COLLAPSE_STORAGE_KEY = "chijnaya_grupos_colapsados";

const ESTADO_COLOR = {
  completa: "#2ecc71",
  incompleta: "#f39c12",
  vacia: "#e74c3c",
};

const AREA_COLORS = [
  "#17a398",
  "#2e86ab",
  "#2dd4bf",
  "#17a398",
  "#2ecc71",
  "#155e75",
  "#0d9488",
  "#9db3b0",
];

function colorForArea(area) {
  let hash = 0;
  for (let i = 0; i < area.length; i++) hash = area.charCodeAt(i) + ((hash << 5) - hash);
  return AREA_COLORS[Math.abs(hash) % AREA_COLORS.length];
}

const ESTADO_OPTIONS = [
  { value: "pendientes", label: "Pendientes", color: "#17a398" },
  { value: "incompleta", label: "Incompletas", color: "#f39c12" },
  { value: "vacia", label: "Vacías", color: "#e74c3c" },
  { value: "completa", label: "Completas", color: "#2ecc71" },
  { value: "todas", label: "Todas", color: "#b7c9c6" },
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
  carpeta_creada: "#17a398",
  carpeta_borrada: "#e74c3c",
  carpeta_movida: "#2e86ab",
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
    <div className="chijnaya-fondo-animado" style={{ minHeight: "100vh", width: "100%" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        .chijnaya-fondo-animado, .chijnaya-fondo-animado * {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .chijnaya-fondo-animado {
          background: linear-gradient(
            -45deg,
            #010708,
            #0a2c33,
            #145e6a,
            #1c7d87,
            #145e6a,
            #0a2c33,
            #010708
          );
          background-size: 500% 500%;
          animation: chijnayaGradiente 8s ease infinite;
        }
        @keyframes chijnayaGradiente {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .chijnaya-fondo-animado { animation: none; }
        }
        .chijnaya-header-sticky {
          position: sticky;
          top: 0;
          z-index: 40;
          backdrop-filter: blur(10px);
          background: rgba(3,16,18,.88);
          border-bottom: 1px solid #1f4a4a;
        }
        .chijnaya-fade-in {
          animation: chijnayaFadeIn .28s ease both;
        }
        @keyframes chijnayaFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .chijnaya-fade-in { animation: none; }
        }
        .chijnaya-barra-avance {
          animation: chijnayaRayas 0.8s linear infinite;
        }
        @keyframes chijnayaRayas {
          from { background-position: 0 0, 0 0; }
          to   { background-position: 36px 0, 0 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .chijnaya-barra-avance { animation: none; }
        }
      `}</style>
      <div className="chijnaya-header-sticky">
        <div
          style={{
            maxWidth: modoPresentacion ? "100%" : 1500,
            margin: "0 auto",
            padding: modoPresentacion ? "18px 48px" : "16px 28px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 12,
            color: "#eef7f5",
          }}
        >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img
            src={LOGO_PUNO_BASE64}
            alt="Escudo Gobierno Regional de Puno"
            style={{ width: modoPresentacion ? 52 : 40, height: modoPresentacion ? 58 : 45, flexShrink: 0 }}
          />
          <div>
            <h1 style={{ fontSize: modoPresentacion ? 36 : 24, marginBottom: 4, fontWeight: 800, letterSpacing: -0.3 }}>Expediente Técnico — C.S. Chijnaya</h1>
            <p style={{ color: "#b7c9c6", marginTop: 0, marginBottom: 4, fontSize: modoPresentacion ? 16 : 14 }}>
              Estado en tiempo real de la carga de documentación
            </p>
            {resumen?.ultimaSync?.toDate && (
              <p style={{ color: "#8fa8a8", fontSize: 11, marginTop: 0 }}>
                Última sincronización: {tiempoRelativo(resumen.ultimaSync.toDate())}
              </p>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <button
            onClick={() => setModoPresentacion((v) => !v)}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "6px 14px",
              borderRadius: 20,
              border: "1px solid #2b5c5c",
              background: modoPresentacion ? "#17a39822" : "#0e2529",
              color: modoPresentacion ? "#17a398" : "#b7c9c6",
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
              border: "2px solid #17a39888",
              background: sincronizando ? "#122e2e" : "linear-gradient(90deg,#17a39833,#0e7c7233)",
              color: sincronizando ? "#9db3b0" : "#7fe0d4",
              cursor: sincronizando ? "not-allowed" : "pointer",
              boxShadow: sincronizando ? "none" : "0 0 28px rgba(23,163,152,.4)",
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
      </div>

      <div style={{ maxWidth: modoPresentacion ? "100%" : 1500, margin: "0 auto", padding: modoPresentacion ? "24px 48px 36px" : "24px 28px 32px", color: "#eef7f5" }}>

      {/* Barra de progreso — estilo "barra de energía", debe resaltar sobre el resto */}
      <div
        style={{
          marginBottom: 32,
          background: "rgba(8,28,31,.75)",
          backdropFilter: "blur(6px)",
          borderRadius: 12,
          padding: "16px 18px",
          border: "1px solid #1f4a4a",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#dceeec", letterSpacing: 0.5 }}>
            <span style={{ color: "#17a398" }}>»» </span>AVANCE GENERAL
          </span>
          <strong style={{ fontSize: 30, textShadow: "0 0 18px rgba(23,163,152,.6)" }}>{pct}%</strong>
        </div>
        <div
          style={{
            height: 34,
            background: "#0a1e20",
            borderRadius: 17,
            overflow: "hidden",
            boxShadow: "inset 0 2px 6px rgba(0,0,0,.5), 0 0 0 1px #1f4a4a",
          }}
        >
          <div
            className="chijnaya-barra-avance"
            style={{
              width: `${pct}%`,
              height: "100%",
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(255,255,255,.18) 0px, rgba(255,255,255,.18) 9px, transparent 9px, transparent 18px), linear-gradient(90deg,#17a398,#0e7c72)",
              backgroundSize: "36px 36px, 100% 100%",
              transition: "width .4s ease",
              boxShadow: "0 0 22px rgba(14,124,114,.65)",
              borderRadius: 17,
            }}
          />
        </div>
      </div>

      {/* Contadores */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 32 }}>
        <Card label="Carpetas finales" value={resumen?.totalFinales ?? "–"} color="#17a398" grande={modoPresentacion} />
        <Card label="Completas" value={resumen?.completas ?? "–"} color="#2ecc71" grande={modoPresentacion} />
        <Card label="Incompletas" value={resumen?.incompletas ?? "–"} color="#f39c12" grande={modoPresentacion} />
        <Card label="Vacías" value={resumen?.vacias ?? "–"} color="#e74c3c" grande={modoPresentacion} />
      </div>

      {/* Tendencia de avance + mapa de calor de actividad */}
      {historial.length >= 2 ? (
        <div style={{ display: "grid", gridTemplateColumns: modoPresentacion ? "1fr" : "1.4fr 1fr", gap: 16, marginBottom: 32 }}>
          <TendenciaChart historial={historial} grande={modoPresentacion} />
          <ActividadHeatmap eventos={eventosHeatmap} grande={modoPresentacion} />
        </div>
      ) : (
        <div style={{ marginBottom: 32 }}>
          <ActividadHeatmap eventos={eventosHeatmap} grande={modoPresentacion} />
        </div>
      )}

      {modoPresentacion && (
        <div
          className="chijnaya-fade-in"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 28,
            justifyItems: "center",
            marginTop: 8,
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
                tamano={260}
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
            <h2 style={{ fontSize: 16, color: "#dceeec", margin: 0 }}>
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
              background: "#0e2529",
              color: "#eef7f5",
              border: "1px solid #2b5c5c",
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
                    border: "1px solid #2b5c5c",
                    background: "#0e2529",
                    color: exportandoArea === a ? "#8fa8a8" : "#dceeec",
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
                    border: "1px solid #2b5c5c",
                    borderLeft: "none",
                    background: "#0e2529",
                    color: exportandoExcelArea === a ? "#8fa8a8" : "#2dd4bf",
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
              color="#17a398"
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
              style={{ ...chipStyle(false, "#b7c9c6"), fontWeight: 700 }}
            >
              {colapsados.__all ? "▸ Expandir todo" : "▾ Colapsar todo"}
            </button>
          </div>

          <div
            key={`${filtroEstado}-${filtroArea}-${busqueda}`}
            className="chijnaya-fade-in"
            style={{
              background: "rgba(21,27,43,.5)",
              backdropFilter: "blur(6px)",
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid #1f4a4a",
            }}
          >
            {visibles.length === 0 && (
              <div
                className="chijnaya-fade-in"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  padding: "48px 24px",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 34, opacity: 0.7 }}>
                  {carpetas.length === 0 ? "⏳" : "🔍"}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#dceeec" }}>
                  {carpetas.length === 0
                    ? "Sin datos todavía"
                    : "No hay carpetas que coincidan"}
                </div>
                <div style={{ fontSize: 12.5, color: "#8fa8a8", maxWidth: 340 }}>
                  {carpetas.length === 0
                    ? "Esperando la primera sincronización con Google Drive."
                    : "Prueba otro término de búsqueda, o cambia el filtro de estado/área arriba."}
                </div>
              </div>
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
                const HEADER_COLOR = "#0a6058"; // verde con buen contraste sobre blanco
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
                        background: "#e3f2f0",
                        borderLeft: `4px solid ${vaciasGrupo > 0 ? "#e74c3c" : tienePendientes ? "#f39c12" : "#2ecc71"}`,
                        borderTop: "1px solid #1f4a4a",
                        borderBottom: "1px solid #bcdcd8",
                        display: "flex",
                        alignItems: "baseline",
                        gap: 8,
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                      title={grupoColapsado ? "Click para expandir" : "Click para colapsar"}
                    >
                      <span style={{ fontSize: 12, color: "#2f625e", transform: grupoColapsado ? "rotate(-90deg)" : "none", display: "inline-block", transition: "transform .15s ease" }}>
                        ▾
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: 0.4 }}>
                        {g.area}
                      </span>
                      <span style={{ color: "#5ba39d", fontSize: 12 }}>›</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#0d3b3b" }}>{g.especialidad}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                        <MiniDona completas={g.items.length - pendientesGrupo} total={g.items.length} />
                        {tienePendientes && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: "2px 8px",
                              borderRadius: 20,
                              background: (vaciasGrupo > 0 ? "#e74c3c" : "#f39c12") + "22",
                              color: vaciasGrupo > 0 ? "#c0392b" : "#0d6b62",
                              fontWeight: 700,
                            }}
                          >
                            {pendientesGrupo} pendiente{pendientesGrupo !== 1 ? "s" : ""}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: "#2f625e", fontWeight: 600 }}>
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
                            borderBottom: "1px solid #1f4a4a",
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#173838")}
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
                            <span style={{ fontSize: 11, color: "#b7c9c6" }}>{detalle}</span>
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
          <h2 style={{ fontSize: 16, color: "#dceeec", marginBottom: 8 }}>Actividad reciente</h2>

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
                    background: (EVENTO_COLOR[tipo] || "#9db3b0") + "22",
                    color: EVENTO_COLOR[tipo] || "#9db3b0",
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
              border: "1px solid #1f4a4a",
            }}
          >
            {eventos.length === 0 && (
              <p style={{ padding: 16, color: "#b7c9c6" }}>Sin eventos todavía.</p>
            )}
            {eventos.map((e) => {
              const color = EVENTO_COLOR[e.tipo] || "#9db3b0";
              const icono = EVENTO_ICONO[e.tipo] || "•";
              const fecha = e.timestamp?.toDate ? e.timestamp.toDate() : null;
              return (
                <div
                  key={e.id}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "10px 14px",
                    borderBottom: "1px solid #1f4a4a",
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
                        border: "1px solid #2b5c5c",
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
                    <div style={{ fontSize: 11, color: "#9db3b0", marginTop: 2 }}>{e.ruta}</div>
                    <div style={{ fontSize: 10, color: "#8fa8a8", marginTop: 2 }} title={fecha ? fecha.toLocaleString("es-PE") : ""}>
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

      <div
        style={{
          marginTop: 40,
          padding: "14px 18px",
          background: "rgba(8,28,31,.75)",
          backdropFilter: "blur(6px)",
          border: "1px solid #1f4a4a",
          borderRadius: 12,
          textAlign: "center",
          fontSize: 11,
          color: "#8fa8a8",
          lineHeight: 1.6,
        }}
      >
        Gobierno Regional de Puno — Gerencia Regional de Infraestructura · Sub Gerencia de Estudios Definitivos
        <br />
        Expediente Técnico "C.S. Chijnaya"
        {resumen?.ultimaSync?.toDate && ` · Última sincronización: ${tiempoRelativo(resumen.ultimaSync.toDate())}`}
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
            {i > 0 && <span style={{ color: "#2b5c5c", fontSize: 11 }}>›</span>}
            <span
              style={{
                fontSize: esUltimo ? 14 : 11,
                fontWeight: esUltimo ? 700 : 500,
                color: esUltimo ? "#eef7f5" : "#8fa8a8",
              }}
            >
              {p}
              {esUltimo && <span style={{ color: "#8fa8a8", marginLeft: 4 }}>↗</span>}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function AreaMiniCard({ area, pct, total, color, active, onClick, tamano }) {
  const size = tamano || 128;
  const stroke = Math.max(9, Math.round(size * 0.06));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const fontPct = Math.round(size * 0.22);
  const fontLabel = Math.max(14, Math.round(size * 0.09));
  const fontCount = Math.max(12, Math.round(size * 0.07));

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: Math.round(size * 0.07),
        padding: "18px 10px",
        borderRadius: 14,
        border: `2px solid ${active ? color : "#1f4a4a"}`,
        background: active ? color + "18" : "#0e2529",
        cursor: "pointer",
        transition: "all .15s ease",
      }}
      title={`${area} — ${pct}% completo (${total} carpetas)`}
    >
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1f4a4a" strokeWidth={stroke} />
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
        {/* Arco chiquito que gira sin parar, para dar sensación de "actualizando en vivo" */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#eef7f5"
          strokeWidth={Math.max(2, stroke * 0.28)}
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.09} ${circumference * 0.91}`}
          opacity="0.75"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 ${size / 2} ${size / 2}`}
            to={`360 ${size / 2} ${size / 2}`}
            dur="1.3s"
            repeatCount="indefinite"
          />
        </circle>
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={fontPct} fontWeight="700" fill="#eef7f5">
          {pct}%
        </text>
      </svg>
      <div
        style={{
          fontSize: fontLabel,
          fontWeight: 700,
          color: active ? color : "#dceeec",
          textAlign: "center",
          lineHeight: 1.25,
          maxWidth: size + 60,
        }}
      >
        {area}
      </div>
      <div style={{ fontSize: fontCount, color: "#9db3b0" }}>{total} carpetas</div>
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
        background: "#0e2529",
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
          stroke="#1f4a4a"
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
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#eef7f5"
          strokeWidth={Math.max(2, stroke * 0.28)}
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.09} ${circumference * 0.91}`}
          opacity="0.75"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 ${size / 2} ${size / 2}`}
            to={`360 ${size / 2} ${size / 2}`}
            dur="1.3s"
            repeatCount="indefinite"
          />
        </circle>
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="20"
          fontWeight="700"
          fill="#eef7f5"
        >
          {pct}%
        </text>
      </svg>

      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color, marginBottom: 6 }}>{area}</div>
        <div style={{ fontSize: 12, color: "#dceeec", lineHeight: 1.7 }}>
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
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#bcdcd8" strokeWidth={stroke} />
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
    border: `1px solid ${active ? color : "#2b5c5c"}`,
    background: active ? color + "33" : "#0e2529",
    color: active ? color : "#b7c9c6",
    fontWeight: 600,
    cursor: "pointer",
  };
}

const selectStyle = {
  background: "#0e2529",
  color: "#eef7f5",
  border: "1px solid #2b5c5c",
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 12,
};

function Card({ label, value, color, grande }) {
  return (
    <div
      style={{
        background: "rgba(14,37,41,.65)",
        backdropFilter: "blur(6px)",
        borderRadius: 12,
        padding: grande ? "26px" : "18px",
        border: `1px solid ${color}33`,
        borderTop: `3px solid ${color}`,
        boxShadow: `0 0 20px ${color}22`,
      }}
    >
      <div style={{ fontSize: grande ? 44 : 28, fontWeight: 700, textShadow: `0 0 14px ${color}55` }}>{value}</div>
      <div style={{ fontSize: grande ? 15 : 12, color: "#b7c9c6", letterSpacing: 0.3 }}>{label}</div>
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
        background: "#0e2529",
        border: "1px solid #2b5c5c",
        borderRadius: 12,
        padding: "16px 18px",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: "#dceeec", marginBottom: 10 }}>
        📈 Tendencia de avance {historial.length > 0 ? `(últimos ${historial.length} días)` : ""}
      </div>

      {historial.length < 2 ? (
        <div style={{ fontSize: 12, color: "#8fa8a8", padding: "20px 0" }}>
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
                  <line key={v} x1={padding} y1={y} x2={ancho - padding} y2={y} stroke="#2b5c5c" strokeWidth="1" strokeDasharray="3,4" />
                );
              })}
              <path d={pathArea} fill="url(#tendenciaGradient)" opacity="0.35" />
              <path d={pathLinea} fill="none" stroke="#17a398" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {puntos.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={i === puntos.length - 1 ? 4.5 : 2.5} fill="#17a398">
                  <title>{`${p.fecha} — ${p.pct}%`}</title>
                </circle>
              ))}
              <defs>
                <linearGradient id="tendenciaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#17a398" />
                  <stop offset="100%" stopColor="#17a398" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* etiqueta del último valor */}
              <text x={puntos[puntos.length - 1].x} y={puntos[puntos.length - 1].y - 10} textAnchor="end" fontSize="13" fontWeight="700" fill="#7fe0d4">
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
    if (count === 0) return "#1f4a4a";
    const ratio = count / maxCount;
    if (ratio > 0.66) return "#2dd4bf";
    if (ratio > 0.33) return "#17a398";
    return "#0e7c72";
  }

  // Agrupar en semanas (columnas) para el layout tipo GitHub
  const semanas = [];
  for (let i = 0; i < dias.length; i += 7) {
    semanas.push(dias.slice(i, i + 7));
  }

  const celda = grande ? 30 : 11;
  const gap = grande ? 7 : 3;

  // Resumen de eventos por tipo dentro de la ventana visible, para llenar el
  // espacio sobrante junto al calendario con información real (no solo relleno visual)
  const conteoPorTipo = {};
  for (const e of eventos) {
    conteoPorTipo[e.tipo] = (conteoPorTipo[e.tipo] || 0) + 1;
  }
  const tiposOrdenados = Object.keys(conteoPorTipo).sort((a, b) => conteoPorTipo[b] - conteoPorTipo[a]);
  const diaMasActivo = dias.reduce((max, d) => (d.count > (max?.count || 0) ? d : max), null);

  return (
    <div
      style={{
        background: "#0e2529",
        border: "1px solid #2b5c5c",
        borderRadius: 12,
        padding: grande ? "22px 26px" : "16px 18px",
        overflowX: "auto",
      }}
    >
      <div style={{ fontSize: grande ? 17 : 14, fontWeight: 700, color: "#dceeec", marginBottom: grande ? 18 : 10 }}>
        🔥 Actividad ({DIAS} días)
      </div>
      <div style={{ display: "flex", gap: grande ? 40 : 16, alignItems: "center", flexWrap: "wrap" }}>
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
                    borderRadius: grande ? 5 : 3,
                    background: intensidad(d.count),
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        {grande && tiposOrdenados.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 220 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#9db3b0", textTransform: "uppercase", letterSpacing: 0.4 }}>
              Resumen del período
            </div>
            {tiposOrdenados.map((tipo) => (
              <div key={tipo} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15 }}>
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: (EVENTO_COLOR[tipo] || "#9db3b0") + "22",
                    border: `1.5px solid ${EVENTO_COLOR[tipo] || "#9db3b0"}`,
                    color: EVENTO_COLOR[tipo] || "#9db3b0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  {EVENTO_ICONO[tipo] || "•"}
                </span>
                <strong>{conteoPorTipo[tipo]}</strong>
                <span style={{ color: "#b7c9c6" }}>{EVENTO_LABEL[tipo] || tipo}</span>
              </div>
            ))}
            {diaMasActivo && diaMasActivo.count > 0 && (
              <div style={{ fontSize: 12.5, color: "#8fa8a8", marginTop: 6, paddingTop: 10, borderTop: "1px solid #1f4a4a" }}>
                Día más activo: <strong style={{ color: "#dceeec" }}>{diaMasActivo.fecha.toLocaleDateString("es-PE")}</strong> ({diaMasActivo.count} eventos)
              </div>
            )}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: grande ? 10 : 6,
          marginTop: grande ? 18 : 10,
          fontSize: grande ? 13 : 10,
          color: "#8fa8a8",
          flexWrap: "wrap",
        }}
      >
        <span>Sin actividad</span>
        <div style={{ width: grande ? 18 : 10, height: grande ? 18 : 10, borderRadius: 4, background: "#1f4a4a" }} />
        <span style={{ marginLeft: 8 }}>Baja</span>
        <div style={{ width: grande ? 18 : 10, height: grande ? 18 : 10, borderRadius: 4, background: "#0e7c72" }} />
        <span style={{ marginLeft: 8 }}>Media</span>
        <div style={{ width: grande ? 18 : 10, height: grande ? 18 : 10, borderRadius: 4, background: "#17a398" }} />
        <span style={{ marginLeft: 8 }}>Alta</span>
        <div style={{ width: grande ? 18 : 10, height: grande ? 18 : 10, borderRadius: 4, background: "#2dd4bf" }} />
        <span style={{ marginLeft: 10, color: "#5c7a78" }}>— cada cuadro es un día, más brillante = más eventos ese día</span>
      </div>
    </div>
  );
}
