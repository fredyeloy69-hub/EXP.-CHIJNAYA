import { NextResponse } from "next/server";
import { runSync } from "@/lib/syncEngine";

export const maxDuration = 60; // segundos, ajustable segun plan de Vercel

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resultado = await runSync();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    console.error("Error en sync:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
