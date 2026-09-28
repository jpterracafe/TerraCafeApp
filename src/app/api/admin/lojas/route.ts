import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdminSession } from "@/lib/auth";
import { getLojas, saveLojas, Loja, renameLojaReferences, cleanupLojaReferences } from "@/lib/lojas";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401, headers: NO_CACHE_HEADERS });
    }

    const lojas = await getLojas();
    return NextResponse.json({ lojas }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("[GET /api/admin/lojas]", error);
    return NextResponse.json({ error: "Erro ao carregar lojas." }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminSession(session as any)) {
      return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const nome = String(body?.nome ?? "").trim();

    if (!nome) {
      return NextResponse.json({ error: "O nome da loja é obrigatório." }, { status: 400 });
    }

    const lojas = await getLojas();
    const jaExiste = lojas.some((l) => l.nome.trim().toLowerCase() === nome.toLowerCase());
    if (jaExiste) {
      return NextResponse.json({ error: "Já existe uma loja cadastrada com este nome." }, { status: 409 });
    }

    const novaLoja: Loja = {
      id: randomUUID(),
      nome,
      ativo: true,
      createdAt: new Date().toISOString(),
    };

    const atualizadas = [...lojas, novaLoja];
    const sucesso = await saveLojas(atualizadas);

    if (!sucesso) {
      return NextResponse.json({ error: "Erro ao salvar a nova loja." }, { status: 500, headers: NO_CACHE_HEADERS });
    }

    return NextResponse.json({ ok: true, loja: novaLoja }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("[POST /api/admin/lojas]", error);
    return NextResponse.json({ error: "Erro ao processar criação de loja." }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminSession(session as any)) {
      return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403, headers: NO_CACHE_HEADERS });
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id ?? "").trim();
    const novoNome = body?.nome ? String(body.nome).trim() : undefined;
    const ativo = typeof body?.ativo === "boolean" ? body.ativo : undefined;

    if (!id) {
      return NextResponse.json({ error: "ID da loja é obrigatório." }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    const lojas = await getLojas();
    const index = lojas.findIndex((l) => l.id === id);
    if (index === -1) {
      return NextResponse.json({ error: "Loja não encontrada." }, { status: 404, headers: NO_CACHE_HEADERS });
    }

    const oldNome = lojas[index].nome;
    let nomeAlterado = false;

    // Se estiver mudando o nome, checa duplicidade
    if (novoNome && novoNome.toLowerCase() !== oldNome.toLowerCase()) {
      const duplicada = lojas.some((l) => l.id !== id && l.nome.toLowerCase() === novoNome.toLowerCase());
      if (duplicada) {
        return NextResponse.json({ error: "Já existe outra loja com este nome." }, { status: 409, headers: NO_CACHE_HEADERS });
      }
      lojas[index].nome = novoNome;
      nomeAlterado = true;
    }

    if (ativo !== undefined) {
      lojas[index].ativo = ativo;
    }

    const sucesso = await saveLojas(lojas);
    if (!sucesso) {
      return NextResponse.json({ error: "Erro ao atualizar a loja." }, { status: 500, headers: NO_CACHE_HEADERS });
    }

    // Se o nome foi alterado, renomeia referências em projetos e usuários
    if (nomeAlterado && novoNome) {
      await renameLojaReferences(oldNome, novoNome);
    }

    return NextResponse.json({ ok: true, loja: lojas[index] }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("[PATCH /api/admin/lojas]", error);
    return NextResponse.json({ error: "Erro ao atualizar loja." }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminSession(session as any)) {
      return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403, headers: NO_CACHE_HEADERS });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID da loja é obrigatório." }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    const lojas = await getLojas();
    const cleanId = id.trim();
    const cleanIdLc = cleanId.toLowerCase();

    // Encontra a loja a ser excluída por ID ou por Nome
    const lojaExcluida = lojas.find(
      (l) => l.id.toLowerCase() === cleanIdLc || l.nome.trim().toLowerCase() === cleanIdLc
    );

    const filtradas = lojas.filter(
      (l) => l.id.toLowerCase() !== cleanIdLc && l.nome.trim().toLowerCase() !== cleanIdLc
    );

    if (filtradas.length === lojas.length) {
      return NextResponse.json({ error: "Loja não encontrada." }, { status: 404, headers: NO_CACHE_HEADERS });
    }

    const sucesso = await saveLojas(filtradas);
    if (!sucesso) {
      return NextResponse.json({ error: "Erro ao excluir loja." }, { status: 500, headers: NO_CACHE_HEADERS });
    }

    // Limpa referências da loja excluída em usuários e projetos e na tabela lojas
    if (lojaExcluida) {
      await cleanupLojaReferences(lojaExcluida.nome, lojaExcluida.id);
    } else {
      await cleanupLojaReferences(cleanId, cleanId);
    }

    return NextResponse.json({ ok: true }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("[DELETE /api/admin/lojas]", error);
    return NextResponse.json({ error: "Erro ao excluir loja." }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
