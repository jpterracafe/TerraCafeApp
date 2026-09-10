import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSupabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";
import { requireSession } from "@/lib/api";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const db = getSupabase();
    const { data: users, error } = await db
      .from("users")
      .select("id, name, email, role")
      .order("name", { ascending: true });

    if (error) {
      console.error("[GET /api/usuarios-roles] Erro banco:", error);
      return NextResponse.json({ users: [] });
    }

    return NextResponse.json({
      users: (users ?? []).map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role || "Agricultor",
      })),
    });
  } catch (error) {
    console.error("[GET /api/usuarios-roles]", error);
    return NextResponse.json({ error: "Erro ao buscar cargos de usuários." }, { status: 500 });
  }
}
