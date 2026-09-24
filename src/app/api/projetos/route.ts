import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSupabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";
import { parseResponsavelEmails, normalizeName } from "@/lib/responsaveis";
import { getUserAssignedLoja, setProjectLoja } from "@/lib/lojas";

// ── GET /api/projetos?responsavel=Nome&lixeira=true&concluidos=true ───────────
// Retorna nomes únicos de projetos ATIVOS por padrão (excluindo os concluídos).
// Se ?lixeira=true → retorna projetos EXCLUÍDOS (na lixeira).
// Se ?concluidos=true → retorna apenas projetos CONCLUÍDOS (não excluídos).
// Se ?responsavel= for informado, filtra só os projetos onde essa pessoa
// é responsável por pelo menos uma fase.
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const responsavel = searchParams.get("responsavel")?.trim() ?? "";
    const lixeira = searchParams.get("lixeira") === "true";
    const detalhado = searchParams.get("detalhado") === "true";
    const todos = searchParams.get("todos") === "true";
    const emailFiltro = searchParams.get("email")?.trim().toLowerCase() ?? "";
    const apenasMeus = searchParams.get("meus") === "true";
    const concluidos = searchParams.get("concluidos") === "true";

    const sessionEmail = session.user?.email?.trim().toLowerCase() ?? "";
    const sessionName = session.user?.name?.trim() ?? "";
    const sessionRole = (session.user as any)?.role || "Colaborador";

    const db = getSupabase();

    // 1. Carrega mapa de criadores de configuracoes_sistema
    let mapCriadores: Record<string, { email: string; nome?: string; id?: string; criadoEm?: string }> = {};
    try {
      const { data: criadoresRow } = await db
        .from("configuracoes_sistema")
        .select("valor")
        .eq("chave", "diario_projetos_criadores_v1")
        .maybeSingle();
      if (criadoresRow?.valor) {
        mapCriadores = { ...criadoresRow.valor };
      }
    } catch (_) {}

    // 1b. Carrega status dos projetos (concluídos) de configuracoes_sistema
    let mapStatus: Record<string, { status?: string; concluidoEm?: string }> = {};
    try {
      const { data: statusRow } = await db
        .from("configuracoes_sistema")
        .select("valor")
        .eq("chave", "diario_projetos_status_v1")
        .maybeSingle();
      if (statusRow?.valor) {
        mapStatus = { ...statusRow.valor };
      }
    } catch (_) {}
    const ehConcluido = (nome: string): boolean => mapStatus[nome]?.status === "concluido";

    // 2. Complementa com user_projetos se a tabela existir
    const userProjetosPermitidos = new Set<string>();
    try {
      const { data: upRows } = await db.from("user_projetos").select("projeto_nome, user_email");
      if (upRows) {
        for (const up of upRows) {
          const pNome = up.projeto_nome;
          const uEmail = up.user_email?.trim().toLowerCase();
          if (pNome && uEmail) {
            if (!mapCriadores[pNome]) {
              mapCriadores[pNome] = { email: uEmail };
            }
            if (uEmail === sessionEmail) {
              userProjetosPermitidos.add(pNome);
            }
          }
        }
      }
    } catch (_) {}

    // 3. Consulta fases_acao
    let query = db
      .from("fases_acao")
      .select("projeto_cliente, prazo_limite, is_deleted, updated_at, responsavel")
      .eq("is_deleted", lixeira)
      .not("projeto_cliente", "is", null)
      .neq("projeto_cliente", "");

    if (responsavel) {
      query = query.eq("responsavel", responsavel);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Agrupa fases por projeto para checar responsáveis
    const fasesPorProjeto = new Map<string, any[]>();
    for (const r of (data ?? []) as any[]) {
      const n = r.projeto_cliente as string;
      if (!fasesPorProjeto.has(n)) fasesPorProjeto.set(n, []);
      fasesPorProjeto.get(n)!.push(r);
    }

    // Regra de autorização / isolamento por perfil:
    const isDiretorOuAdmin = ["Diretor", "Desenvolvedor", "Admin"].includes(sessionRole);
    const emailAlvo = emailFiltro || (apenasMeus ? sessionEmail : "");

    const temAcessoAoProjeto = (nome: string): boolean => {
      // 👑 Diretor, Admin e Desenvolvedor vêem todos os projetos de todos os logins por padrão
      if (isDiretorOuAdmin && !emailAlvo) {
        return true;
      }

      const criador = mapCriadores[nome];
      const criadorEmail = criador?.email?.trim().toLowerCase();
      const emailComparar = emailAlvo || sessionEmail;

      // Se o projeto tem criador cadastrado:
      if (criadorEmail) {
        if (criadorEmail === emailComparar) return true;
        if (userProjetosPermitidos.has(nome)) return true;

        // É responsável direto por alguma fase do projeto.
        // Mesma regra de /api/fases e project-access: igualdade por e-mail
        // ou por nome normalizado (sem acento/caixa) — NUNCA substring
        // ("Ana" não pode herdar acesso de "Mariana").
        const fasesDoProj = fasesPorProjeto.get(nome) || [];
        const sessionEmailLc = sessionEmail.toLowerCase();
        const nomeLc = normalizeName(sessionName);
        const ehResponsavel = fasesDoProj.some(f => {
          const partes = parseResponsavelEmails((f.responsavel || "").trim());
          return partes.some(p => {
            const t = p.trim();
            if (!t) return false;
            if (t.includes("@")) return t.toLowerCase() === sessionEmailLc;
            return !!nomeLc && normalizeName(t) === nomeLc;
          });
        });
        if (ehResponsavel) return true;

        // Pertence a outro usuário -> oculta do agricultor
        return false;
      }

      // Projeto legado (sem criador definido): acessível
      return true;
    };


    if (detalhado) {
      const mapa = new Map<string, { nome: string; prazoFinal: string; excluidoEm: string | null; concluidoEm: string | null; criador: any }>();
      for (const r of (data ?? []) as any[]) {
        const n = r.projeto_cliente as string;
        if (!temAcessoAoProjeto(n)) continue;
        if (concluidos ? !ehConcluido(n) : ehConcluido(n)) continue;

        const criador = mapCriadores[n] || null;
        if (!mapa.has(n)) {
          mapa.set(n, {
            nome: n,
            prazoFinal: r.prazo_limite || "",
            excluidoEm: r.is_deleted ? r.updated_at : null,
            concluidoEm: ehConcluido(n) ? mapStatus[n]?.concluidoEm || null : null,
            criador,
          });
        } else if (r.is_deleted && r.updated_at) {
          const atual = mapa.get(n)!;
          if (!atual.excluidoEm || r.updated_at > atual.excluidoEm) {
            atual.excluidoEm = r.updated_at;
          }
        }
      }
      const lista = Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome));
      return NextResponse.json({ projetos: lista, criadores: mapCriadores });
    }

    let unicos = Array.from(
      new Set((data ?? []).map((r: any) => r.projeto_cliente as string).filter(Boolean))
    ).filter(n => temAcessoAoProjeto(n) && (concluidos ? ehConcluido(n) : !ehConcluido(n)));

    unicos.sort();
    return NextResponse.json({ projetos: unicos, criadores: mapCriadores });
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

    const userEmail = session.user?.email?.toLowerCase().trim() || "";
    const userName = session.user?.name || "Usuário";
    const userId = (session.user as any)?.id || null;

    const inserts = fasesIniciais.map((f) => ({
      gabarito: f.gabarito,
      acao: f.acao,
      responsavel: "Não atribuído",
      prazo_limite: prazoFinal,
      status: "Dentro do programado",
      observacoes: `Início do projeto: ${dataInicio}`,
      projeto_cliente: nome,
      is_deleted: false,
      criado_por_email: userEmail,
      criado_por_nome: userName,
    }));

    const { error: insertError } = await db.from("fases_acao").insert(inserts);
    if (insertError) {
      // Fallback sem colunas extras se ainda não foi rodada a migração no Supabase
      const insertsBasico = fasesIniciais.map((f) => ({
        gabarito: f.gabarito,
        acao: f.acao,
        responsavel: "Não atribuído",
        prazo_limite: prazoFinal,
        status: "Dentro do programado",
        observacoes: `Início do projeto: ${dataInicio}`,
        projeto_cliente: nome,
        is_deleted: false,
      }));
      const retry = await db.from("fases_acao").insert(insertsBasico);
      if (retry.error) throw retry.error;
    }

    // Salva criador, dataInicio e prazoFinal nas configurações do sistema (Supabase)
    try {
      if (userEmail) {
        const { data: currentCriadores } = await db
          .from("configuracoes_sistema")
          .select("valor")
          .eq("chave", "diario_projetos_criadores_v1")
          .maybeSingle();

        const mapCriadores = currentCriadores?.valor || {};
        mapCriadores[nome] = {
          email: userEmail,
          nome: userName,
          id: userId,
          criadoEm: new Date().toISOString(),
        };

        await db.from("configuracoes_sistema").upsert({
          chave: "diario_projetos_criadores_v1",
          valor: mapCriadores,
          updated_at: new Date().toISOString(),
        });

        // Vínculo relacional se a tabela user_projetos existir
        try {
          await db.from("user_projetos").upsert({
            user_email: userEmail,
            user_id: userId,
            projeto_nome: nome,
            role: "owner",
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_email,projeto_nome" });
        } catch (_) {
          // Tabela opcional até ser criada no Supabase
        }
      }

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

      // Atribui loja ao novo projeto: prioriza loja informada no body ou herda a loja vinculada ao criador
      const lojaAtribuida = body?.lojaNome || await getUserAssignedLoja({ id: userId, email: userEmail });
      if (lojaAtribuida) {
        await setProjectLoja(nome, lojaAtribuida);
      }
    } catch (cfgErr) {
      console.warn("[POST /api/projetos] Erro ao sincronizar metadados no configuracoes_sistema:", cfgErr);
    }

    return NextResponse.json({
      ok: true,
      projeto: nome,
      prazoFinal,
      dataInicio,
      criador: {
        email: userEmail,
        nome: userName,
        id: userId,
      },
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

        const { data: criadoresRow } = await db
          .from("configuracoes_sistema")
          .select("valor")
          .eq("chave", "diario_projetos_criadores_v1")
          .maybeSingle();
        const criadores = { ...(criadoresRow?.valor || {}) };
        delete criadores[nome];
        await db.from("configuracoes_sistema").upsert({
          chave: "diario_projetos_criadores_v1", valor: criadores, updated_at: new Date().toISOString(),
        });

        await db.from("user_projetos").delete().eq("projeto_nome", nome);
        await setProjectLoja(nome, "");
      } catch (_) { /* ignora falha de limpeza em configuracoes_sistema */ }

      return NextResponse.json({ ok: true, hardDeleted: true });
    }

    // Soft delete — marca fases e logs como is_deleted=true.
    // diario_logs não tem coluna updated_at no schema: atualiza só is_deleted
    // (antes o update com updated_at falhava silencioso e o log ficava visível).
    const agora = new Date().toISOString();
    await db
      .from("fases_acao")
      .update({ is_deleted: true, updated_at: agora })
      .eq("projeto_cliente", nome);

    try {
      const r = await db
        .from("diario_logs")
        .update({ is_deleted: true })
        .eq("projeto_cliente", nome);
      if (r.error) throw r.error;
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
      const r = await db
        .from("diario_logs")
        .update({ is_deleted: false })
        .eq("projeto_cliente", nome);
      if (r.error) throw r.error;
    } catch (_) { /* ignora */ }

    return NextResponse.json({ ok: true, restaurado: true, projeto: nome });
  } catch (e) {
    console.error("[PATCH /api/projetos]", e);
    return NextResponse.json({ error: "Erro ao restaurar projeto." }, { status: 500 });
  }
}

// ── PUT /api/projetos ─────────────────────────────────────────────────────────
// Marca/desmarca um projeto como CONCLUÍDO (body: { nome, concluido }).
// - concluido: true  → move para a página de Projetos Concluídos.
// - concluido: false → reabre o projeto (volta para a lista ativa).
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const nome = String(body?.nome ?? "").trim();
    const concluido = body?.concluido === true;

    if (!nome) {
      return NextResponse.json({ error: "Nome do projeto obrigatório." }, { status: 400 });
    }

    const db = getSupabase();

    const { data: row } = await db
      .from("configuracoes_sistema")
      .select("valor")
      .eq("chave", "diario_projetos_status_v1")
      .maybeSingle();

    const mapStatus: Record<string, { status?: string; concluidoEm?: string }> = {
      ...(row?.valor || {}),
    };

    if (concluido) {
      mapStatus[nome] = { status: "concluido", concluidoEm: new Date().toISOString() };
    } else {
      delete mapStatus[nome];
    }

    await db.from("configuracoes_sistema").upsert({
      chave: "diario_projetos_status_v1",
      valor: mapStatus,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, projeto: nome, concluido });
  } catch (e) {
    console.error("[PUT /api/projetos]", e);
    return NextResponse.json({ error: "Erro ao atualizar status do projeto." }, { status: 500 });
  }
}
