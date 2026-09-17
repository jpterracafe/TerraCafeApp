import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSupabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";
import { requireSession } from "@/lib/api";
import { canManageUsers } from "@/lib/roles";

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
// Body: { userId, projetoId }
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const authUser = session!.user;
    // Só admin pode gerenciar associações
    const userRole = authUser?.role || "Colaborador";
    if (!canManageUsers(userRole)) {
      return NextResponse.json({ error: "Não autorizado. Apenas administradores." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const userId = body?.userId?.trim();
    const projetoId = body?.projetoId?.trim();

    if (!userId || !projetoId) {
      return NextResponse.json({ error: "userId e projetoId são obrigatórios." }, { status: 400 });
    }

    const db = getSupabase();

    // Verifica se usuário existe
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

    // Cria associação (upsert para evitar duplicatas)
    const { data, error } = await db
      .from("user_projetos")
      .upsert({ user_id: userId, projeto_id: projetoId }, { onConflict: "user_id,projeto_id" })
      .select(`
        id,
        user_id,
        projeto_id,
        created_at,
        projetos_irrigacao (id, nome, status)
      `)
      .single();

    if (error) throw error;

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
    // Só admin pode gerenciar associações
    const userRole = user?.role || "Colaborador";
    if (!canManageUsers(userRole)) {
      return NextResponse.json({ error: "Não autorizado. Apenas administradores." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId")?.trim();
    const projetoId = searchParams.get("projetoId")?.trim();

    if (!userId || !projetoId) {
      return NextResponse.json({ error: "userId e projetoId são obrigatórios." }, { status: 400 });
    }

    const db = getSupabase();

    const { error } = await db
      .from("user_projetos")
      .delete()
      .eq("user_id", userId)
      .eq("projeto_id", projetoId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/user-projetos]", e);
    return NextResponse.json({ error: "Erro ao remover associação." }, { status: 500 });
  }
}