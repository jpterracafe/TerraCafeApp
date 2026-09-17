import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSupabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";
import { requireSession, getQueryParam } from "@/lib/api";
import { canSeeAllProjects, isFarmerRole } from "@/lib/roles";
import {
  diarioLogCreateSchema,
  diarioLogDeleteSchema,
  formatZodErrors,
} from "@/lib/validators";

// Helper: verifica se o usuário tem acesso ao projeto
async function hasAccessToProject(userId: string, projetoCliente: string): Promise<boolean> {
  if (!projetoCliente || !userId) return false;
  const db = getSupabase();
  
  // 1. Verifica associação explícita via user_projetos
  const { data: assoc } = await db
    .from("user_projetos")
    .select("id")
    .eq("user_id", userId)
    .eq("projeto_id", projetoCliente)
    .maybeSingle();
  
  if (assoc) return true;
  
  // 2. Fallback: verifica se é o criador do projeto
  const { data: projeto } = await db
    .from("projetos_irrigacao")
    .select("criado_por")
    .eq("nome", projetoCliente)
    .maybeSingle();
  
  return projeto?.criado_por === userId;
}

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
    const user = session!.user;
    const userRole = user?.role || "Colaborador";

    // Busca projetos do usuário se for agricultor
    let userProjects: string[] = [];
    if (isFarmerRole(userRole)) {
      // 1. Busca via user_projetos (membros e creators explícitos)
      const { data: userProjs } = await db
        .from("user_projetos")
        .select("projeto_id, projetos_irrigacao(nome)")
        .eq("user_id", user.id);
      
      userProjects = (userProjs ?? [])
        .map((up: any) => up.projetos_irrigacao?.nome)
        .filter(Boolean);

      // 2. Fallback: busca projetos onde o usuário é o criador (criado_por)
      const { data: createdProjs } = await db
        .from("projetos_irrigacao")
        .select("nome")
        .eq("criado_por", user.id);
      
      const createdNames = (createdProjs ?? [])
        .map((p: any) => p.nome)
        .filter(Boolean);
      
      // Merge sem duplicatas
      userProjects = [...new Set([...userProjects, ...createdNames])];
    }

    let query = db
      .from("diario_logs")
      .select("*")
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    // Se não é admin/diretor, filtra pelos projetos do usuário
    if (!canSeeAllProjects(userRole) && userProjects.length > 0) {
      query = query.in("projeto_cliente", userProjects);
    } else if (!canSeeAllProjects(userRole) && userProjects.length === 0) {
      return NextResponse.json({ logs: [] });
    }

    const { data, error } = await query;

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

    const user = session!.user;
    const body = await req.json().catch(() => null);
    const parsed = diarioLogCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodErrors(parsed.error) }, { status: 400 });
    }
    const dataIn = parsed.data;
    const { data, responsavel, atividade, status, observacoes, projetoCliente, midiaUrl, midiaTipo } = dataIn;

    // 🔒 Se for agricultor, verifica se tem acesso ao projeto
    const userRole = user?.role || "Colaborador";
    const userId = user?.id;
    if (isFarmerRole(userRole) && projetoCliente) {
      const access = await hasAccessToProject(userId!, projetoCliente);
      if (!access) {
        return NextResponse.json({ error: "Não autorizado. Você não tem acesso a este projeto." }, { status: 403 });
      }
    }

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

    const user = session!.user;
    const { searchParams } = new URL(req.url);
    const parsed = diarioLogDeleteSchema.safeParse({
      id: searchParams.get("id"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodErrors(parsed.error) }, { status: 400 });
    }
    const { id } = parsed.data;

    const db = getSupabase();

    // 🔒 Busca o log para verificar se o usuário tem acesso ao projeto
    const userRole = user?.role || "Colaborador";
    const userId = user?.id;
    if (isFarmerRole(userRole)) {
      const { data: logData } = await db
        .from("diario_logs")
        .select("projeto_cliente")
        .eq("id", id)
        .maybeSingle();
      
      if (logData?.projeto_cliente) {
        const access = await hasAccessToProject(userId!, logData.projeto_cliente);
        if (!access) {
          return NextResponse.json({ error: "Não autorizado. Você não tem acesso a este projeto." }, { status: 403 });
        }
      }
    }

    const { error } = await db.from("diario_logs").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/diario-logs]", e);
    return NextResponse.json({ error: "Erro ao deletar log." }, { status: 500 });
  }
}
