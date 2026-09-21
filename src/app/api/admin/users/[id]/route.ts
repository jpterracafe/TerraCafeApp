import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcrypt";
import { getSupabase } from "@/lib/supabase";
import { authOptions, isAdminSession } from "@/lib/auth";
import env from "@/lib/env";
import { ALLOWED_ROLES } from "../route";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminSession(session as any)) {
      return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const db = getSupabase();

    const { data: user, error: findError } = await db
      .from("users")
      .select("id, email")
      .eq("id", id)
      .single();

    if (findError || !user) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    // Proteção: não excluir o admin principal
    const adminEmail = env.ADMIN_EMAIL?.toLowerCase();
    if (user.email && adminEmail && user.email.toLowerCase() === adminEmail) {
      return NextResponse.json(
        { error: "O administrador principal não pode ser excluído." },
        { status: 400 }
      );
    }

    // Proteção: não permitir auto-exclusão
    if (session?.user?.email && user.email === session.user.email) {
      return NextResponse.json(
        { error: "Você não pode excluir a própria conta." },
        { status: 400 }
      );
    }

    const { error: deleteError } = await db
      .from("users")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("[DELETE /api/admin/users/[id]]", JSON.stringify(deleteError));
      throw deleteError;
    }

    // Desvincula responsáveis ligados a esse login: eles voltam a aparecer
    // como "Sem login" (como eram antes), SEM mexer nas fases — o nome
    // continua nas fases/projetos, só o acesso ao sistema é removido.
    // (Tolerante a bancos sem as colunas novas.)
    try {
      const un1 = await db.from("responsaveis").update({ user_id: null, user_email: null }).eq("user_id", id);
      if (un1.error && (un1.error.code === "PGRST204" || un1.error.message?.includes("user_id"))) {
        // Sem coluna user_id: nada a desvincular de forma segura
        // (limpar user_email aqui apagaria também a informação de dono).
      } else if (un1.error) {
        console.warn("[DELETE /api/admin/users/[id]] Falha ao desvincular por user_id:", JSON.stringify(un1.error));
      } else if (user.email) {
        // Linhas vinculadas só por e-mail (user_id nulo, mas criado_por de outra pessoa)
        const emailLc = user.email.trim().toLowerCase();
        const un2 = await db
          .from("responsaveis")
          .update({ user_email: null })
          .eq("user_email", emailLc)
          .is("user_id", null)
          .not("criado_por_email", "is", null)
          .neq("criado_por_email", emailLc);
        if (un2.error && un2.error.code !== "PGRST204" && !un2.error.message?.includes("criado_por")) {
          console.warn("[DELETE /api/admin/users/[id]] Falha ao desvincular por email:", JSON.stringify(un2.error));
        }
      }
    } catch (e) {
      console.warn("[DELETE /api/admin/users/[id]] Desvinculação ignorada:", e);
    }

    // Limpeza best-effort de permissões explícitas (tabela pode nem existir)
    try {
      if (user.email) {
        await db.from("user_projetos").delete().eq("user_email", user.email.trim().toLowerCase());
      }
    } catch {
      // silent — tabela opcional
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/admin/users/[id]]", error);
    return NextResponse.json({ error: "Erro ao conectar ao banco de dados." }, { status: 500 });
  }
}

// ── PATCH /api/admin/users/[id] — atualizar cargo ou resetar senha ────────────
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminSession(session as any)) {
      return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const db = getSupabase();

    // 1. Atualização de Cargo / Role
    if (body.role || body.cargo) {
      const novoCargo = String(body.role || body.cargo).trim();
      if (!ALLOWED_ROLES.includes(novoCargo as (typeof ALLOWED_ROLES)[number])) {
        return NextResponse.json({ error: "Nível de acesso inválido." }, { status: 400 });
      }

      const { error: roleError } = await db
        .from("users")
        .update({ role: novoCargo })
        .eq("id", id);

      if (roleError) {
        console.error("[PATCH role /api/admin/users/[id]]", roleError);
        throw roleError;
      }

      return NextResponse.json({ ok: true, role: novoCargo, cargo: novoCargo });
    }

    // 2. Reset de senha aleatória (se não enviou role)
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let novaSenha = "";
    for (let i = 0; i < 8; i++) {
      novaSenha += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const hashed = await bcrypt.hash(novaSenha, 10);

    const { error } = await db
      .from("users")
      .update({ password: hashed, senha_temp: novaSenha })
      .eq("id", id);

    if (error) {
      console.error("[PATCH /api/admin/users/[id]]", JSON.stringify(error));
      throw error;
    }

    return NextResponse.json({ novaSenha });
  } catch (error) {
    console.error("[PATCH /api/admin/users/[id]]", error);
    return NextResponse.json({ error: "Erro ao processar alteração." }, { status: 500 });
  }
}
