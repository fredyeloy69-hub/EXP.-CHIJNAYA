
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

// Marca (o desmarca) una carpeta como "completa" manualmente — para casos
// excepcionales donde no aplica tener un editable (ej. documentos escaneados
// donde solo existe el PDF del trámite, sin Word/Excel/DWG/RVT de origen).
//
// Guarda la excepción en la colección "carpetasForzadas" (para que sobreviva
// a los syncs automáticos) y también actualiza el documento en "carpetas" al
// toque, para que se vea el cambio en el dashboard sin esperar el próximo sync.
export async function POST(request) {
  try {
    const { folderId, forzada, motivo } = await request.json();

    if (!folderId) {
      return NextResponse.json({ error: "Falta folderId" }, { status: 400 });
    }

    const overrideRef = adminDb.collection("carpetasForzadas").doc(folderId);

    if (forzada) {
      await overrideRef.set({
        forzada: true,
        motivo: motivo || "",
        marcadoEn: new Date().toISOString(),
      });
      await adminDb
        .collection("carpetas")
        .doc(folderId)
        .set(
          {
            estado: "completa",
            detalle: `Marcada manualmente como completa${motivo ? ` — ${motivo}` : ""}`,
            forzada: true,
          },
          { merge: true }
        );
    } else {
      await overrideRef.delete();
      await adminDb.collection("carpetas").doc(folderId).set({ forzada: false }, { merge: true });
      // Nota: el estado real (completa/incompleta/vacía) según los archivos
      // se vuelve a calcular recién en el próximo sync, no acá al toque.
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Error desconocido" }, { status: 500 });
  }
}
