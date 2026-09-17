import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSupabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";
import { canSeeAllProjects, isFarmerRole, canCreateProjects, canDeleteProjects, canRestoreProjects } from "@/lib/roles";

// ── GET /api/projetos?responsavel=Nome&lixeira=true ───────────────────────────
// Retorna nomes únicos de projetos ATIVOS por padrão.
// Se ?lixeira=true → retorna projetos EXCLUÍDOS (na lixeira).
// Se ?responsavel= for informado, filtra só os projetos onde essa pessoa
// é responsável por pelo menos uma fase.
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const user = session.user;
    const { searchParams } = new URL(req.url);
    const responsavel = searchParams.get("responsavel")?.trim() ?? "";
    const lixeira = searchParams.get("lixeira") === "true";
    const detalhado = searchParams.get("detalhado") === "true";

    const db = getSupabase();
    const userRole = user?.role || "Colaborador";
    const userName = user?.name || "";
    const userEmail = user?.email || "";

    // Busca projetos do usuário se for agricultor
    let userProjects: string[] = [];
    if (isFarmerRole(userRole)) {
      const { data: userProjs } = await db
        .from("user_projetos")
        .select("projeto_id, projetos_irrigacao(nome)")
        .eq("user_id", user.id);
      
      userProjects = (userProjs ?? [])
        .map((up: any) => up.projetos_irrigacao?.nome)
        .filter(Boolean);
    }

    let query = db
      .from("fases_acao")
      .select(detalhado ? "projeto_cliente, prazo_limite, is_deleted, updated_at" : "projeto_cliente")
      .eq("is_deleted", lixeira)
      .not("projeto_cliente", "is", null)
      .neq("projeto_cliente", "");

    if (responsavel) {
      query = query.eq("responsavel", responsavel);
    }

    // Se não é admin/diretor, filtra pelos projetos do usuário
    if (!canSeeAllProjects(userRole) && userProjects.length > 0) {
      query = query.in("projeto_cliente", userProjects);
    } else if (!canSeeAllProjects(userRole) && userProjects.length === 0) {
      // Agricultor sem projetos associados - retorna vazio
      return NextResponse.json({ projetos: detalhado ? [] : [] });
    }

    const { data, error } = await query;
    if (error) throw error;

    if (detalhado) {
      const mapa = new Map<string, { nome: string; prazoFinal: string; excluidoEm: string | null }>();
      for (const r of (data ?? []) as any[]) {
        const n = r.projeto_cliente as string;
        if (!mapa.has(n)) {
          mapa.set(n, {
            nome: n,
            prazoFinal: r.prazo_limite || '',
            excluidoEm: r.is_deleted ? r.updated_at : null,
          });
        } else if (r.is_deleted && r.updated_at) {
          const atual = mapa.get(n)!;
          if (!atual.excluidoEm || r.updated_at > atual.excluidoEm) {
            atual.excluidoEm = r.updated_at;
          }
        }
      }
      const lista = Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome));
      return NextResponse.json({ projetos: lista });
    }

    const unicos = Array.from(
      new Set((data ?? []).map((r: any) => r.projeto_cliente as string).filter(Boolean))
    ).sort();

    return NextResponse.json({ projetos: unicos });
  } catch (e) {
    console.error("[GET /api/projetos]", e);
    return NextResponse.json({ error: "Erro ao buscar projetos." }, { status: 500 });
  }
}

// ── POST /api/projetos ─────────────────────────────────────────────────────────
// Cria um novo projeto com as 6 fases oficiais de campo e o prazo final fixo.
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const user = session.user;
    // 🔒 Admin, Diretor e Agricultor podem criar projetos
    const userRole = user?.role || "Colaborador";
    if (!canCreateProjects(userRole)) {
      return NextResponse.json({ error: "Não autorizado. Apenas administradores, diretores e agricultores podem criar projetos." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const nome = String(body?.nome ?? "").trim();
    const prazoFinal = String(body?.prazoFinal ?? "").trim();
    const dataInicio = String(body?.dataInicio ?? new Date().toISOString().split("T")[0]).trim();

    if (!nome) {
      return NextResponse.json({ error: "O nome do projeto é obrigatório." }, { status: 400 });
    }
    if (!prazoFinal) {
      return NextResponse.json({ error: "O prazo final é obrigatório." }, { status: 400 });
    }

    const db = getSupabase();

    // 6 Fases oficiais de campo
    const fasesIniciais = [
      { gabarito: "Valetas",                    acao: "Abertura e nivelamento de valas" },
      { gabarito: "montagem campo",             acao: "Montagem de tubulações e gotejadores" },
      { gabarito: "casa de bombas",             acao: "Instalação de bombas, filtros e cabeçal" },
      { gabarito: "elétrica",                   acao: "Quadros elétricos, automação e cabeamento" },
      { gabarito: "lavagem do sistema e testes", acao: "Limpeza, pressão e estanqueidade" },
      { gabarito: "entrega técnica",            acao: "Checklist final, treinamento e entrega ao cliente" },
    ];

    const inserts = fasesIniciais.map((f) => ({
      gabarito: f.gabarito,
      acao: f.acao,
      responsavel: session.user?.name || "Equipe Técnica",
      prazo_limite: prazoFinal,
      status: "Dentro do programado",
      observacoes: `Início do projeto: ${dataInicio}`,
      projeto_cliente: nome,
      is_deleted: false,
    }));

    const { error: insertError } = await db.from("fases_acao").insert(inserts);
    if (insertError) {
      console.warn("[POST /api/projetos] Aviso ao inserir no Supabase fases_acao:", insertError.message);
    }

    // Salva dataInicio e prazoFinal nas configurações do sistema (Supabase)
    try {
      if (prazoFinal) {
        const { data: currentPrazos } = await db
          .from("configuracoes_sistema")
          .select("valor")
          .eq("chave", "diario_projetos_prazo_final_v1")
          .maybeSingle();

        const mapPrazos = currentPrazos?.valor || {};
        mapPrazos[nome] = prazoFinal;

        await db.from("configuracoes_sistema").upsert({
          chave: "diario_projetos_prazo_final_v1",
          valor: mapPrazos,
          updated_at: new Date().toISOString(),
        });
      }

      if (dataInicio) {
        const { data: currentStarts } = await db
          .from("configuracoes_sistema")
          .select("valor")
          .eq("chave", "diario_projeto_starts_v1")
          .maybeSingle();

        const mapStarts = currentStarts?.valor || {};
        mapStarts[nome] = dataInicio;

        await db.from("configuracoes_sistema").upsert({
          chave: "diario_projeto_starts_v1",
          valor: mapStarts,
          updated_at: new Date().toISOString(),
        });
      }
    } catch (cfgErr) {
      console.warn("[POST /api/projetos] Erro ao sincronizar datas no configuracoes_sistema:", cfgErr);
    }

    return NextResponse.json({
      ok: true,
      projeto: nome,
      prazoFinal,
      dataInicio,
    });
  } catch (e) {
    console.error("[POST /api/projetos]", e);
    return NextResponse.json({ error: "Erro ao criar projeto." }, { status: 500 });
  }
}

// ── DELETE /api/projetos?nome=X&hard=true ─────────────────────────────────────
// Por padrão é SOFT DELETE (envia para lixeira, marca is_deleted=true em todas
// as fases do projeto, e também marca os diario_logs do projeto como is_deleted).
// Hard delete SÓ se ?hard=true for explicitamente informado.
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    // 🔒 Só admin e diretor podem excluir projetos
    const user = session.user;
    const userRole = user?.role || "Colaborador";
    if (!canDeleteProjects(userRole)) {
      return NextResponse.json({ error: "Não autorizado. Apenas administradores e diretores podem excluir projetos." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const nome = searchParams.get("nome")?.trim() ?? "";
    const hard = searchParams.get("hard") === "true";

    if (!nome) {
      return NextResponse.json({ error: "Nome do projeto obrigatório (?nome=X)." }, { status: 400 });
    }

    const db = getSupabase();

    if (hard) {
      // Hard delete permanente — apaga todas as fases e logs do projeto
      await db.from("fases_acao").delete().eq("projeto_cliente", nome);
      await db.from("diario_logs").delete().eq("projeto_cliente", nome);
      // Remove das configurações salvas também
      try {
        const { data: prazosRow } = await db
          .from("configuracoes_sistema")
          .select("valor")
          .eq("chave", "diario_projetos_prazo_final_v1")
          .maybeSingle();
        const prazos = { ...(prazosRow?.valor || {}) };
        delete prazos[nome];
        await db.from("configuracoes_sistema").upsert({
          chave: "diario_projetos_prazo_final_v1", valor: prazos, updated_at: new Date().toISOString(),
        });

        const { data: startsRow } = await db
          .from("configuracoes_sistema")
          .select("valor")
          .eq("chave", "diario_projeto_starts_v1")
          .maybeSingle();
        const starts = { ...(startsRow?.valor || {}) };
        delete starts[nome];
        await db.from("configuracoes_sistema").upsert({
          chave: "diario_projeto_starts_v1", valor: starts, updated_at: new Date().toISOString(),
        });
      } catch (_) { /* ignora falha de limpeza em configuracoes_sistema */ }

      return NextResponse.json({ ok: true, hardDeleted: true });
    }

    // Soft delete — marca fases e logs como is_deleted=true
    const agora = new Date().toISOString();
    await db
      .from("fases_acao")
      .update({ is_deleted: true, updated_at: agora })
      .eq("projeto_cliente", nome);

    try {
      await db
        .from("diario_logs")
        .update({ is_deleted: true, updated_at: agora })
        .eq("projeto_cliente", nome);
    } catch (_) { /* ignora se tabela diario_logs não tiver coluna is_deleted */ }

    return NextResponse.json({ ok: true, softDeleted: true, projeto: nome });
  } catch (e) {
    console.error("[DELETE /api/projetos]", e);
    return NextResponse.json({ error: "Erro ao excluir projeto." }, { status: 500 });
  }
}

// ── PATCH /api/projetos?nome=X ────────────────────────────────────────────────
// Restaura um projeto da lixeira (marca is_deleted=false nas fases e logs).
export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    // 🔒 Só admin e diretor podem restaurar projetos
    const user = session.user;
    const userRole = user?.role || "Colaborador";
    if (!canRestoreProjects(userRole)) {
      return NextResponse.json({ error: "Não autorizado. Apenas administradores e diretores podem restaurar projetos." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const nome = searchParams.get("nome")?.trim() ?? "";

    if (!nome) {
      return NextResponse.json({ error: "Nome do projeto obrigatório (?nome=X)." }, { status: 400 });
    }

    const db = getSupabase();
    const agora = new Date().toISOString();

    await db
      .from("fases_acao")
      .update({ is_deleted: false, updated_at: agora })
      .eq("projeto_cliente", nome);

    try {
      await db
        .from("diario_logs")
        .update({ is_deleted: false, updated_at: agora })
        .eq("projeto_cliente", nome);
    } catch (_) { /* ignora */ }

    return NextResponse.json({ ok: true, restaurado: true, projeto: nome });
  } catch (e) {
    console.error("[PATCH /api/projetos]", e);
    return NextResponse.json({ error: "Erro ao restaurar projeto." }, { status: 500 });
  }
}
