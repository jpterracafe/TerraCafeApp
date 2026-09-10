import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSupabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";

// ── GET /api/projetos?responsavel=Nome ────────────────────────────────────────
// Retorna nomes únicos de projetos ativos.
// Se ?responsavel= for informado, filtra só os projetos onde essa pessoa
// é responsável por pelo menos uma fase — evita que alguém registre no
// diário de campo de um projeto que não é dela.
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const responsavel = searchParams.get("responsavel")?.trim() ?? "";

    const db = getSupabase();

    let query = db
      .from("fases_acao")
      .select("projeto_cliente")
      .eq("is_deleted", false)
      .not("projeto_cliente", "is", null)
      .neq("projeto_cliente", "");

    // Se responsavel foi passado, filtra pelo responsável da fase
    if (responsavel) {
      query = query.eq("responsavel", responsavel);
    }

    const { data, error } = await query;
    if (error) throw error;

    const unicos = Array.from(
      new Set((data ?? []).map((r) => r.projeto_cliente as string).filter(Boolean))
    ).sort();

    return NextResponse.json({ projetos: unicos });
  } catch (e) {
    console.error("[GET /api/projetos]", e);
    return NextResponse.json({ error: "Erro ao buscar projetos." }, { status: 500 });
  }
}

// ── POST /api/projetos ─────────────────────────────────────────────────────────
// Cria um novo projeto com as 6 fases oficiais de campo e o prazo final fixo.
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const nome = String(body?.nome ?? "").trim();
    const prazoFinal = String(body?.prazoFinal ?? "").trim();
    const dataInicio = String(body?.dataInicio ?? new Date().toISOString().split("T")[0]).trim();

    if (!nome) {
      return NextResponse.json({ error: "O nome do projeto é obrigatório." }, { status: 400 });
    }
    if (!prazoFinal) {
      return NextResponse.json({ error: "O prazo final é obrigatório." }, { status: 400 });
    }

    const db = getSupabase();

    // 6 Fases oficiais de campo
    const fasesIniciais = [
      { gabarito: "Valetas",                    acao: "Abertura e nivelamento de valas" },
      { gabarito: "montagem campo",             acao: "Montagem de tubulações e gotejadores" },
      { gabarito: "casa de bombas",             acao: "Instalação de bombas, filtros e cabeçal" },
      { gabarito: "elétrica",                   acao: "Quadros elétricos, automação e cabeamento" },
      { gabarito: "lavagem do sistema e testes", acao: "Limpeza, pressão e estanqueidade" },
      { gabarito: "entrega técnica",            acao: "Checklist final, treinamento e entrega ao cliente" },
    ];

    const inserts = fasesIniciais.map((f) => ({
      gabarito: f.gabarito,
      acao: f.acao,
      responsavel: session.user?.name || "Equipe Técnica",
      prazo_limite: prazoFinal,
      status: "Dentro do programado",
      observacoes: `Início do projeto: ${dataInicio}`,
      projeto_cliente: nome,
      is_deleted: false,
    }));

    const { error: insertError } = await db.from("fases_acao").insert(inserts);
    if (insertError) {
      console.warn("[POST /api/projetos] Aviso ao inserir no Supabase fases_acao:", insertError.message);
    }

    return NextResponse.json({
      ok: true,
      projeto: nome,
      prazoFinal,
      dataInicio,
    });
  } catch (e) {
    console.error("[POST /api/projetos]", e);
    return NextResponse.json({ error: "Erro ao criar projeto." }, { status: 500 });
  }
}
