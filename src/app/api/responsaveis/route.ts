import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSupabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";
import { requireSession, getQueryParam } from "@/lib/api";
import {
  responsavelCreateSchema,
  responsavelDeleteSchema,
  formatZodErrors,
} from "@/lib/validators";
import { isAdminSession } from "@/lib/auth";

// ── Helper: verifica se usuário é admin/diretor (vê todos os responsáveis)
function isAdminOrDiretor(session: any): boolean {
  if (!session?.user) return false;
  const role = (session.user as any)?.role || "";
  return ["Diretor", "Desenvolvedor", "Admin"].includes(role);
}

// ── Helper: obtém email do usuário logado
function getSessionEmail(session: any): string {
  return session?.user?.email?.trim().toLowerCase() ?? "";
}

// ── GET /api/responsaveis ──────────────────────────────────────────────────────
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const db = getSupabase();
    const sessionEmail = getSessionEmail(session);
    const adminView = isAdminOrDiretor(session);

    // Query base
    let query = db.from("responsaveis").select("*");

    // Se não for admin/diretor, filtra apenas os responsáveis criados pelo próprio usuário
    if (!adminView && sessionEmail) {
      query = query.eq("user_email", sessionEmail);
    }

    const { data, error } = await query.order("created_at", { ascending: true });

    if (error) throw error;

    const responsaveis = (data ?? []).map((r) => {
      const nome: string = r.nome ?? "";
      const parts = nome.trim().split(" ");
      const avatar =
        parts.length >= 2
          ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
          : nome.substring(0, 2).toUpperCase() || "U";
      return {
        id: r.id,
        nome,
        cargo: r.cargo ?? "",
        origem: r.origem ?? "MANUAL",
        avatar,
        user_email: r.user_email ?? "", // Include for admin view
      };
    });

    return NextResponse.json({ responsaveis });
  } catch (e) {
    console.error("[GET /api/responsaveis]", e);
    return NextResponse.json({ error: "Erro ao buscar responsáveis." }, { status: 500 });
  }
}

// ── POST /api/responsaveis ─────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const body = await req.json().catch(() => null);
    const parsed = responsavelCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodErrors(parsed.error) }, { status: 400 });
    }
    const { nome, cargo, origem } = parsed.data;

    const db = getSupabase();
    const sessionEmail = getSessionEmail(session);

    // Insere o responsável associado ao usuário logado
    const { data, error } = await db
      .from("responsaveis")
      .insert({ nome, cargo, origem, user_email: sessionEmail })
      .select("*")
      .single();

    if (error) throw error;

    const parts = nome.trim().split(" ");
    const avatar =
      parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : nome.substring(0, 2).toUpperCase() || "U";

    return NextResponse.json({
      responsavel: { id: data.id, nome: data.nome, cargo: data.cargo, origem: data.origem, avatar, user_email: data.user_email },
    });
  } catch (e) {
    console.error("[POST /api/responsaveis]", e);
    return NextResponse.json({ error: "Erro ao criar responsável." }, { status: 500 });
  }
}

// ── DELETE /api/responsaveis?id=xxx ───────────────────────────────────────────
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const { searchParams } = new URL(req.url);
    const parsed = responsavelDeleteSchema.safeParse({
      id: searchParams.get("id"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodErrors(parsed.error) }, { status: 400 });
    }
    const { id } = parsed.data;

    const db = getSupabase();
    const sessionEmail = getSessionEmail(session);
    const adminView = isAdminOrDiretor(session);

    // Se não for admin, verifica se o responsável pertence ao usuário
    if (!adminView) {
      const { data: resp, error: fetchError } = await db
        .from("responsaveis")
        .select("user_email")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;
      if (!resp || resp.user_email !== sessionEmail) {
        return NextResponse.json({ error: "Sem permissão para deletar este responsável." }, { status: 403 });
      }
    }

    const { error } = await db.from("responsaveis").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/responsaveis]", e);
    return NextResponse.json({ error: "Erro ao deletar responsável." }, { status: 500 });
  }
}
