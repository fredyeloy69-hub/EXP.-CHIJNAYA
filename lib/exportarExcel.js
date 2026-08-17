import * as XLSX from "xlsx";

const ESTADO_LABEL = {
  completa: "COMPLETA",
  incompleta: "INCOMPLETA",
  vacia: "VACÍA",
};

/**
 * Genera y descarga un Excel (.xlsx) editable con el detalle de carpetas de UN área.
 * Una fila por carpeta, agrupada visualmente por especialidad (columna aparte,
 * para que se pueda filtrar/ordenar libremente en Excel).
 *
 * @param {string} areaNombre - nombre del área a exportar
 * @param {Array} carpetasDelArea - carpetas (ya filtradas a esa área)
 */
export function generarReporteExcelPorArea(areaNombre, carpetasDelArea) {
  const filas = carpetasDelArea.map((c, i) => {
    const partes = (c.ruta || c.nombre || "").split(" / ").filter(Boolean);
    const especialidad = partes.length > 1 ? partes[1] : "(raíz)";
    const estado = c.estado || "incompleta";
    return {
      "N°": i + 1,
      "Especialidad": especialidad,
      "Carpeta": c.nombre || partes[partes.length - 1] || "-",
      "Ruta completa": c.ruta || "-",
      "Estado": ESTADO_LABEL[estado] || estado.toUpperCase(),
      "Detalle": c.detalle || "-",
      "N° de PDFs": c.pdfCount ?? "-",
      "Extensiones editables": Array.isArray(c.extensionesEditables) ? c.extensionesEditables.join(", ") : "-",
    };
  });

  // Ordenar por especialidad (numérico natural) y luego por nombre de carpeta
  filas.sort((a, b) => {
    const cmpEsp = a["Especialidad"].localeCompare(b["Especialidad"], undefined, { numeric: true, sensitivity: "base" });
    if (cmpEsp !== 0) return cmpEsp;
    return a["Carpeta"].localeCompare(b["Carpeta"], undefined, { numeric: true, sensitivity: "base" });
  });
  filas.forEach((f, i) => (f["N°"] = i + 1));

  const hoja = XLSX.utils.json_to_sheet(filas);

  // Anchos de columna razonables para que se lea bien al abrir
  hoja["!cols"] = [
    { wch: 5 },  // N°
    { wch: 28 }, // Especialidad
    { wch: 40 }, // Carpeta
    { wch: 55 }, // Ruta completa
    { wch: 12 }, // Estado
    { wch: 45 }, // Detalle
    { wch: 10 }, // N° de PDFs
    { wch: 20 }, // Extensiones editables
  ];

  const libro = XLSX.utils.book_new();
  // Nombre de hoja: máximo 31 caracteres, sin caracteres inválidos
  const nombreHoja = areaNombre.replace(/[\\/*?:[\]]/g, "").slice(0, 31) || "Reporte";
  XLSX.utils.book_append_sheet(libro, hoja, nombreHoja);

  const nombreArchivo = `Reporte_${areaNombre.replace(/[^a-zA-Z0-9]+/g, "_")}_${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`;
  XLSX.writeFile(libro, nombreArchivo);
}
