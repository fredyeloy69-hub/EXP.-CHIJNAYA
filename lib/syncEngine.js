import { adminDb } from "./firebaseAdmin";
import { scanDriveTree } from "./googleDrive";
import { FieldValue } from "firebase-admin/firestore";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const EDITABLE_EXT = [".xlsx", ".xls", ".docx", ".doc"];

function classifyFile(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (EDITABLE_EXT.some((ext) => lower.endsWith(ext))) return "editable";
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

// Devuelve { estado, detalle, tienePdf, tieneEditable }
// estado: completa | incompleta | vacia   (se mantiene igual, para no romper nada que ya lo use)
// detalle: texto especifico de que tiene / que falta, para mostrar en el dashboard
function computeEstado(folderNode) {
  if (folderNode.files.length === 0) {
    return {
      estado: "vacia",
      detalle: "Carpeta vacía — sin archivos",
      tienePdf: false,
      tieneEditable: false,
    };
  }

  const tienePdf = folderNode.files.some((f) => classifyFile(f.name) === "pdf");
  const tieneEditable = folderNode.files.some(
    (f) => classifyFile(f.name) === "editable"
  );
  const soloOtros = !tienePdf && !tieneEditable;

  if (tienePdf && tieneEditable) {
    return {
      estado: "completa",
      detalle: "Completa — tiene PDF y Word/Excel",
      tienePdf,
      tieneEditable,
    };
  }

  if (tienePdf && !tieneEditable) {
    return {
      estado: "incompleta",
      detalle: "Falta Word/Excel — solo tiene PDF",
      tienePdf,
      tieneEditable,
    };
  }

  if (!tienePdf && tieneEditable) {
    return {
      estado: "incompleta",
      detalle: "Falta PDF — solo tiene Word/Excel",
      tienePdf,
      tieneEditable,
    };
  }

  // soloOtros: hay archivos, pero ninguno es PDF ni Word/Excel (ej. imagenes, dwg, etc.)
  return {
    estado: "incompleta",
    detalle: "Falta PDF y Word/Excel — solo tiene otros archivos",
    tienePdf,
    tieneEditable,
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
      eventos.push({
        tipo: "carpeta_borrada",
        item: prev[id].name,
        ruta: prev[id].path || prev[id].name,
        usuario: "Desconocido (ver Drive Activity)",
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
        timestamp: now,
      });
    } else if (before.md5Checksum && before.md5Checksum !== node.md5Checksum) {
      eventos.push({
        tipo: "archivo_reemplazado",
        item: node.name,
        ruta: buildPath(node.parentId, nodes, rootId),
        usuario: node.lastModifyingUser,
        timestamp: now,
      });
    }
  }

  // --- Detectar archivos borrados ---
  for (const id in prev) {
    if (!prev[id].isFolder && !nodes[id]) {
      eventos.push({
        tipo: "archivo_borrado",
        item: prev[id].name,
        ruta: prev[id].path || prev[id].name,
        usuario: "Desconocido (ver Drive Activity)",
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
    const { estado, detalle, tienePdf, tieneEditable } = computeEstado(node);
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

  // --- Guardar snapshot para la proxima comparacion ---
  const snapshotToSave = {};
  for (const id in nodes) {
    snapshotToSave[id] = {
      name: nodes[id].name,
      isFolder: nodes[id].isFolder,
      parentId: nodes[id].parentId,
      md5Checksum: nodes[id].md5Checksum,
      path: buildPath(nodes[id].isFolder ? id : nodes[id].parentId, nodes, rootId),
    };
  }
  batch.set(snapRef, { nodes: snapshotToSave, updatedAt: now });

  await batch.commit();

  return { eventos: eventos.length, totalFinales, completas, incompletas, vacias };
}
