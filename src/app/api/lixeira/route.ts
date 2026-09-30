import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSupabase } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";
import { requireSession } from "@/lib/api";
import { purgeMultipleProjects } from "@/lib/project-purge";
import { matchLojaNames } from "@/lib/lojas";

/**
 * DELETE /api/lixeira
 * Esvazia projetos e fases da lixeira de forma atômica e performática em lote no servidor.
 * 
 * Body aceito:
 * {
 *   projetos?: string[], // Lista específica de nomes de projetos para expurgar permanentemente
 *   todos?: boolean,     // Se true, expurga todos os projetos na lixeira permitidos ao usuário
 *   loja?: string        // Opcional: filtra expurgo para uma loja/filial específica
 * }
 */
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const sessionRole = (session?.user as any)?.role || "Colaborador";
    const sessionLoja = ((session?.user as any)?.loja || "").trim().toLowerCase();
    const isDiretorOuAdmin = ["Diretor", "Coordenador", "Desenvolvedor", "Admin"].includes(sessionRole);
    const isGerente = sessionRole === "Gerente";

    let body: any = null;
    try {
      body = await req.json();
    } catch (_) {
      // Body pode não existir se vier via query string
    }

    const { searchParams } = new URL(req.url);
    const lojaFiltro = (body?.loja || searchParams.get("loja") || "").trim();
    const isTodasLojas =
      !lojaFiltro ||
      lojaFiltro.toLowerCase() === "all" ||
      lojaFiltro.toLowerCase() === "todas" ||
      lojaFiltro.toLowerCase() === "todas as lojas";

    const todos = body?.todos === true || searchParams.get("todos") === "true" || isTodasLojas;
    let projetosRecebidos: string[] = Array.isArray(body?.projetos) ? body.projetos : [];

    const db = getSupabase();

    // Se "todos=true", "isTodasLojas" ou se a lista de projetos não foi explicitamente fornecida,
    // busca do banco todos os projetos com fases na lixeira
    if (todos || isTodasLojas || projetosRecebidos.length === 0) {
      const { data: fasesDeletadas, error: fasesErr } = await db
        .from("fases_acao")
        .select("projeto_cliente")
        .eq("is_deleted", true);

      if (fasesErr) throw fasesErr;

      const nomesUnicos = Array.from(
        new Set(
          (fasesDeletadas || [])
            .map((f) => (f.projeto_cliente || "").trim())
            .filter(Boolean)
        )
      );

      projetosRecebidos = Array.from(new Set([...projetosRecebidos, ...nomesUnicos]));
    }

    // Carrega mapa de projetos-lojas para filtrar permissões caso uma filial ESPECÍFICA esteja selecionada
    let mapProjetosLojas: Record<string, string> = {};
    if (!isTodasLojas || (isGerente && !isDiretorOuAdmin)) {
      try {
        const { data: plRow } = await db
          .from("configuracoes_sistema")
          .select("valor")
          .eq("chave", "sistema_projetos_lojas_v1")
          .maybeSingle();

        if (plRow?.valor && typeof plRow.valor === "object") {
          mapProjetosLojas = plRow.valor as Record<string, string>;
        }
      } catch (_) {
        // noop
      }
    }

    // Filtra projetos conforme permissão e filtro de loja
    const projetosParaApagar = projetosRecebidos.filter((nome) => {
      const lojaDoProj = mapProjetosLojas[nome] || mapProjetosLojas[nome.trim()] || "";

      // Filtro de loja explícito na requisição (só filtra se NÃO for TODAS)
      if (!isTodasLojas) {
        if (!matchLojaNames(lojaDoProj, lojaFiltro) && !matchLojaNames(nome, lojaFiltro)) {
          return false;
        }
      }

      // Restrição de Gerente (apenas obras da sua filial)
      if (isGerente && sessionLoja && !isDiretorOuAdmin) {
        if (!matchLojaNames(lojaDoProj, sessionLoja) && !matchLojaNames(nome, sessionLoja)) {
          return false;
        }
      }

      return true;
    });

    const podeExpurgarOrfas = isDiretorOuAdmin || isTodasLojas;

    const result = await purgeMultipleProjects(projetosParaApagar, {
      apagarFasesOrfas: podeExpurgarOrfas,
    });

    return NextResponse.json({
      ok: true,
      purgedCount: result.purgedCount,
      projetos: projetosParaApagar,
    });
  } catch (e) {
    console.error("[DELETE /api/lixeira]", e);
    return NextResponse.json(
      { error: "Erro ao esvaziar lixeira." },
      { status: 500 }
    );
  }
}
