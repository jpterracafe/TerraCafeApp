import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSupabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";

function requireSession(session: any) {
  if (!session?.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return null;
}

// ── GET /api/historico-fases?faseId=xxx ────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const { searchParams } = new URL(req.url);
    const faseId = searchParams.get("faseId");

    const db = getSupabase();
    let query = db
      .from("historico_fases")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (faseId) {
      query = query.eq("fase_id", faseId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      historico: (data ?? []).map((h) => ({
        id: h.id,
        faseId: h.fase_id,
        campo: h.campo,
        valorAnterior: h.valor_anterior ?? "",
        valorNovo: h.valor_novo ?? "",
        usuario: h.usuario ?? "Sistema",
        criadoEm: h.created_at,
      })),
    });
  } catch (e) {
    console.error("[GET /api/historico-fases]", e);
    return NextResponse.json({ error: "Erro ao buscar histórico." }, { status: 500 });
  }
}

// ── POST /api/historico-fases ─────────────────────────────────────────────────
// Chamado internamente pelo PUT /api/fases
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const body = await req.json().catch(() => null);
    if (!body?.faseId || !body?.campo) {
      return NextResponse.json({ error: "faseId e campo são obrigatórios." }, { status: 400 });
    }

    const db = getSupabase();
    const { error } = await db.from("historico_fases").insert({
      fase_id: body.faseId,
      campo: body.campo,
      valor_anterior: body.valorAnterior ?? "",
      valor_novo: body.valorNovo ?? "",
      usuario: body.usuario ?? "Sistema",
    });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/historico-fases]", e);
    return NextResponse.json({ error: "Erro ao salvar histórico." }, { status: 500 });
  }
}
