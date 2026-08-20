import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { LOGO_PUNO_BASE64 } from "./logoPuno";

const ESTADO_LABEL = {
  completa: "COMPLETA",
  incompleta: "INCOMPLETA",
  vacia: "VACÍA",
};

// Colores en RGB (jsPDF no acepta hex directo en fillColor de autoTable)
const ESTADO_RGB = {
  completa: [46, 204, 113],
  incompleta: [243, 156, 18],
  vacia: [231, 76, 60],
};

const NARANJA_HEADER = [230, 126, 34]; // franja naranja tipo "COSTOS Y PRESUPUESTOS"

/**
 * Genera y descarga un PDF tipo "Índice General" institucional para UN área
 * (ej. "PROYECTO PRINCIPAL", "PROYECTO CONTINGENCIA", "OTROS ARCHIVOS").
 *
 * @param {string} areaNombre - nombre del área a exportar
 * @param {Array} carpetasDelArea - carpetas (ya filtradas a esa área)
 * @param {object} opts - { logoBase64, proyectoNombre, resumen }
 */
export function generarReportePorArea(areaNombre, carpetasDelArea, opts = {}) {
  const {
    logoBase64 = LOGO_PUNO_BASE64,
    proyectoNombre =
      '"MEJORAMIENTO DEL SERVICIO DE ATENCION DE SALUD BASICOS EN CHIJNAYA DISTRITO DE PUCARA DE LA PROVINCIA DE LAMPA DEL DEPARTAMENTO DE PUNO"',
  } = opts;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;

  // --- Agrupar por especialidad, igual que en el dashboard ---
  const grupos = {};
  const ordenGrupos = [];
  for (const c of carpetasDelArea) {
    const partes = (c.ruta || c.nombre || "").split(" / ").filter(Boolean);
    const especialidad = partes.length > 1 ? partes[1] : "(raíz)";
    if (!grupos[especialidad]) {
      grupos[especialidad] = [];
      ordenGrupos.push(especialidad);
    }
    grupos[especialidad].push(c);
  }
  ordenGrupos.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  // --- Cuerpo de la tabla ---
  const body = [];
  let n = 1;
  for (const especialidad of ordenGrupos) {
    body.push([
      { content: especialidad.toUpperCase(), colSpan: 4, styles: { fillColor: NARANJA_HEADER, textColor: [255, 255, 255], fontStyle: "bold", halign: "left" } },
    ]);
    for (const c of grupos[especialidad]) {
      const estado = c.estado || "incompleta";
      body.push([
        String(n++),
        c.nombre || (c.ruta || "").split(" / ").pop() || "-",
        { content: ESTADO_LABEL[estado] || estado.toUpperCase(), styles: { textColor: ESTADO_RGB[estado] || [100, 100, 100], fontStyle: "bold", halign: "center" } },
        c.detalle || "-",
      ]);
    }
  }

  // --- Encabezado institucional (se repite en cada página) ---
  function dibujarEncabezado() {
    let y = 12;
    if (logoBase64) {
      const anchoLogo = 13;
      const altoLogo = 14.6; // proporción real del escudo (1052x1182)
      doc.addImage(logoBase64, "PNG", marginX, y - 3, anchoLogo, altoLogo);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("GOBIERNO REGIONAL DE PUNO GERENCIA REGIONAL DE INFRAESTRUCTURA", pageWidth / 2, y, { align: "center" });
    y += 5;
    doc.text("SUB GERENCIA DE ESTUDIOS DEFINITIVOS", pageWidth / 2, y, { align: "center" });
    y += 6;
    doc.setFontSize(8.5);
    const lineasProyecto = doc.splitTextToSize(proyectoNombre, pageWidth - marginX * 2 - 10);
    doc.text(lineasProyecto, pageWidth / 2, y, { align: "center" });
    y += lineasProyecto.length * 4 + 4;

    // Barra de título del reporte
    doc.setFillColor(20, 30, 60);
    doc.rect(marginX, y, pageWidth - marginX * 2, 9, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text(`REPORTE DE AVANCE — ${areaNombre.toUpperCase()}`, pageWidth / 2, y + 6.2, { align: "center" });
    doc.setTextColor(0, 0, 0);
    y += 14;

    const fecha = new Date().toLocaleString("es-PE");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Generado: ${fecha}`, marginX, y);
    const total = carpetasDelArea.length;
    const completas = carpetasDelArea.filter((c) => c.estado === "completa").length;
    doc.text(`Total: ${total}  ·  Completas: ${completas}  ·  Pendientes: ${total - completas}`, pageWidth - marginX, y, { align: "right" });
    return y + 4;
  }

  const startY = dibujarEncabezado();

  autoTable(doc, {
    startY,
    margin: { left: marginX, right: marginX, top: startY },
    head: [["N°", "DESCRIPCIÓN", "ESTADO", "DETALLE"]],
    body,
    styles: { fontSize: 8.5, cellPadding: 2, valign: "middle" },
    headStyles: { fillColor: [20, 30, 60], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 26 },
      3: { cellWidth: 55 },
    },
    didDrawPage: () => {
      // Repite el encabezado institucional en páginas nuevas (menos la primera, ya dibujada)
      if (doc.internal.getCurrentPageInfo().pageNumber > 1) {
        dibujarEncabezado();
      }
    },
  });

  // Pie de página con numeración correcta (se hace al final, cuando ya se sabe el total de páginas)
  const totalPaginas = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Página ${p} de ${totalPaginas}`,
      pageWidth - marginX,
      doc.internal.pageSize.getHeight() - 8,
      { align: "right" }
    );
    doc.setTextColor(0, 0, 0);
  }

  const nombreArchivo = `Reporte_${areaNombre.replace(/[^a-zA-Z0-9]+/g, "_")}_${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(nombreArchivo);
}
