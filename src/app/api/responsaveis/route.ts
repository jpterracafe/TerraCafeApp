import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSupabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";
import { requireSession, getQueryParam } from "@/lib/api";
import { canCreateResponsaveis, canDeleteResponsaveis } from "@/lib/roles";
import {
  responsavelCreateSchema,
  responsavelDeleteSchema,
  formatZodErrors,
} from "@/lib/validators";
import { audit } from "@/lib/audit";

// ── GET /api/responsaveis ──────────────────────────────────────────────────────
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const db = getSupabase();
    const { data, error } = await db
      .from("responsaveis")
      .select("*")
      .order("created_at", { ascending: true });

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

    const user = session!.user;
    // 🔒 Admin, Diretor e Agricultor podem criar responsáveis
    const userRole = user?.role || "Colaborador";
    if (!canCreateResponsaveis(userRole)) {
      return NextResponse.json({ error: "Não autorizado. Apenas administradores, diretores e agricultores podem criar responsáveis." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = responsavelCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodErrors(parsed.error) }, { status: 400 });
    }
    const { nome, cargo, origem } = parsed.data;

    const db = getSupabase();
    const { data, error } = await db
      .from("responsaveis")
      .insert({ nome, cargo, origem })
      .select("*")
      .single();

    if (error) throw error;

    // Auditoria: criação de responsável
    await audit.responsavel.create(user, data);

    const parts = nome.trim().split(" ");
    const avatar =
      parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : nome.substring(0, 2).toUpperCase() || "U";

    return NextResponse.json({
      responsavel: { id: data.id, nome: data.nome, cargo: data.cargo, origem: data.origem, avatar },
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

    const user = session!.user;
    // 🔒 Admin, Diretor e Agricultor podem deletar responsáveis
    const userRole = user?.role || "Colaborador";
    if (!canDeleteResponsaveis(userRole)) {
      return NextResponse.json({ error: "Não autorizado. Apenas administradores, diretores e agricultores podem deletar responsáveis." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = responsavelDeleteSchema.safeParse({
      id: searchParams.get("id"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodErrors(parsed.error) }, { status: 400 });
    }
    const { id } = parsed.data;

    const db = getSupabase();

    // Busca o responsável ANTES de deletar para auditoria
    const { data: responsavelData } = await db
      .from("responsaveis")
      .select("nome")
      .eq("id", id)
      .single();

    const responsavelNome = responsavelData?.nome ?? "";

    const { error } = await db.from("responsaveis").delete().eq("id", id);
    if (error) throw error;

    // Auditoria: deleção de responsável
    await audit.responsavel.delete(user, id, responsavelNome);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/responsaveis]", e);
    return NextResponse.json({ error: "Erro ao deletar responsável." }, { status: 500 });
  }
}
