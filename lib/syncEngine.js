import { adminDb } from "./firebaseAdmin";
import { scanDriveTree, getUltimoActorDeItem } from "./googleDrive";
import { FieldValue } from "firebase-admin/firestore";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const WORD_EXT = [".docx", ".doc"];
const EXCEL_EXT = [".xlsx", ".xls"];
// DWG = plano editable de AutoCAD. .bak es el respaldo automático del mismo archivo
// (mismo contenido, mismo propósito) — se trata igual que el .dwg para efectos de completitud.
const DWG_EXT = [".dwg", ".bak"];

function getExt(name) {
  const lower = name.toLowerCase();
  const match = lower.match(/\.[a-z0-9]+$/);
  return match ? match[0] : "";
}

function classifyFile(name) {
  const ext = getExt(name);
  if (ext === ".pdf") return "pdf";
  if (WORD_EXT.includes(ext)) return "word";
  if (EXCEL_EXT.includes(ext)) return "excel";
  if (DWG_EXT.includes(ext)) return "dwg";
  return "otro";
}

function buildPath(id, nodes, rootId) {
  const parts = [];
  let current = nodes[id];
  while (current && current.id !== rootId) {
    parts.unshift(current.name);
    current = nodes[current.parentId];
  }
  return parts.join(" / ");
}

// Primer segmento de la ruta = área / especialidad (ej. "PROYECTO CONTINGENCIA", "OTROS ARCHIVOS")
function extractArea(ruta) {
  if (!ruta) return "Sin área";
  const primerSegmento = ruta.split(" / ")[0];
  return primerSegmento || "Sin área";
}

// Convierte la lista plana de Drive en un mapa de nodos + arma la jerarquia
function buildTree(items, rootId) {
  const nodes = {};
  for (const item of items) {
    nodes[item.id] = {
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      parentId: item.parents ? item.parents[0] : rootId,
      modifiedTime: item.modifiedTime,
      md5Checksum: item.md5Checksum || null,
      webViewLink: item.webViewLink || null,
      thumbnailLink: item.thumbnailLink || null,
      lastModifyingUser:
        item.lastModifyingUser?.displayName ||
        item.lastModifyingUser?.emailAddress ||
        "Desconocido",
      isFolder: item.mimeType === FOLDER_MIME,
      childFolderIds: [],
      files: [],
    };
  }

  for (const id in nodes) {
    const node = nodes[id];
    const parent = nodes[node.parentId];
    if (parent && node.isFolder) parent.childFolderIds.push(id);
  }

  for (const id in nodes) {
    const node = nodes[id];
    if (!node.isFolder) {
      const parent = nodes[node.parentId];
      if (parent) parent.files.push(node);
    }
  }

  return nodes;
}

// Devuelve { estado, detalle, tienePdf, tieneEditable, pdfCount, extensionesEditables }
// estado: completa | incompleta | vacia
// detalle: texto especifico indicando extension exacta (.docx, .xlsx) y cantidad de PDFs
function computeEstado(folderNode) {
  if (folderNode.files.length === 0) {
    return {
      estado: "vacia",
      detalle: "Carpeta vacía — sin archivos",
      tienePdf: false,
      tieneEditable: false,
      pdfCount: 0,
      extensionesEditables: [],
    };
  }

  const pdfFiles = folderNode.files.filter((f) => classifyFile(f.name) === "pdf");
  const wordFiles = folderNode.files.filter((f) => classifyFile(f.name) === "word");
  const excelFiles = folderNode.files.filter((f) => classifyFile(f.name) === "excel");
  const dwgFiles = folderNode.files.filter((f) => classifyFile(f.name) === "dwg");
  const otrosFiles = folderNode.files.filter((f) => classifyFile(f.name) === "otro");

  const otrosExts = Array.from(
    new Set(otrosFiles.map((f) => getExt(f.name).replace(".", "").toUpperCase()))
  ).filter(Boolean);
  const otrosLabel = otrosExts.length > 0 ? `archivos ${otrosExts.join(", ")}` : "otros archivos";

  const tienePdf = pdfFiles.length > 0;
  const tieneWord = wordFiles.length > 0;
  const tieneExcel = excelFiles.length > 0;
  const tieneDwg = dwgFiles.length > 0;
  const tieneEditable = tieneWord || tieneExcel || tieneDwg;

  // Arma el texto "Word", "Word y Excel", "Word, Excel y DWG", etc. según lo que haya
  const nombresList = [];
  if (tieneWord) nombresList.push("Word");
  if (tieneExcel) nombresList.push("Excel");
  if (tieneDwg) nombresList.push("DWG");
  let nombresEditables = "";
  if (nombresList.length === 1) nombresEditables = nombresList[0];
  else if (nombresList.length === 2) nombresEditables = nombresList.join(" y ");
  else if (nombresList.length === 3) nombresEditables = `${nombresList[0]}, ${nombresList[1]} y ${nombresList[2]}`;

  const extensionesEditables = Array.from(
    new Set([
      ...(tieneWord ? [getExt(wordFiles[0].name)] : []),
      ...(tieneExcel ? [getExt(excelFiles[0].name)] : []),
      ...(tieneDwg ? [getExt(dwgFiles[0].name)] : []),
    ])
  );

  if (tienePdf && tieneEditable) {
    return {
      estado: "completa",
      detalle: `Completa — ${pdfFiles.length} PDF y ${nombresEditables}`,
      tienePdf,
      tieneEditable,
      pdfCount: pdfFiles.length,
      extensionesEditables,
    };
  }

  if (tienePdf && !tieneEditable) {
    return {
      estado: "incompleta",
      detalle: `Falta Word, Excel o DWG — solo tiene ${pdfFiles.length} PDF`,
      tienePdf,
      tieneEditable,
      pdfCount: pdfFiles.length,
      extensionesEditables,
    };
  }

  if (!tienePdf && tieneEditable) {
    return {
      estado: "incompleta",
      detalle: `Falta PDF — solo tiene ${nombresEditables}`,
      tienePdf,
      tieneEditable,
      pdfCount: 0,
      extensionesEditables,
    };
  }

  // hay archivos, pero ninguno es PDF ni Word/Excel (ej. imagenes, dwg, rvt, etc.)
  return {
    estado: "incompleta",
    detalle: `Falta PDF y Word/Excel — solo tiene ${otrosLabel}`,
    tienePdf,
    tieneEditable,
    pdfCount: 0,
    extensionesEditables,
  };
}

export async function runSync() {
  const rootId = process.env.DRIVE_ROOT_FOLDER_ID;
  const items = await scanDriveTree(rootId);
  const nodes = buildTree(items, rootId);

  // --- Cargar snapshot anterior ---
  const snapRef = adminDb.collection("_meta").doc("snapshot");
  const snapDoc = await snapRef.get();
  const prev = snapDoc.exists ? snapDoc.data().nodes || {} : {};

  const eventos = [];
  const now = FieldValue.serverTimestamp();

  // --- Detectar carpetas nuevas / movidas ---
  for (const id in nodes) {
    const node = nodes[id];
    if (!node.isFolder) continue;
    const before = prev[id];
    if (!before) {
      eventos.push({
        tipo: "carpeta_creada",
        item: node.name,
        ruta: buildPath(id, nodes, rootId),
        usuario: node.lastModifyingUser,
        timestamp: now,
      });
    } else if (before.parentId !== node.parentId) {
      eventos.push({
        tipo: "carpeta_movida",
        item: node.name,
        ruta: buildPath(id, nodes, rootId),
        usuario: node.lastModifyingUser,
        timestamp: now,
      });
    }
  }

  // --- Detectar carpetas borradas ---
  for (const id in prev) {
    if (prev[id].isFolder && !nodes[id]) {
      const actor = await getUltimoActorDeItem(id);
      let usuario = "Desconocido (ver Drive Activity)";
      if (actor) {
        usuario = actor;
      } else if (prev[id].lastModifyingUser && prev[id].lastModifyingUser !== "Desconocido") {
        usuario = `${prev[id].lastModifyingUser} (última persona que la modificó)`;
      }
      eventos.push({
        tipo: "carpeta_borrada",
        item: prev[id].name,
        ruta: prev[id].path || prev[id].name,
        usuario,
        timestamp: now,
      });
    }
  }

  // --- Detectar archivos nuevos / reemplazados ---
  for (const id in nodes) {
    const node = nodes[id];
    if (node.isFolder) continue;
    const before = prev[id];
    if (!before) {
      eventos.push({
        tipo: "archivo_subido",
        item: node.name,
        ruta: buildPath(node.parentId, nodes, rootId),
        usuario: node.lastModifyingUser,
        thumbnailLink: node.thumbnailLink || null,
        timestamp: now,
      });
    } else if (before.md5Checksum && before.md5Checksum !== node.md5Checksum) {
      eventos.push({
        tipo: "archivo_reemplazado",
        item: node.name,
        ruta: buildPath(node.parentId, nodes, rootId),
        usuario: node.lastModifyingUser,
        thumbnailLink: node.thumbnailLink || null,
        timestamp: now,
      });
    }
  }

  // --- Detectar archivos borrados ---
  for (const id in prev) {
    if (!prev[id].isFolder && !nodes[id]) {
      const actor = await getUltimoActorDeItem(id);
      let usuario = "Desconocido (ver Drive Activity)";
      if (actor) {
        usuario = actor;
      } else if (prev[id].lastModifyingUser && prev[id].lastModifyingUser !== "Desconocido") {
        usuario = `${prev[id].lastModifyingUser} (última persona que lo subió)`;
      }
      eventos.push({
        tipo: "archivo_borrado",
        item: prev[id].name,
        ruta: prev[id].path || prev[id].name,
        usuario,
        timestamp: now,
      });
    }
  }

  // --- Escribir eventos en el log de auditoria ---
  const batch = adminDb.batch();
  for (const evento of eventos) {
    const ref = adminDb.collection("eventos").doc();
    batch.set(ref, evento);
  }

  // --- Escribir estado de cada carpeta final (hoja) ---
  let completas = 0,
    incompletas = 0,
    vacias = 0,
    totalFinales = 0;

  for (const id in nodes) {
    const node = nodes[id];
    if (!node.isFolder) continue;
    const esFinal = node.childFolderIds.length === 0;
    if (!esFinal) continue;

    totalFinales++;
    const ruta = buildPath(id, nodes, rootId);
    const { estado, detalle, tienePdf, tieneEditable, pdfCount, extensionesEditables } =
      computeEstado(node);
    const area = extractArea(ruta);

    if (estado === "completa") completas++;
    if (estado === "incompleta") incompletas++;
    if (estado === "vacia") vacias++;

    const ref = adminDb.collection("carpetas").doc(id);
    batch.set(ref, {
      nombre: node.name,
      ruta,
      area,
      estado,
      detalle,
      tienePdf,
      tieneEditable,
      pdfCount,
      extensionesEditables,
      archivos: node.files.map((f) => ({
        nombre: f.name,
        tipo: classifyFile(f.name),
        modificadoPor: f.lastModifyingUser,
        modificadoEn: f.modifiedTime,
        link: f.webViewLink,
      })),
      actualizadoEn: now,
    });
  }

  batch.set(adminDb.collection("_meta").doc("resumen"), {
    totalFinales,
    completas,
    incompletas,
    vacias,
    faltantes: incompletas + vacias,
    ultimaSync: now,
  });

  // --- Guardar punto de historial para el grafico de tendencia ---
  // Un documento por dia (id = fecha YYYY-MM-DD), se sobreescribe si hay
  // varios syncs el mismo dia, para no acumular puntos de mas.
  const fechaHoy = new Date().toISOString().slice(0, 10);
  const pctHoy = totalFinales > 0 ? Math.round((completas / totalFinales) * 100) : 0;
  batch.set(adminDb.collection("historial").doc(fechaHoy), {
    fecha: fechaHoy,
    totalFinales,
    completas,
    incompletas,
    vacias,
    pct: pctHoy,
    timestamp: now,
  });

  // --- Guardar snapshot para la proxima comparacion ---
  const snapshotToSave = {};
  for (const id in nodes) {
    snapshotToSave[id] = {
      name: nodes[id].name,
      isFolder: nodes[id].isFolder,
      parentId: nodes[id].parentId,
      md5Checksum: nodes[id].md5Checksum,
      lastModifyingUser: nodes[id].lastModifyingUser,
      path: buildPath(nodes[id].isFolder ? id : nodes[id].parentId, nodes, rootId),
    };
  }
  batch.set(snapRef, { nodes: snapshotToSave, updatedAt: now });

  await batch.commit();

  return { eventos: eventos.length, totalFinales, completas, incompletas, vacias };
}
