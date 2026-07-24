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

  const pendientes = carpetas
    .filter((c) => c.estado !== "completa")
    .sort((a, b) => (a.ruta || "").localeCompare(b.ruta || ""));

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
          <h2 style={{ fontSize: 16, color: "#c7cede" }}>Carpetas que faltan completar</h2>
          <div style={{ background: "#151b2b", borderRadius: 10, overflow: "hidden" }}>
            {pendientes.length === 0 && (
              <p style={{ padding: 16, color: "#8a93a6" }}>Sin datos todavía — esperando primera sincronización.</p>
            )}
            {pendientes.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: "10px 16px",
                  borderBottom: "1px solid #1f2740",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 13 }}>{c.ruta || c.nombre}</span>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 20,
                    background: ESTADO_COLOR[c.estado] + "22",
                    color: ESTADO_COLOR[c.estado],
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  {c.estado}
                </span>
              </div>
            ))}
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

function Card({ label, value, color }) {
  return (
    <div style={{ background: "#151b2b", borderRadius: 10, padding: "16px", borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#8a93a6" }}>{label}</div>
    </div>
  );
}
