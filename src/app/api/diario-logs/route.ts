import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSupabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";
import { requireSession, getQueryParam } from "@/lib/api";
import {
  diarioLogCreateSchema,
  diarioLogDeleteSchema,
  formatZodErrors,
} from "@/lib/validators";

function mapLog(l: any) {
  return {
    id: l.id,
    data: l.data,
    responsavel: l.responsavel,
    atividade: l.atividade,
    status: l.status,
    observacoes: l.observacoes ?? "",
    projetoCliente: l.projeto_cliente ?? "",
    midiaUrl:  l.midia_url  ?? "",
    midiaTipo: l.midia_tipo ?? "",
  };
}

// ── GET /api/diario-logs ───────────────────────────────────────────────────────
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const db = getSupabase();
    const { data, error } = await db
      .from("diario_logs")
      .select("*")
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    return NextResponse.json({ logs: (data ?? []).map(mapLog) });
  } catch (e) {
    console.error("[GET /api/diario-logs]", e);
    return NextResponse.json({ error: "Erro ao buscar logs." }, { status: 500 });
  }
}

// ── POST /api/diario-logs ──────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const body = await req.json().catch(() => null);
    const parsed = diarioLogCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodErrors(parsed.error) }, { status: 400 });
    }
    const dataIn = parsed.data;
    const { data, responsavel, atividade, status, observacoes, projetoCliente, midiaUrl, midiaTipo } = dataIn;

    const db = getSupabase();

    const insertBase = { data, responsavel, atividade, status, observacoes };
    const insertComTudo = {
      ...insertBase,
      projeto_cliente: projetoCliente,
      ...(midiaUrl  ? { midia_url:  midiaUrl  } : {}),
      ...(midiaTipo ? { midia_tipo: midiaTipo } : {}),
    };
    // Fallback sem projeto_cliente mas mantém mídia
    const insertSemProjeto = {
      ...insertBase,
      ...(midiaUrl  ? { midia_url:  midiaUrl  } : {}),
      ...(midiaTipo ? { midia_tipo: midiaTipo } : {}),
    };
    // Fallback absoluto: sem projeto nem mídia (quando colunas não existem ainda)
    const insertMinimo = insertBase;

    let row: any = null;

    const attempt1 = await db.from("diario_logs").insert(insertComTudo).select("*").single();

    if (attempt1.error && (attempt1.error.code === "PGRST204" || attempt1.error.message?.includes("projeto_cliente"))) {
      // projeto_cliente não existe — tenta sem ela mas mantém mídia
      console.warn("[POST /api/diario-logs] Coluna projeto_cliente não existe, tentando sem ela.");
      const attempt2 = await db.from("diario_logs").insert(insertSemProjeto).select("*").single();
      if (attempt2.error && (attempt2.error.code === "PGRST204" || attempt2.error.message?.includes("midia"))) {
        // colunas de mídia também não existem — insere só o mínimo
        console.warn("[POST /api/diario-logs] Colunas de mídia não existem, inserindo sem mídia.");
        const attempt3 = await db.from("diario_logs").insert(insertMinimo).select("*").single();
        if (attempt3.error) throw attempt3.error;
        row = attempt3.data;
      } else {
        if (attempt2.error) throw attempt2.error;
        row = attempt2.data;
      }
    } else {
      if (attempt1.error) throw attempt1.error;
      row = attempt1.data;
    }

    return NextResponse.json({ log: mapLog(row) });
  } catch (e) {
    console.error("[POST /api/diario-logs]", e);
    return NextResponse.json({ error: "Erro ao criar log." }, { status: 500 });
  }
}

// ── DELETE /api/diario-logs?id=xxx ────────────────────────────────────────────
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const { searchParams } = new URL(req.url);
    const parsed = diarioLogDeleteSchema.safeParse({
      id: searchParams.get("id"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodErrors(parsed.error) }, { status: 400 });
    }
    const { id } = parsed.data;

    const db = getSupabase();
    const { error } = await db.from("diario_logs").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/diario-logs]", e);
    return NextResponse.json({ error: "Erro ao deletar log." }, { status: 500 });
  }
}
