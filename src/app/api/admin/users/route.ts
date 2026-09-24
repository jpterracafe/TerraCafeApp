import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcrypt";
import { randomInt } from "crypto";
import { getSupabase } from "@/lib/supabase";
import { authOptions, isAdminSession, extractUsernameFromEmail } from "@/lib/auth";
import { getUserLojasMap, setUserLoja } from "@/lib/lojas";

export const ALLOWED_ROLES = [
  "Agricultor",
  "Admin",
  "Diretor",
  "Desenvolvedor",
  "Colaborador",
] as const;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminSession(session as any)) {
      return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
    }

    const db = getSupabase();
    let usersList: any[] = [];
    const { data: withSenhaTemp, error: errTemp } = await db
      .from("users")
      .select("id, name, email, role, senha_temp, created_at")
      .order("created_at", { ascending: false });

    if (!errTemp && withSenhaTemp) {
      usersList = withSenhaTemp;
    } else {
      const { data: fallback, error: errFallback } = await db
        .from("users")
        .select("id, name, email, role, created_at")
        .order("created_at", { ascending: false });
      if (errFallback) {
        console.error("[GET /api/admin/users]", errFallback);
        return NextResponse.json({ error: "Erro ao conectar ao banco de dados." }, { status: 500 });
      }
      usersList = fallback ?? [];
    }

    const mapLojas = await getUserLojasMap();

    return NextResponse.json({
      users: usersList.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        loja: (u.id && mapLojas[u.id.toLowerCase()]) || (u.email && mapLojas[u.email.toLowerCase().trim()]) || null,
        senhaTemp: u.senha_temp ?? null,
        createdAt: u.created_at,
      })),
    });
  } catch (error) {
    console.error("[GET /api/admin/users]", error);
    return NextResponse.json({ error: "Erro ao conectar ao banco de dados." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminSession(session as any)) {
      return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const cargoRaw = String(body?.cargo || body?.role || "").trim();
    const cargo = (cargoRaw || "Agricultor");
    const loja = String(body?.loja ?? "").trim();
    let nome    = String(body?.nome  ?? "").trim();

    if (!email) {
      return NextResponse.json({ error: "O e-mail é obrigatório." }, { status: 400 });
    }

    if (!nome) {
      nome = extractUsernameFromEmail(email);
    }
    if (!ALLOWED_ROLES.includes(cargo as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Nível de acesso inválido." }, { status: 400 });
    }

    const db = getSupabase();

    // Verificar duplicidade
    const { data: existing } = await db
      .from("users").select("id").eq("email", email).maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "Já existe um usuário com este e-mail." }, { status: 409 });
    }

    // Senha informada pelo admin ou gerada aleatoriamente (8 chars maiúsculos/números)
    const senhaInformada = String(body?.senha || body?.password || "").trim();
    let senhaGerada = senhaInformada;
    if (!senhaGerada) {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      for (let i = 0; i < 8; i++) {
        senhaGerada += chars.charAt(randomInt(chars.length));
      }
    }

    const hashed = await bcrypt.hash(senhaGerada, 10);
    // Log operacional sem dados sensíveis (sem senha/hash/e-mail).

    // Tenta inserir com senha_temp; fallback sem ela se a coluna não existir
    let userId: string;
    let userName: string | null;
    let userRole: string;
    let userCreatedAt: string;
    let senhaTemp: string | null = null;

    const { data: withTemp, error: errWithTemp } = await db
      .from("users")
      .insert({ name: nome, email, password: hashed, senha_temp: senhaGerada, role: cargo })
      .select("id, name, role, created_at")
      .single();

    if (errWithTemp) {
      console.warn("[POST /api/admin/users] Insert com senha_temp falhou, tentando sem:", errWithTemp.message);

      const { data: withoutTemp, error: errWithoutTemp } = await db
        .from("users")
        .insert({ name: nome, email, password: hashed, role: cargo })
        .select("id, name, role, created_at")
        .single();

      if (errWithoutTemp) {
        console.error("[POST /api/admin/users] Erro INSERT:", JSON.stringify(errWithoutTemp));
        return NextResponse.json(
          { error: errWithoutTemp.message ?? "Erro ao criar usuário." },
          { status: 500 }
        );
      }

      userId       = withoutTemp.id;
      userName     = withoutTemp.name;
      userRole     = withoutTemp.role;
      userCreatedAt= withoutTemp.created_at;
      // senha_temp não foi salva no banco, mas retornamos para o modal
      senhaTemp    = null;
    } else {
      userId       = withTemp.id;
      userName     = withTemp.name;
      userRole     = withTemp.role;
      userCreatedAt= withTemp.created_at;
      senhaTemp    = senhaGerada;
    }

    if (loja) {
      await setUserLoja(email, loja);
      if (userId) await setUserLoja(userId, loja);
    }

    return NextResponse.json({
      user: {
        id: userId,
        name: userName,
        email,
        role: userRole,
        loja: loja || null,
        senhaTemp: senhaTemp ?? senhaGerada, // sempre retorna para o modal
        createdAt: userCreatedAt,
      },
      senhaGerada,
    });
  } catch (error: any) {
    console.error("[POST /api/admin/users]", error);
    return NextResponse.json(
      { error: error?.message ?? "Erro ao conectar ao banco de dados." },
      { status: 500 }
    );
  }
}
