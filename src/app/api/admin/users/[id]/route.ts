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
