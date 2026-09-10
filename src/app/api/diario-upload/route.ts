import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSupabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";
import { requireSession } from "@/lib/api";

// ── POST /api/diario-upload ───────────────────────────────────────────────────
// Recebe multipart/form-data com campo "file"
// Devolve { url, tipo }
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }

    // Valida tipo
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      return NextResponse.json({ error: "Apenas imagens e vídeos são permitidos." }, { status: 400 });
    }

    // Valida tamanho — 50MB máximo
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Arquivo muito grande. Máximo 50MB." }, { status: 400 });
    }

    const ext  = file.name.split(".").pop() ?? (isImage ? "jpg" : "mp4");
    const nome = `diario/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const db     = getSupabase();

    const { error: uploadError } = await db.storage
      .from("diario-midia")
      .upload(nome, buffer, { contentType: file.type, upsert: false });

    if (uploadError) throw uploadError;

    const { data: urlData } = db.storage.from("diario-midia").getPublicUrl(nome);

    return NextResponse.json({
      url:  urlData.publicUrl,
      tipo: isImage ? "image" : "video",
    });
  } catch (e) {
    console.error("[POST /api/diario-upload]", e);
    return NextResponse.json({ error: "Erro ao fazer upload." }, { status: 500 });
  }
}
