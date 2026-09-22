import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSupabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";
import { requireSession } from "@/lib/api";
import {
  faseCreateSchema,
  faseUpdateSchema,
  faseDeleteSchema,
  formatZodErrors,
  normalizeStatusFase,
} from "@/lib/validators";
import { parseResponsavelEmails, normalizeName } from "@/lib/responsaveis";

// ── GET /api/fases ─────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const sessionEmail = session?.user?.email?.trim().toLowerCase() ?? "";
    const sessionName = session?.user?.name?.trim() ?? "";
    const sessionRole = (session?.user as any)?.role || "Colaborador";

    const db = getSupabase();

    // Carrega mapa de criadores
    let mapCriadores: Record<string, { email: string }> = {};
    try {
      const { data: criadoresRow } = await db
        .from("configuracoes_sistema")
        .select("valor")
        .eq("chave", "diario_projetos_criadores_v1")
        .maybeSingle();
      if (criadoresRow?.valor) mapCriadores = criadoresRow.valor;
    } catch (_) {}

    const { data, error } = await db
      .from("fases_acao")
      .select("id, gabarito, responsavel, acao, prazo_limite, status, observacoes, projeto_cliente, is_deleted")
      .order("created_at", { ascending: true });

    if (error) throw error;

    const isDiretorOuAdmin = ["Diretor", "Desenvolvedor", "Admin"].includes(sessionRole);

    const sessionEmailLc = sessionEmail.toLowerCase();

    const fases = (data ?? [])
      .filter((f) => {
        const pNome = (f.projeto_cliente || "").trim();
        if (!pNome) return false;

        // 👑 Diretor, Admin e Desenvolvedor vêem todas as fases
        if (isDiretorOuAdmin) return true;

        const criador = mapCriadores[pNome];
        const criadorEmail = criador?.email?.trim().toLowerCase();

        // Se o projeto tem criador cadastrado e NÃO é o agricultor logado:
        if (criadorEmail && criadorEmail !== sessionEmailLc) {
          // Verifica se o usuário é responsável pela fase (por email ou por nome, item a item)
          const resp = (f.responsavel || "").trim();
          const responsaveis = parseResponsavelEmails(resp);
          const ehResponsavelEmail = responsaveis.includes(sessionEmailLc);
          const nomeLc = normalizeName(sessionName);
          const ehResponsavelNome =
            nomeLc &&
            responsaveis.some(r => normalizeName(r) === nomeLc);

          // Se não for responsável por email nem por nome, esconde a fase
          if (!ehResponsavelEmail && !ehResponsavelNome) {
            return false; // Oculta fase deste projeto para outro agricultor
          }
        }
        return true;
      })
      .map((f) => ({
        id: f.id,
        gabarito: f.gabarito,
        responsavel: f.responsavel,
        acao: f.acao,
        prazoLimite: f.prazo_limite,
        status: f.status,
        observacoes: f.observacoes ?? "",
        projetoCliente: f.projeto_cliente ?? "",
        isDeleted: f.is_deleted ?? false,
      }));

    return NextResponse.json({ fases });
  } catch (e) {
    console.error("[GET /api/fases]", e);
    return NextResponse.json({ error: "Erro ao buscar fases." }, { status: 500 });
  }
}

// ── POST /api/fases ────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const body = await req.json().catch(() => null);
    const parsed = faseCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodErrors(parsed.error) }, { status: 400 });
    }
    const dataIn = parsed.data;

    const db = getSupabase();

    // O responsável é definido somente pelo que o usuário escolheu (opcional)
    const responsavelParaInserir = dataIn.responsavel || "Não atribuído";

    // Atribuição de autoria (compatível): preenche criado_por_* da sessão para
    // fases avulsas não ficarem sem dono. Fallback sem as colunas em bancos
    // ainda não migrados.
    const criadoPorEmail = (session as any)?.user?.email?.trim().toLowerCase() ?? null;
    const criadoPorNome = (session as any)?.user?.name?.trim() || null;

    const insertComProjeto = {
      gabarito: dataIn.gabarito,
      responsavel: responsavelParaInserir,
      acao: dataIn.acao,
      prazo_limite: dataIn.prazoLimite,
      status: normalizeStatusFase(dataIn.status),
      observacoes: dataIn.observacoes,
      projeto_cliente: dataIn.projetoCliente,
      is_deleted: false,
      criado_por_email: criadoPorEmail,
      criado_por_nome: criadoPorNome,
    };

    const insertSemProjeto = {
      gabarito: dataIn.gabarito,
      responsavel: responsavelParaInserir,
      acao: dataIn.acao,
      prazo_limite: dataIn.prazoLimite,
      status: normalizeStatusFase(dataIn.status),
      observacoes: dataIn.observacoes,
      is_deleted: false,
      criado_por_email: criadoPorEmail,
      criado_por_nome: criadoPorNome,
    };

    let data: any = null;

    const attempt1 = await db
      .from("fases_acao")
      .insert(insertComProjeto)
      .select("*")
      .single();

    if (attempt1.error && (attempt1.error.code === "PGRST204" || attempt1.error.message?.includes("projeto_cliente") || attempt1.error.message?.includes("criado_por"))) {
      // Banco sem alguma coluna nova: remove do payload só as colunas
      // reclamadas e retenta (modo compatível com bancos não migrados).
      console.warn("[POST /api/fases] Coluna ausente no banco, inserindo em modo compatível.");
      const msg: string = attempt1.error.message ?? "";
      const retry: Record<string, unknown> = { ...insertComProjeto };
      if (msg.includes("projeto_cliente")) delete retry.projeto_cliente;
      if (msg.includes("criado_por")) {
        delete retry.criado_por_email;
        delete retry.criado_por_nome;
      }
      const attempt2 = await db
        .from("fases_acao")
        .insert(retry)
        .select("*")
        .single();
      if (attempt2.error) throw attempt2.error;
      data = attempt2.data;
    } else {
      if (attempt1.error) throw attempt1.error;
      data = attempt1.data;
    }

    if (!data) throw new Error("Nenhum dado retornado pelo banco.");

    return NextResponse.json({
      fase: {
        id: data.id,
        gabarito: data.gabarito,
        responsavel: data.responsavel,
        acao: data.acao,
        prazoLimite: data.prazo_limite,
        status: data.status,
        observacoes: data.observacoes ?? "",
        projetoCliente: data.projeto_cliente ?? "",
        isDeleted: data.is_deleted ?? false,
      },
    });
  } catch (e) {
    console.error("[POST /api/fases]", e);
    return NextResponse.json({ error: "Erro ao criar fase." }, { status: 500 });
  }
}

// ── PUT /api/fases ─────────────────────────────────────────────────────────────
// Corpo: { id, responsavel?, prazoLimite?, status?, isDeleted? }
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const body = await req.json().catch(() => null);
    const parsed = faseUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodErrors(parsed.error) }, { status: 400 });
    }
    const dataIn = parsed.data;

    const db = getSupabase();

    // ── 🔴 ALTA PRIORIDADE: Lê estado ANTERIOR para histórico real (antes/depois)
    const { data: faseAntiga } = await db
      .from("fases_acao")
      .select("id, gabarito, responsavel, prazo_limite, status, observacoes, projeto_cliente, acao, is_deleted")
      .eq("id", dataIn.id)
      .limit(1)
      .maybeSingle();

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (dataIn.gabarito       !== undefined) updates.gabarito       = dataIn.gabarito;
    if (dataIn.responsavel    !== undefined) {
      // O responsável é definido somente pelo que o usuário escolheu (opcional)
      updates.responsavel = dataIn.responsavel;
    }
    if (dataIn.prazoLimite    !== undefined) updates.prazo_limite   = dataIn.prazoLimite;
    if (dataIn.status         !== undefined) updates.status         = normalizeStatusFase(dataIn.status);
    if (dataIn.isDeleted      !== undefined) updates.is_deleted     = dataIn.isDeleted;
    if (dataIn.observacoes    !== undefined) updates.observacoes    = dataIn.observacoes;
    if (dataIn.acao           !== undefined) updates.acao           = dataIn.acao;
    // projeto_cliente só inclui se o campo vier preenchido com valor
    if (dataIn.projetoCliente !== undefined && dataIn.projetoCliente !== null) {
      updates.projeto_cliente = dataIn.projetoCliente;
    }

    // Tenta update completo; se falhar por coluna inexistente, retenta sem projeto_cliente
    let data: any = null;
    let error: any = null;

    const attempt1 = await db
      .from("fases_acao")
      .update(updates)
      .eq("id", body.id)
      .select("*")
      .single();

    if (attempt1.error && (attempt1.error.code === "PGRST204" || attempt1.error.message?.includes("projeto_cliente"))) {
      // Coluna ainda não existe no banco — retenta sem ela
      const { projeto_cliente: _skip, ...updatesSemProjeto } = updates;
      void _skip;
      const attempt2 = await db
        .from("fases_acao")
        .update(updatesSemProjeto)
        .eq("id", body.id)
        .select("*")
        .single();
      data  = attempt2.data;
      error = attempt2.error;
    } else {
      data  = attempt1.data;
      error = attempt1.error;
    }

    if (error) throw error;

    // ── 🔴 ALTA PRIORIDADE: Gravar histórico com ANTES x DEPOIS real ──────────
    const camposMap: { coluna: string; chaveBody: string; label: string }[] = [
      { coluna: 'gabarito',        chaveBody: 'gabarito',        label: 'Fase'             },
      { coluna: 'responsavel',     chaveBody: 'responsavel',     label: 'Responsável'      },
      { coluna: 'prazo_limite',    chaveBody: 'prazoLimite',     label: 'Prazo Limite'     },
      { coluna: 'status',          chaveBody: 'status',          label: 'Status'           },
      { coluna: 'observacoes',     chaveBody: 'observacoes',     label: 'Observações'      },
      { coluna: 'acao',            chaveBody: 'acao',            label: 'Ação'             },
      { coluna: 'is_deleted',      chaveBody: 'isDeleted',       label: 'Na Lixeira'       },
      { coluna: 'projeto_cliente', chaveBody: 'projetoCliente',  label: 'Projeto / Cliente'},
    ];

    const userEmail = (session as any)?.user?.email;
    const userName  = (session as any)?.user?.name;
    const usuario   = userName && userName !== "Usuário" 
      ? userName 
      : userEmail 
      ? (userEmail.split('@')[0].charAt(0).toUpperCase() + userEmail.split('@')[0].slice(1))
      : "Sistema";
    const insertsHistorico: any[] = [];

    for (const { coluna, chaveBody, label } of camposMap) {
      if ((dataIn as any)[chaveBody] === undefined) continue;

      const antes = (faseAntiga as any)?.[coluna];
      const depois = data?.[coluna];
      const antesNorm  = antes  === undefined || antes  === null ? '' : String(antes);
      const depoisNorm = depois === undefined || depois === null ? '' : String(depois);

      // Só grava se o valor realmente mudou (evita ruído no histórico)
      if (antesNorm === depoisNorm) continue;

      insertsHistorico.push({
        fase_id: dataIn.id,
        campo: label,
        valor_anterior: antesNorm || '—',
        valor_novo: depoisNorm || '—',
        usuario,
      });
    }

    if (insertsHistorico.length > 0) {
      // Await com try/catch: garante persistência da auditoria sem derrubar
      // a resposta em caso de falha transitória (antes era fire-and-forget).
      try {
        const { error: histError } = await db.from("historico_fases").insert(insertsHistorico);
        if (histError) console.warn("[PUT /api/fases] Falha ao gravar histórico:", histError.message);
      } catch (histErr) {
        console.warn("[PUT /api/fases] Falha ao gravar histórico:", histErr);
      }
    }

    return NextResponse.json({
      fase: {
        id: data.id,
        gabarito: data.gabarito,
        responsavel: data.responsavel,
        acao: data.acao,
        prazoLimite: data.prazo_limite,
        status: data.status,
        observacoes: data.observacoes ?? "",
        projetoCliente: data.projeto_cliente ?? "",
        isDeleted: data.is_deleted ?? false,
      },
    });
  } catch (e) {
    console.error("[PUT /api/fases]", e);
    return NextResponse.json({ error: "Erro ao atualizar fase." }, { status: 500 });
  }
}

// ── DELETE /api/fases?id=xxx&hard=true (opcional) ─────────────────────────────
// 🔴 ALTA PRIORIDADE: Por padrão agora é SOFT DELETE (is_deleted=true).
// Hard delete (permanente) SÓ é permitido quando `?hard=true` é explicitado.
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const { searchParams } = new URL(req.url);
    const parsed = faseDeleteSchema.safeParse({
      id: searchParams.get("id"),
      hard: searchParams.get("hard"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodErrors(parsed.error) }, { status: 400 });
    }
    const { id } = parsed.data;
    const hard = parsed.data.hard === "true";

    const db = getSupabase();

    // Busca a fase ANTES para decidir o que fazer
    const { data: faseData } = await db
      .from("fases_acao")
      .select("projeto_cliente")
      .eq("id", id)
      .single();

    const projetoCliente = faseData?.projeto_cliente ?? "";

    if (hard) {
      // Hard delete — apaga linha permanentemente (requer explicitamente ?hard=true)
      const { error } = await db.from("fases_acao").delete().eq("id", id);
      if (error) throw error;
    } else {
      // Soft delete — marca is_deleted=true (comportamento DEFAULT e seguro)
      const { error } = await db
        .from("fases_acao")
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    }

    // Se for HARD DELETE (exclusão permanente da lixeira) e não restar mais nenhuma fase do projeto,
    // limpa os registros correspondentes do diário de campo
    if (hard && projetoCliente && projetoCliente.trim() !== "") {
      const { data: fasesRestantes } = await db
        .from("fases_acao")
        .select("id")
        .eq("projeto_cliente", projetoCliente)
        .limit(1);

      if (!fasesRestantes || fasesRestantes.length === 0) {
        await db
          .from("diario_logs")
          .delete()
          .eq("projeto_cliente", projetoCliente);
      }
    }

    return NextResponse.json({ ok: true, softDeleted: !hard });
  } catch (e) {
    console.error("[DELETE /api/fases]", e);
    return NextResponse.json({ error: "Erro ao deletar fase." }, { status: 500 });
  }
}
