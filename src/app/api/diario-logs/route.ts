import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSupabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";
import { requireSession } from "@/lib/api";
import {
  diarioLogCreateSchema,
  diarioLogDeleteSchema,
  formatZodErrors,
  normalizeStatusDiario,
} from "@/lib/validators";
import { getUserProjectAccess, filterLogsByAccess, type LogRow } from "@/lib/project-access";

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

    // Obtém informações de acesso do usuário aos projetos
    const access = await getUserProjectAccess();

    // Busca fases para verificar responsabilidades
    let fasesPorProjeto = new Map<string, any[]>();
    try {
      const db = getSupabase();
      const { data: fasesData } = await db
        .from("fases_acao")
        .select("projeto_cliente, responsavel")
        .eq("is_deleted", false);
      
      if (fasesData) {
        for (const f of fasesData) {
          const pNome = f.projeto_cliente;
          if (!fasesPorProjeto.has(pNome)) fasesPorProjeto.set(pNome, []);
          fasesPorProjeto.get(pNome)!.push(f);
        }
      }
    } catch (_) {}

    const db = getSupabase();
    // Colunas explícitas (menos bytes por resposta que select("*")).
    const LOG_COLS = "id, data, responsavel, atividade, status, observacoes, projeto_cliente, midia_url, midia_tipo, is_deleted, created_at";
    // Exclui logs de projetos na lixeira (coluna criada na migration
    // 20260922; fallback sem filtro em bancos ainda não migrados)
    let data: LogRow[] | null = null;
    const attempt = await db
      .from("diario_logs")
      .select(LOG_COLS)
      .eq("is_deleted", false)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (attempt.error && (attempt.error.code === "PGRST204" || attempt.error.message?.includes("is_deleted"))) {
      const fb = await db
        .from("diario_logs")
        .select("id, data, responsavel, atividade, status, observacoes, projeto_cliente, midia_url, midia_tipo, created_at")
        .order("data", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (fb.error) throw fb.error;
      data = fb.data ?? [];
    } else {
      if (attempt.error) throw attempt.error;
      data = attempt.data ?? [];
    }

    // 🔒 FILTRAGEM POR ACESSO DO USUÁRIO — mantém apenas logs dos projetos permitidos
    const logsFiltrados = filterLogsByAccess(data ?? [], access, fasesPorProjeto);

    return NextResponse.json({ logs: logsFiltrados.map(mapLog) });
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
    const { data, responsavel, atividade, observacoes, projetoCliente, midiaUrl, midiaTipo } = dataIn;
    const status = normalizeStatusDiario(dataIn.status);

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
    const RETURN_COLS = "id, data, responsavel, atividade, status, observacoes, projeto_cliente, midia_url, midia_tipo";

    const attempt1 = await db.from("diario_logs").insert(insertComTudo).select(RETURN_COLS).single();

    if (attempt1.error && (attempt1.error.code === "PGRST204" || attempt1.error.message?.includes("projeto_cliente"))) {
      // projeto_cliente não existe — tenta sem ela mas mantém mídia
      console.warn("[POST /api/diario-logs] Coluna projeto_cliente não existe, tentando sem ela.");
      const attempt2 = await db.from("diario_logs").insert(insertSemProjeto).select("id, data, responsavel, atividade, status, observacoes, midia_url, midia_tipo").single();
      if (attempt2.error && (attempt2.error.code === "PGRST204" || attempt2.error.message?.includes("midia"))) {
        // colunas de mídia também não existem — insere só o mínimo
        console.warn("[POST /api/diario-logs] Colunas de mídia não existem, inserindo sem mídia.");
        const attempt3 = await db.from("diario_logs").insert(insertMinimo).select("id, data, responsavel, atividade, status, observacoes").single();
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

// ── DELETE /api/diario-logs?id=xxx&hard=true ───────────────────────────────
// Compatível com fases: por padrão SOFT DELETE (is_deleted=true), que some do
// GET mas permite restauração via lixeira. Use ?hard=true para exclusão física.
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
    const hard = searchParams.get("hard") === "true";

    const db = getSupabase();
    if (!hard) {
      const attempt = await db.from("diario_logs").update({ is_deleted: true }).eq("id", id);
      if (attempt.error && (attempt.error.code === "PGRST204" || attempt.error.message?.includes("is_deleted"))) {
        // Banco ainda sem a coluna: fallback para hard delete (comportamento anterior).
        const fb = await db.from("diario_logs").delete().eq("id", id);
        if (fb.error) throw fb.error;
      } else if (attempt.error) {
        throw attempt.error;
      }
      return NextResponse.json({ ok: true, soft: true });
    }

    const { error } = await db.from("diario_logs").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/diario-logs]", e);
    return NextResponse.json({ error: "Erro ao deletar log." }, { status: 500 });
  }
}
