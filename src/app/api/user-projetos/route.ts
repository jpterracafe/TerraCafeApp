import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSupabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";
import { requireSession } from "@/lib/api";
import { canManageUsers } from "@/lib/roles";
import { audit } from "@/lib/audit";

// ── GET /api/user-projetos?userId=xxx ───────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const user = session!.user;
    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get("userId") || user.id;

    // Verifica permissão: admin pode ver de qualquer usuário, usuário comum só vê o seu
    const userRole = user?.role || "Colaborador";
    if (!canManageUsers(userRole) && targetUserId !== user.id) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
    }

    const db = getSupabase();
    const { data, error } = await db
      .from("user_projetos")
      .select(`
        id,
        user_id,
        projeto_id,
        role,
        created_at,
        projetos_irrigacao (id, nome, status)
      `)
      .eq("user_id", targetUserId);

    if (error) throw error;

    return NextResponse.json({ 
      userProjetos: (data ?? []).map((up: any) => ({
        id: up.id,
        userId: up.user_id,
        projetoId: up.projeto_id,
        role: up.role,
        projeto: up.projetos_irrigacao,
        createdAt: up.created_at,
      }))
    });
  } catch (e) {
    console.error("[GET /api/user-projetos]", e);
    return NextResponse.json({ error: "Erro ao buscar associações." }, { status: 500 });
  }
}

// ── POST /api/user-projetos ─────────────────────────────────────────────────────
// Body: { userId, projetoId, role? }  role default: 'member'
// Permissão: admin OU creator do projeto
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const authUser = session!.user;
    const userRole = authUser?.role || "Colaborador";
    
    const body = await req.json().catch(() => null);
    const userId = body?.userId?.trim();
    const projetoId = body?.projetoId?.trim();
    
    if (!userId || !projetoId) {
      return NextResponse.json({ error: "userId e projetoId são obrigatórios." }, { status: 400 });
    }

    const db = getSupabase();

    // Verifica se o usuário autenticado tem permissão:
    // - Admin: pode gerenciar qualquer associação
    // - Creator do projeto: pode adicionar membros ao seu projeto
    const isAdmin = canManageUsers(userRole);
    let isCreator = false;
    
    if (!isAdmin) {
      const { data: creatorCheck } = await db
        .from("user_projetos")
        .select("user_id")
        .eq("projeto_id", projetoId)
        .eq("user_id", authUser.id)
        .eq("role", "creator")
        .maybeSingle();
      isCreator = !!creatorCheck;
    }

    if (!isAdmin && !isCreator) {
      return NextResponse.json({ error: "Não autorizado. Apenas administradores ou o criador do projeto podem gerenciar associações." }, { status: 403 });
    }

    // Valida se usuário existe
    const { data: dbUser, error: userError } = await db
      .from("users")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !dbUser) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    // Verifica se projeto existe
    const { data: projeto, error: projetoError } = await db
      .from("projetos_irrigacao")
      .select("id")
      .eq("id", projetoId)
      .maybeSingle();

    if (projetoError || !projeto) {
      return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
    }

    const role = body?.role === 'creator' ? 'creator' : 'member'; // default 'member'

    // Se tentando definir como creator, verifica se já existe creator para este projeto
    if (role === 'creator') {
      const { data: existingCreator } = await db
        .from("user_projetos")
        .select("user_id")
        .eq("projeto_id", projetoId)
        .eq("role", "creator")
        .maybeSingle();

      if (existingCreator && existingCreator.user_id !== userId) {
        return NextResponse.json({ 
          error: "Já existe um criador para este projeto. Remova o criador atual antes de definir outro." 
        }, { status: 409 });
      }
    }

    // Cria associação (upsert para evitar duplicatas)
    const { data, error } = await db
      .from("user_projetos")
      .upsert({ user_id: userId, projeto_id: projetoId, role }, { onConflict: "user_id,projeto_id" })
      .select(`
        id,
        user_id,
        projeto_id,
        created_at,
        projetos_irrigacao (id, nome, status)
      `)
      .single();

    if (error) throw error;

    const projetoData = data as any;
    // Auditoria: adição de membro/creator ao projeto
    const projetoNome = Array.isArray(projetoData.projetos_irrigacao) ? projetoData.projetos_irrigacao[0]?.nome : projetoData.projetos_irrigacao?.nome;
    await audit.userProjeto.add(
      authUser,
      userId,
      dbUser?.id || userId, // nome do usuário alvo
      projetoId,
      projetoNome || projetoId,
      role
    );

    return NextResponse.json({ 
      ok: true, 
      userProjeto: {
        id: data.id,
        userId: data.user_id,
        projetoId: data.projeto_id,
        projeto: data.projetos_irrigacao,
        createdAt: data.created_at,
      }
    });
  } catch (e) {
    console.error("[POST /api/user-projetos]", e);
    return NextResponse.json({ error: "Erro ao criar associação." }, { status: 500 });
  }
}

// ── DELETE /api/user-projetos?userId=xxx&projetoId=yyy ──────────────────────────
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const user = session!.user;
    const userRole = user?.role || "Colaborador";
    
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId")?.trim();
    const projetoId = searchParams.get("projetoId")?.trim();

    if (!userId || !projetoId) {
      return NextResponse.json({ error: "userId e projetoId são obrigatórios." }, { status: 400 });
    }

    const db = getSupabase();

    // Permissão: admin OU creator do projeto
    const isAdmin = canManageUsers(userRole);
    let isCreator = false;
    
    if (!isAdmin) {
      const { data: creatorCheck } = await db
        .from("user_projetos")
        .select("user_id")
        .eq("projeto_id", projetoId)
        .eq("user_id", user.id)
        .eq("role", "creator")
        .maybeSingle();
      isCreator = !!creatorCheck;
    }

    if (!isAdmin && !isCreator) {
      return NextResponse.json({ error: "Não autorizado. Apenas administradores ou o criador do projeto podem remover associações." }, { status: 403 });
    }

    // Não permitir remover o próprio creator (a menos que seja admin)
    if (!isAdmin && userId === user.id) {
      const { data: isCreatorCheck } = await db
        .from("user_projetos")
        .select("role")
        .eq("projeto_id", projetoId)
        .eq("user_id", userId)
        .maybeSingle();
      
      if (isCreatorCheck?.role === 'creator') {
        return NextResponse.json({ error: "Não é possível remover o criador do projeto." }, { status: 403 });
      }
    }

    // Busca info antes de deletar para auditoria
    const { data: assocData } = await db
      .from("user_projetos")
      .select("role, projetos_irrigacao(nome)")
      .eq("user_id", userId)
      .eq("projeto_id", projetoId)
      .single();

    const assoc = assocData as any;
    const role = assoc?.role || 'member';
    const projetoNome = Array.isArray(assoc?.projetos_irrigacao) ? assoc?.projetos_irrigacao[0]?.nome : assoc?.projetos_irrigacao?.nome || projetoId;

    const { error } = await db
      .from("user_projetos")
      .delete()
      .eq("user_id", userId)
      .eq("projeto_id", projetoId);

    if (error) throw error;

    // Auditoria: remoção de membro/creator do projeto
    await audit.userProjeto.remove(
      user,
      userId,
      userId, // target user id
      projetoId,
      projetoNome,
      role
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/user-projetos]", e);
    return NextResponse.json({ error: "Erro ao remover associação." }, { status: 500 });
  }
}