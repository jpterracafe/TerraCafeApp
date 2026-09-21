import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSupabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";

function podeVincular(session: unknown): boolean {
  const role = (session as { user?: { role?: string } } | null)?.user?.role || "";
  return ["Admin", "Diretor", "Desenvolvedor"].includes(role);
}

// ── POST /api/admin/responsaveis/vincular ────────────────────────────────────
// Vincula um responsável (sem login) a um usuário JÁ existente.
// Usado quando há conflito de nomes: em vez de criar um segundo login com o
// mesmo nome, o admin aponta o responsável para o login correto.
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    if (!podeVincular(session)) {
      return NextResponse.json({ error: "Acesso restrito a Admin/Diretor." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const responsavelId = String(body?.responsavelId ?? body?.id ?? "").trim();
    const userEmail = String(body?.userEmail ?? body?.email ?? "").trim().toLowerCase();

    if (!responsavelId || !userEmail) {
      return NextResponse.json({ error: "responsavelId e userEmail são obrigatórios." }, { status: 400 });
    }

    const db = getSupabase();

    const { data: user } = await db.from("users").select("id, name, email, role").eq("email", userEmail).maybeSingle();
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado para este e-mail." }, { status: 404 });
    }

    const { data: resp } = await db.from("responsaveis").select("id").eq("id", responsavelId).maybeSingle();
    if (!resp) {
      return NextResponse.json({ error: "Responsável não encontrado." }, { status: 404 });
    }

    const attempt = await db
      .from("responsaveis")
      .update({ user_id: (user as { id: string }).id, user_email: (user as { email: string }).email })
      .eq("id", responsavelId);
    if (attempt.error && (attempt.error.code === "PGRST204" || attempt.error.message?.includes("user_id"))) {
      const fb = await db.from("responsaveis").update({ user_email: (user as { email: string }).email }).eq("id", responsavelId);
      if (fb.error && !(fb.error.code === "PGRST204")) throw fb.error;
    } else if (attempt.error) {
      throw attempt.error;
    }

    return NextResponse.json({ ok: true, user });
  } catch (e) {
    console.error("[POST /api/admin/responsaveis/vincular]", e);
    return NextResponse.json({ error: "Erro ao vincular responsável." }, { status: 500 });
  }
}
