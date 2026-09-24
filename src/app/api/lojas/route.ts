import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getLojas, getProjectLojasMap, setProjectLoja } from "@/lib/lojas";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const lojas = await getLojas();
    const projetosLojas = await getProjectLojasMap();

    return NextResponse.json({
      lojas: lojas.filter((l) => l.ativo !== false),
      projetosLojas,
    });
  } catch (error) {
    console.error("[GET /api/lojas]", error);
    return NextResponse.json({ error: "Erro ao carregar lojas." }, { status: 500 });
  }
}

// POST /api/lojas/atribuir-projeto
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { projetoNome, lojaNome } = body;

    if (!projetoNome) {
      return NextResponse.json({ error: "Nome do projeto é obrigatório." }, { status: 400 });
    }

    const ok = await setProjectLoja(projetoNome, lojaNome || "");
    if (!ok) {
      return NextResponse.json({ error: "Erro ao vincular projeto à loja." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, projetoNome, lojaNome });
  } catch (error) {
    console.error("[POST /api/lojas]", error);
    return NextResponse.json({ error: "Erro ao processar vínculo." }, { status: 500 });
  }
}
