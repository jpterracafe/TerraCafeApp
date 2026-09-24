import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSupabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";
import { requireSession } from "@/lib/api";
import {
  responsavelCreateSchema,
  responsavelDeleteSchema,
  formatZodErrors,
} from "@/lib/validators";
import { normalizeName, parseResponsavelEmails } from "@/lib/responsaveis";

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

function buildAvatar(nome: string): string {
  const parts = (nome || "").trim().split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (nome || "").substring(0, 2).toUpperCase() || "U";
}

// ── GET /api/responsaveis ──────────────────────────────────────────────────────
// Admin/Diretor: vê TODOS os responsáveis, com diferenciação:
//   - temLogin=true  → já é agricultor (tem user vinculado por user_id,
//     user_email ou nome igual ao de um user)
//   - temLogin=false → foi criado por um agricultor e ainda não tem login
//   - projetos: lista de projetos (fases_acao.projeto_cliente) onde esse
//     responsável aparece — ao criar o login, esses projetos aparecem
//     direto para a pessoa.
// Agricultor: vê apenas os que ele mesmo cadastrou (+ entrada virtual "self").
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const db = getSupabase();
    const sessionEmail = getSessionEmail(session);
    const sessionName = (session?.user?.name?.trim() ?? "") as string;
    const adminView = isAdminOrDiretor(session);

    // Query base — colunas explícitas (menos bytes) + tolera banco sem as
    // colunas novas (fallback).
    // Agricultor vê: o que ELE criou (criado_por_email) + o que está
    // vinculado ao e-mail dele (user_email — legado ou login criado p/ ele).
    // O OR garante que a linha NÃO suma da lista do criador quando o admin
    // cria um login (user_email passa a ser o e-mail novo, mas criado_por fica).
    let rows: any[] | null = null;
    const RESP_COLS = "id, nome, cargo, origem, user_email, user_id, criado_por_email, criado_por_nome, created_at";
    // Executa busca de responsáveis, usuários e fases em paralelo
    const [fetchedRows, usersRes, fasesRes] = await Promise.all([
      (async () => {
        if (!adminView && sessionEmail) {
          const attempt = await db
            .from("responsaveis")
            .select(RESP_COLS)
            .or(`criado_por_email.eq.${sessionEmail},user_email.eq.${sessionEmail}`)
            .order("created_at", { ascending: true });
          if (attempt.error && (attempt.error.code === "PGRST204" || attempt.error.message?.includes("user_email") || attempt.error.message?.includes("criado_por"))) {
            const fb = await db.from("responsaveis").select("id, nome, cargo, origem, created_at").order("created_at", { ascending: true });
            if (fb.error) throw fb.error;
            return fb.data ?? [];
          } else {
            if (attempt.error) throw attempt.error;
            return attempt.data ?? [];
          }
        } else {
          const { data, error } = await db.from("responsaveis").select(RESP_COLS).order("created_at", { ascending: true });
          if (error) {
            if (error.code === "PGRST204" || error.message?.includes("user_email") || error.message?.includes("user_id")) {
              const fb = await db.from("responsaveis").select("id, nome, cargo, origem, created_at").order("created_at", { ascending: true });
              if (fb.error) throw fb.error;
              return fb.data ?? [];
            } else {
              throw error;
            }
          }
          return data ?? [];
        }
      })(),
      Promise.resolve(db.from("users").select("id, name, email, role")).catch(() => ({ data: [] })),
      Promise.resolve(db.from("fases_acao").select("responsavel, projeto_cliente").eq("is_deleted", false).limit(5000)).catch(() => ({ data: [] })),
    ]);

    rows = fetchedRows;
    if (!adminView && sessionEmail) {
      // Rede de segurança em memória: nunca entrega ao agricultor linhas de outros donos
      rows = (rows ?? []).filter((r) => {
        const dono = (r.criado_por_email ?? "").trim().toLowerCase();
        const vinculado = (r.user_email ?? "").trim().toLowerCase();
        if (dono) return dono === sessionEmail || vinculado === sessionEmail;
        if (r.user_id) return vinculado === sessionEmail;
        return vinculado === sessionEmail;
      });
    }

    // Carrega users para marcar quem já tem login (match por id, email ou nome)
    const usersByEmail = new Map<string, { id: string; name: string | null; email: string | null; role: string }>();
    const usersByNormName = new Map<string, { id: string; name: string | null; email: string | null; role: string }>();
    const users = (usersRes as any)?.data;
    for (const u of (users ?? []) as { id: string; name: string | null; email: string | null; role: string }[]) {
      if (u.email) usersByEmail.set(u.email.trim().toLowerCase(), u);
      if (u.name) {
        const k = normalizeName(u.name);
        if (k && !usersByNormName.has(k)) usersByNormName.set(k, u);
      }
    }

    // Carrega fases para mapear projetos vinculados por responsável
    const projetosPorResp = new Map<string, Set<string>>(); // normName -> projetos
    const projetosPorEmail = new Map<string, Set<string>>(); // email -> projetos
    const fases = (fasesRes as any)?.data;
    for (const f of (fases ?? []) as { responsavel: string | null; projeto_cliente: string | null }[]) {
      const proj = (f.projeto_cliente || "").trim();
      if (!proj) continue;
      for (const parte of parseResponsavelEmails(f.responsavel || "")) {
        const p = parte.trim();
        if (!p) continue;
        if (p.includes("@")) {
          const k = p.toLowerCase();
          if (!projetosPorEmail.has(k)) projetosPorEmail.set(k, new Set());
          projetosPorEmail.get(k)!.add(proj);
        } else {
          const k = normalizeName(p);
          if (!k) continue;
          if (!projetosPorResp.has(k)) projetosPorResp.set(k, new Set());
          projetosPorResp.get(k)!.add(proj);
        }
      }
    }

    const responsaveis = (rows ?? []).map((r) => {
      const nome: string = r.nome ?? "";
      const normNome = normalizeName(nome);
      const vinculadoEmail = (r.user_email ?? "").trim().toLowerCase();
      const vinculadoId = r.user_id ?? null;

      // Tem login? 1) vínculo direto 2) email bate com users 3) nome bate com users
      let userVinculado = null as null | { id: string; name: string | null; email: string | null; role: string };
      if (vinculadoEmail && usersByEmail.has(vinculadoEmail)) {
        userVinculado = usersByEmail.get(vinculadoEmail)!;
      } else if (normNome && usersByNormName.has(normNome)) {
        userVinculado = usersByNormName.get(normNome)!;
      }
      // Se há user_id mas o email mudou, tenta achar pelo id
      const temLogin = Boolean(vinculadoId || userVinculado);

      // Projetos vinculados (por nome + por email vinculado)
      const projs = new Set<string>();
      if (normNome && projetosPorResp.has(normNome)) {
        for (const p of projetosPorResp.get(normNome)!) projs.add(p);
      }
      const emailParaProjs = (userVinculado?.email || vinculadoEmail || "").toLowerCase();
      if (emailParaProjs && projetosPorEmail.has(emailParaProjs)) {
        for (const p of projetosPorEmail.get(emailParaProjs)!) projs.add(p);
      }
      const projetos = Array.from(projs).sort();

      return {
        id: r.id,
        nome,
        cargo: r.cargo ?? "",
        origem: r.origem ?? "MANUAL",
        avatar: buildAvatar(nome),
        user_email: r.user_email ?? userVinculado?.email ?? "",
        user_id: vinculadoId ?? userVinculado?.id ?? null,
        temLogin,
        loginEmail: userVinculado?.email ?? (vinculadoEmail || null),
        loginRole: userVinculado?.role ?? null,
        criadoPorEmail: r.criado_por_email ?? r.user_email ?? null,
        criadoPorNome: r.criado_por_nome ?? null,
        projetos,
        totalProjetos: projetos.length,
      };
    });

    // Agricultor: garante que o próprio usuário logado apareça nas opções,
    // para que ele possa se escolher como responsável das fases.
    if (!adminView && sessionEmail) {
      const nomeSelf = sessionName || sessionEmail;
      const targetNome = normalizeName(nomeSelf);
      const jaTemSelf =
        targetNome &&
        responsaveis.some((r) => normalizeName(r.nome) === targetNome);

      if (!jaTemSelf) {
        responsaveis.unshift({
          id: "self",
          nome: nomeSelf,
          cargo: "Agricultor",
          origem: "USUARIO",
          avatar: buildAvatar(nomeSelf),
          user_email: sessionEmail,
          user_id: null,
          temLogin: true,
          loginEmail: sessionEmail,
          loginRole: null,
          criadoPorEmail: sessionEmail,
          criadoPorNome: nomeSelf,
          projetos: [],
          totalProjetos: 0,
        });
      }
    }

    return NextResponse.json({ responsaveis }, {
      headers: {
        "Cache-Control": "private, max-age=5, stale-while-revalidate=15",
      },
    });
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
    const sessionName = (session?.user?.name?.trim() ?? "") as string;

    // Insere o responsável associado ao usuário logado (+ rastreio de quem criou).
    // Tolerante a bancos sem as colunas novas.
    const payloadFull: Record<string, unknown> = {
      nome,
      cargo,
      origem,
      user_email: sessionEmail,
      criado_por_email: sessionEmail,
      criado_por_nome: sessionName || null,
    };
    let data: any = null;
    const attempt1 = await db.from("responsaveis").insert(payloadFull).select("*").single();
    if (attempt1.error && (attempt1.error.code === "PGRST204" || attempt1.error.message?.includes("user_email") || attempt1.error.message?.includes("criado_por"))) {
      const attempt2 = await db
        .from("responsaveis")
        .insert({ nome, cargo, origem, user_email: sessionEmail })
        .select("*")
        .single();
      if (attempt2.error && (attempt2.error.code === "PGRST204" || attempt2.error.message?.includes("user_email"))) {
        const attempt3 = await db.from("responsaveis").insert({ nome, cargo, origem }).select("*").single();
        if (attempt3.error) throw attempt3.error;
        data = attempt3.data;
      } else {
        if (attempt2.error) throw attempt2.error;
        data = attempt2.data;
      }
    } else {
      if (attempt1.error) throw attempt1.error;
      data = attempt1.data;
    }

    return NextResponse.json({
      responsavel: {
        id: data.id,
        nome: data.nome,
        cargo: data.cargo,
        origem: data.origem,
        avatar: buildAvatar(nome),
        user_email: data.user_email ?? sessionEmail,
        temLogin: false,
        projetos: [],
        totalProjetos: 0,
      },
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

    // Self ("USUARIO") é uma entrada virtual gerada em GET e não existe no banco
    if (id === "self") {
      return NextResponse.json({ ok: true });
    }

    const sessionEmail = getSessionEmail(session);
    const adminView = isAdminOrDiretor(session);

    // Se não for admin, verifica se o responsável pertence ao usuário
    // (dono = criado_por_email; user_email sozinho não basta, pois o admin
    // pode ter trocado o user_email ao criar um login para a pessoa)
    if (!adminView) {
      const { data: resp, error: fetchError } = await db
        .from("responsaveis")
        .select("user_email, criado_por_email, user_id")
        .eq("id", id)
        .single();

      if (fetchError) {
        // Banco sem as colunas novas: tenta só com user_email
        if (fetchError.code === "PGRST204" || fetchError.message?.includes("criado_por") || fetchError.message?.includes("user_id")) {
          const fb = await db.from("responsaveis").select("user_email").eq("id", id).single();
          if (fb.error) throw fb.error;
          if (!fb.data || (fb.data as { user_email?: string }).user_email !== sessionEmail) {
            return NextResponse.json({ error: "Sem permissão para deletar este responsável." }, { status: 403 });
          }
        } else {
          throw fetchError;
        }
      } else {
        const dono = ((resp as { criado_por_email?: string | null }).criado_por_email ?? "").trim().toLowerCase();
        const vinculado = ((resp as { user_email?: string | null }).user_email ?? "").trim().toLowerCase();
        const ehDono = dono ? dono === sessionEmail : vinculado === sessionEmail && !(resp as { user_id?: string | null }).user_id;
        if (!ehDono) {
          return NextResponse.json({ error: "Sem permissão para deletar este responsável." }, { status: 403 });
        }
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
