import ExcelJS from "exceljs";

// --- LOGO EN BASE64 ---
const LOGO_GOBIERNO = "data:image/png;base64,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";

const ESTADO_LABEL = {
  completa: "COMPLETA",
  incompleta: "INCOMPLETA",
  vacia: "VACÍA",
};

const ESTADO_COLOR = {
  completa: "FF2ECC71",
  incompleta: "FFF39C12",
  vacia: "FFE74C3C",
};

const AZUL_OSCURO = "FF141E3C";
const NARANJA = "FFE67E22";

/**
 * Genera y descarga un Excel (.xlsx) con formato real — encabezado institucional,
 * jerarquía de hasta 7 niveles de carpetas, colores por estado,
 * bordes, columnas ajustadas, logo y nombre de proyecto.
 *
 * @param {string} areaNombre - nombre del área a exportar
 * @param {Array} carpetasDelArea - carpetas (ya filtradas a esa área)
 * @param {string} proyectoNombre - Nombre del proyecto (por defecto "PROYECTO SIN NOMBRE")
 * @param {string} logoBase64 - Logo en formato base64 para incrustar (opcional)
 */
export async function generarReporteExcelPorArea(areaNombre, carpetasDelArea, proyectoNombre = "PROYECTO SIN NOMBRE", logoBase64 = LOGO_GOBIERNO) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Visor Chijnaya";
  workbook.created = new Date();

  const nombreHoja = areaNombre.replace(/[\\/*?:[\]]/g, "").slice(0, 31) || "Reporte";
  const sheet = workbook.addWorksheet(nombreHoja, {
    // Configuración lista para imprimir "Modo Presentación"
    pageSetup: { 
      orientation: "portrait", 
      fitToPage: true, 
      fitToWidth: 1,
      margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 }
    },
  });

  sheet.columns = [
    { width: 6 },
    { width: 55 },
    { width: 16 },
    { width: 55 },
  ];

  // --- Inserción del Logo ---
  if (logoBase64) {
    // Extraemos la data pura si viene con el prefijo 'data:image...'
    const base64Data = logoBase64.includes('base64,') ? logoBase64.split('base64,')[1] : logoBase64;
    const imageId = workbook.addImage({
      base64: base64Data,
      extension: 'png',
    });
    // Se dibuja flotante en la esquina superior izquierda (A1)
    sheet.addImage(imageId, {
      tl: { col: 0.2, row: 0.2 },
      ext: { width: 70, height: 70 }
    });
  }

  // --- Encabezado institucional ---
  sheet.mergeCells("A1:D1");
  sheet.getCell("A1").value = "GOBIERNO REGIONAL DE PUNO — GERENCIA REGIONAL DE INFRAESTRUCTURA";
  sheet.getCell("A1").font = { bold: true, size: 12 };
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 20;

  sheet.mergeCells("A2:D2");
  sheet.getCell("A2").value = "SUB GERENCIA DE ESTUDIOS DEFINITIVOS";
  sheet.getCell("A2").font = { bold: true, size: 10 };
  sheet.getCell("A2").alignment = { horizontal: "center", vertical: "middle" };

  // Fila Nueva: Nombre del Proyecto
  sheet.mergeCells("A3:D3");
  const celdaProyecto = sheet.getCell("A3");
  celdaProyecto.value = `PROYECTO: ${proyectoNombre.toUpperCase()}`;
  celdaProyecto.font = { bold: true, size: 11, color: { argb: "FF4A2D0F" } };
  celdaProyecto.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  sheet.getRow(3).height = 25; 

  // Fila del Área / Especialidad general
  sheet.mergeCells("A4:D4");
  const celdaTitulo = sheet.getCell("A4");
  celdaTitulo.value = `REPORTE DE AVANCE — ${areaNombre.toUpperCase()}`;
  celdaTitulo.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  celdaTitulo.alignment = { horizontal: "center", vertical: "middle" };
  celdaTitulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_OSCURO } };
  sheet.getRow(4).height = 24;

  const total = carpetasDelArea.length;
  const completas = carpetasDelArea.filter((c) => c.estado === "completa").length;
  const incompletas = carpetasDelArea.filter((c) => c.estado === "incompleta").length;
  const vacias = carpetasDelArea.filter((c) => c.estado === "vacia").length;

  sheet.mergeCells("A5:B5");
  sheet.getCell("A5").value = `Generado: ${new Date().toLocaleString("es-PE")}`;
  sheet.getCell("A5").font = { italic: true, size: 9, color: { argb: "FF666666" } };

  sheet.mergeCells("C5:D5");
  sheet.getCell("C5").value = `Total: ${total}  ·  Completas: ${completas}  ·  Incompletas: ${incompletas}  ·  Vacías: ${vacias}`;
  sheet.getCell("C5").font = { italic: true, size: 9, color: { argb: "FF666666" } };
  sheet.getCell("C5").alignment = { horizontal: "right" };

  sheet.addRow([]); // fila 6 en blanco, de separación

  // --- Encabezado de columnas de la tabla (fila 7) ---
  const FILA_ENCABEZADO = 7;
  const filaEncabezado = sheet.getRow(FILA_ENCABEZADO);
  filaEncabezado.values = ["N°", "DESCRIPCIÓN", "ESTADO", "DETALLE"];
  filaEncabezado.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_OSCURO } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "medium", color: { argb: "FF000000" } } };
  });
  filaEncabezado.height = 18;

  // --- Agrupar por especialidad ---
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

  function comparaNatural(a, b) {
    return (a || "").localeCompare(b || "", undefined, { numeric: true, sensitivity: "base" });
  }
  ordenGrupos.sort(comparaNatural);

  let contadorFila = 1;

  function mezclarConBlanco(hexRgb, factor) {
    const r = parseInt(hexRgb.slice(2, 4), 16);
    const g = parseInt(hexRgb.slice(4, 6), 16);
    const b = parseInt(hexRgb.slice(6, 8), 16);
    const mezcla = (c) => Math.round(c + (255 - c) * factor).toString(16).padStart(2, "0").toUpperCase();
    return `FF${mezcla(r)}${mezcla(g)}${mezcla(b)}`;
  }

  // Ahora cubre 7 niveles jerárquicos
  const FACTORES_HOJA = [0.72, 0.80, 0.84, 0.87, 0.90, 0.93, 0.96];
  function colorHoja(nivelVisual) {
    const factor = FACTORES_HOJA[Math.min((nivelVisual || 1) - 1, FACTORES_HOJA.length - 1)];
    return mezclarConBlanco(NARANJA, factor);
  }

  function agregarSubEncabezado(nombre, nivel) {
    const fila = sheet.addRow([`➤  ${nombre}`]);
    sheet.mergeCells(`A${fila.number}:D${fila.number}`);
    const celda = fila.getCell(1);
    const esNivel1 = nivel === 1;
    // Expansión a 7 niveles visuales
    const factoresPorNivel = [0, 0.40, 0.55, 0.65, 0.75, 0.85, 0.92]; 
    const factor = factoresPorNivel[Math.min(nivel - 1, factoresPorNivel.length - 1)];
    celda.font = { bold: true, size: esNivel1 ? 13 : 11, color: { argb: esNivel1 ? "FFFFFFFF" : "FF4A2D0F" } };
    celda.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: mezclarConBlanco(NARANJA, factor) },
    };
    celda.alignment = { horizontal: "left", vertical: "middle", indent: Math.max(0, nivel - 1) * 2 };
    fila.height = esNivel1 ? 20 : 17;
  }

  function agregarFila(c, nivelVisual) {
    const estado = c.estado || "incompleta";
    const nombreMostrado = c.nombre || (c.ruta || "").split(" / ").pop() || "-";
    const fila = sheet.addRow([contadorFila++, nombreMostrado, ESTADO_LABEL[estado] || estado.toUpperCase(), c.detalle || "-"]);
    const fondo = colorHoja(nivelVisual);

    fila.getCell(1).alignment = { horizontal: "center", vertical: "top" };
    fila.getCell(2).alignment = { wrapText: true, vertical: "top", indent: Math.max(0, (nivelVisual || 1) - 1) * 2 };
    fila.getCell(3).font = { bold: true, color: { argb: ESTADO_COLOR[estado] || "FF666666" } };
    fila.getCell(3).alignment = { horizontal: "center", vertical: "top" };
    fila.getCell(4).alignment = { wrapText: true, vertical: "top" };

    fila.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fondo } };
      cell.border = {
        top: { style: "hair", color: { argb: "FFDDDDDD" } },
        bottom: { style: "hair", color: { argb: "FFDDDDDD" } },
        left: { style: "hair", color: { argb: "FFDDDDDD" } },
        right: { style: "hair", color: { argb: "FFDDDDDD" } },
      };
    });
  }

  // Se amplía a 6 intermedios (raíz + 5 ramas) + hoja = 7 niveles
  const NIVEL_MAX_INTERMEDIO = 6;
  function agruparRecursivo(items, nivelIdxRuta, nivelVisual) {
    if (nivelIdxRuta > NIVEL_MAX_INTERMEDIO) {
      const ordenado = [...items].sort((a, b) => comparaNatural(a.nombre, b.nombre));
      ordenado.forEach((c) => agregarFila(c, nivelVisual));
      return;
    }

    const subgrupos = {};
    let hayNivelMasProfundo = false;
    for (const c of items) {
      const partes = (c.ruta || c.nombre || "").split(" / ").filter(Boolean);
      const clave = partes.length > nivelIdxRuta + 1 ? partes[nivelIdxRuta] : null;
      if (clave) hayNivelMasProfundo = true;
      const key = clave || `__directo__${c.nombre || c.id}`;
      if (!subgrupos[key]) subgrupos[key] = [];
      subgrupos[key].push(c);
    }

    if (!hayNivelMasProfundo) {
      const ordenado = [...items].sort((a, b) => comparaNatural(a.nombre, b.nombre));
      ordenado.forEach((c) => agregarFila(c, nivelVisual));
      return;
    }

    const entradas = Object.keys(subgrupos).map((key) => ({
      key,
      nombreOrden: key.startsWith("__directo__") ? subgrupos[key][0].nombre || "" : key,
      esGrupo: !key.startsWith("__directo__"),
    }));
    entradas.sort((a, b) => comparaNatural(a.nombreOrden, b.nombreOrden));

    for (const entrada of entradas) {
      if (entrada.esGrupo) {
        agregarSubEncabezado(entrada.key, nivelVisual);
        agruparRecursivo(subgrupos[entrada.key], nivelIdxRuta + 1, nivelVisual + 1);
      } else {
        const ordenado = [...subgrupos[entrada.key]].sort((a, b) => comparaNatural(a.nombre, b.nombre));
        ordenado.forEach((c) => agregarFila(c, nivelVisual));
      }
    }
  }

  for (const especialidad of ordenGrupos) {
    agregarSubEncabezado(especialidad.toUpperCase(), 1);
    agruparRecursivo(grupos[especialidad], 2, 2);
  }

  sheet.views = [{ state: "frozen", ySplit: FILA_ENCABEZADO }];

  // --- Descargar ---
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Reporte_${areaNombre.replace(/[^a-zA-Z0-9]+/g, "_")}_${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
