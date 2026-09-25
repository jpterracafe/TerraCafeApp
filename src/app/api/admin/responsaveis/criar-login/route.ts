import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcrypt";
import { getSupabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";
import { normalizeName, parseResponsavelEmails } from "@/lib/responsaveis";

// Quem pode criar login para responsáveis: Admin, Diretor e Desenvolvedor.
// (De propósito NÃO usa isAdminSession, que é restrito ao Desenvolvedor —
// o João Pedro entra com login de Admin e precisa ter acesso.)
function podeCriarLogin(session: unknown): boolean {
  const role = (session as { user?: { role?: string } } | null)?.user?.role || "";
  return ["Admin", "Diretor", "Coordenador", "Desenvolvedor"].includes(role);
}

const ALLOWED_ROLES = ["Montador", "Gerente", "Coordenador", "Diretor", "Admin", "Agricultor", "Colaborador"] as const;

function gerarSenhaAleatoria(tamanho = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < tamanho; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}

// ── POST /api/admin/responsaveis/criar-login ─────────────────────────────────
// Cria um login (users) a partir de um responsável que ainda não tem login
// (aqueles que os próprios agricultores cadastraram manualmente).
// O user é criado com name EXATAMENTE igual ao responsavel.nome, então todos
// os projetos/fases onde o agricultor conectou aquela pessoa aparecem direto
// para ela ao entrar (match por nome em hasProjectAccess / /api/fases).
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    if (!podeCriarLogin(session)) {
      return NextResponse.json({ error: "Acesso restrito a Admin/Diretor." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const responsavelId = String(body?.responsavelId ?? body?.id ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const role = String(body?.role ?? body?.cargo ?? "Agricultor").trim() || "Agricultor";

    if (!responsavelId) {
      return NextResponse.json({ error: "responsavelId é obrigatório." }, { status: 400 });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "E-mail válido é obrigatório." }, { status: 400 });
    }
    if (!(ALLOWED_ROLES as readonly string[]).includes(role)) {
      return NextResponse.json({ error: "Nível de acesso inválido." }, { status: 400 });
    }
    // Só Desenvolvedor pode criar outro Desenvolvedor
    const requesterRole = (session.user as { role?: string })?.role;
    if (role === "Desenvolvedor" && requesterRole !== "Desenvolvedor") {
      return NextResponse.json({ error: "Só o Desenvolvedor pode criar outro Desenvolvedor." }, { status: 403 });
    }

    const db = getSupabase();

    // 1. Busca o responsável (só colunas usadas abaixo)
    const { data: resp, error: respErr } = await db
      .from("responsaveis")
      .select("id, nome, user_id, user_email")
      .eq("id", responsavelId)
      .maybeSingle();
    if (respErr) throw respErr;
    if (!resp) {
      return NextResponse.json({ error: "Responsável não encontrado." }, { status: 404 });
    }
    if ((resp as { user_id?: string | null }).user_id) {
      return NextResponse.json({ error: "Este responsável já tem login vinculado." }, { status: 409 });
    }

    const nomeResponsavel = String((resp as { nome?: string }).nome ?? "").trim();
    if (!nomeResponsavel) {
      return NextResponse.json({ error: "Responsável sem nome." }, { status: 400 });
    }

    // 2. E-mail já em uso?
    const { data: emailEmUso } = await db.from("users").select("id").eq("email", email).maybeSingle();
    if (emailEmUso) {
      return NextResponse.json({ error: "Já existe um usuário com este e-mail." }, { status: 409 });
    }

    // 3. Conflito de nomes? Se já existe um USER com o mesmo nome normalizado,
    // criar outro login geraria dois logins para o "mesmo nome" — confuso e
    // ambíguo nas fases. Retorna 409 orientando a vincular em vez de duplicar.
    const normNome = normalizeName(nomeResponsavel);
    let conflitoNome: { id: string; name: string | null; email: string | null } | null = null;
    try {
      const { data: users } = await db.from("users").select("id, name, email");
      for (const u of (users ?? []) as { id: string; name: string | null; email: string | null }[]) {
        if (u.name && normalizeName(u.name) === normNome) {
          conflitoNome = u;
          break;
        }
      }
    } catch {
      // silent
    }
    if (conflitoNome) {
      return NextResponse.json(
        {
          error: `Já existe um login com o nome "${conflitoNome.name}" (${conflitoNome.email}). Vincule o responsável a esse login em vez de criar outro — senão os projetos ficam ambíguos.`,
          conflito: conflitoNome,
        },
        { status: 409 }
      );
    }

    // 4. Homônimos na tabela responsaveis (alerta, não bloqueia)
    let homonimos = 0;
    try {
      const { data: todos } = await db.from("responsaveis").select("id, nome");
      homonimos = ((todos ?? []) as { id: string; nome: string }[]).filter(
        (r) => r.id !== responsavelId && normalizeName(r.nome || "") === normNome
      ).length;
    } catch {
      // silent
    }

    // 5. Cria o usuário com o MESMO nome do responsável
    const senhaGerada = gerarSenhaAleatoria(8);
    const hashed = await bcrypt.hash(senhaGerada, 10);

    const { data: novoUser, error: insertErr } = await db
      .from("users")
      .insert({ name: nomeResponsavel, email, password: hashed, senha_temp: senhaGerada, role })
      .select("id, name, email, role, created_at")
      .single();
    if (insertErr) {
      // Fallback caso a coluna senha_temp não exista no banco
      if (insertErr.code === "PGRST204" || insertErr.message?.includes("senha_temp")) {
        const retry = await db
          .from("users")
          .insert({ name: nomeResponsavel, email, password: hashed, role })
          .select("id, name, email, role, created_at")
          .single();
        if (retry.error) throw retry.error;
        // Vincula mesmo sem senha_temp salva
        await vincularResponsavel(db, responsavelId, (retry.data as { id: string }).id, email);
        const projetos = await projetosDe(db, nomeResponsavel, email);
        return NextResponse.json({
          user: { ...(retry.data as object), senhaTemp: senhaGerada },
          senhaGerada,
          projetos,
          avisoHomonimos: homonimos > 0 ? `Atenção: existem outros ${homonimos} responsável(is) com o mesmo nome. Os projetos deles também aparecerão para este login.` : null,
        });
      }
      throw insertErr;
    }

    // 6. Vincula responsável <-> user
    await vincularResponsavel(db, responsavelId, (novoUser as { id: string }).id, email);

    // 7. Projetos que já vão aparecer direto para a pessoa
    const projetos = await projetosDe(db, nomeResponsavel, email);

    return NextResponse.json({
      user: { ...(novoUser as object), senhaTemp: senhaGerada },
      senhaGerada,
      projetos,
      avisoHomonimos: homonimos > 0 ? `Atenção: existem outros ${homonimos} responsável(is) com o mesmo nome. Os projetos deles também aparecerão para este login.` : null,
    });
  } catch (e) {
    console.error("[POST /api/admin/responsaveis/criar-login]", e);
    return NextResponse.json({ error: "Erro ao criar login para o responsável." }, { status: 500 });
  }
}

async function vincularResponsavel(db: ReturnType<typeof getSupabase>, responsavelId: string, userId: string, email: string) {
  const attempt = await db.from("responsaveis").update({ user_id: userId, user_email: email }).eq("id", responsavelId);
  if (attempt.error && (attempt.error.code === "PGRST204" || attempt.error.message?.includes("user_id"))) {
    // Banco sem user_id: vincula ao menos por email
    const fb = await db.from("responsaveis").update({ user_email: email }).eq("id", responsavelId);
    if (fb.error && !(fb.error.code === "PGRST204")) throw fb.error;
  } else if (attempt.error) {
    throw attempt.error;
  }
}

async function projetosDe(db: ReturnType<typeof getSupabase>, nome: string, email: string): Promise<string[]> {
  try {
    const { data: fases } = await db.from("fases_acao").select("responsavel, projeto_cliente").eq("is_deleted", false).limit(5000);
    const normNome = normalizeName(nome);
    const emailLc = email.toLowerCase();
    const set = new Set<string>();
    for (const f of (fases ?? []) as { responsavel: string | null; projeto_cliente: string | null }[]) {
      const proj = (f.projeto_cliente || "").trim();
      if (!proj) continue;
      const partes = parseResponsavelEmails(f.responsavel || "");
      const match = partes.some((p) => {
        const t = p.trim();
        if (!t) return false;
        if (t.includes("@")) return t.toLowerCase() === emailLc;
        return normalizeName(t) === normNome;
      });
      if (match) set.add(proj);
    }
    return Array.from(set).sort();
  } catch {
    return [];
  }
}
