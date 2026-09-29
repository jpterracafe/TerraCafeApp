import { getSupabase } from "@/lib/supabase";
import { invalidateLojasCache } from "@/lib/lojas";
import { invalidateProjectAccessCache } from "@/lib/project-access";
import fs from "fs";
import path from "path";

const CONFIG_FILE = path.join(process.cwd(), ".etapas_config.json");

/**
 * Expurgo em lote completo e definitivo de múltiplos projetos do sistema.
 * 
 * Executa deleções agrupadas em lote único nas tabelas relacionais e metadados,
 * prevenindo race conditions e 'tuple concurrently updated' no Supabase.
 */
export async function purgeMultipleProjects(
  nomesProjetos: string[],
  options: { apagarFasesOrfas?: boolean } = {}
): Promise<{ success: boolean; purgedCount: number }> {
  const lista = Array.from(
    new Set(nomesProjetos.map((n) => (n || "").trim()).filter(Boolean))
  );

  const db = getSupabase();
  const purgedCount = lista.length;

  try {
    // 1. Apaga do banco relacional (fases, diário de campo e vínculos de projetos)
    if (lista.length > 0) {
      await Promise.allSettled([
        Promise.resolve(db.from("fases_acao").delete().in("projeto_cliente", lista)),
        Promise.resolve(db.from("diario_logs").delete().in("projeto_cliente", lista)),
        Promise.resolve(db.from("user_projetos").delete().in("projeto_nome", lista)),
      ]);
    }
    if (options.apagarFasesOrfas) {
      await Promise.allSettled([
        Promise.resolve(db.from("fases_acao").delete().eq("is_deleted", true)),
        Promise.resolve(db.from("diario_logs").delete().eq("is_deleted", true)),
      ]);
    }

    // 2. Limpa todas as chaves de metadados em configuracoes_sistema de uma só vez
    const chavesParaLimpar = [
      "diario_etapas_config_v1",
      "diario_responsaveis_por_etapa_v1",
      "diario_etapas_progresso_v1",
      "diario_etapas_status_v1",
      "diario_projeto_justificativas_v1",
      "diario_projetos_prazo_final_v1",
      "diario_projeto_starts_v1",
      "diario_projetos_criadores_v1",
      "diario_projetos_status_v1",
      "sistema_projetos_lojas_v1",
    ];

    if (lista.length > 0) {
      const { data: rows } = await db
        .from("configuracoes_sistema")
        .select("chave, valor")
        .in("chave", chavesParaLimpar);

      if (rows && rows.length > 0) {
        for (const row of rows) {
          if (!row.valor || typeof row.valor !== "object") continue;
          const map = { ...row.valor };
          let modified = false;

          for (const k of Object.keys(map)) {
            for (const nome of lista) {
              if (k === nome || k.startsWith(`${nome}::`)) {
                delete map[k];
                modified = true;
                break;
              }
            }
          }

          if (modified) {
            await db.from("configuracoes_sistema").upsert({
              chave: row.chave,
              valor: map,
              updated_at: new Date().toISOString(),
            });
          }
        }
      }
    }

    // 3. Limpa arquivo local em disco se existir (.etapas_config.json)
    if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME && lista.length > 0) {
      try {
        if (fs.existsSync(CONFIG_FILE)) {
          const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
          const cfg = JSON.parse(raw);
          let localModified = false;

          const campos: (keyof typeof cfg)[] = [
            "configEtapas",
            "projetoStartDates",
            "responsaveisPorEtapa",
            "projetosPrazoFinal",
            "projetoJustificativas",
            "etapasProgresso",
            "etapasStatus",
          ];

          for (const campo of campos) {
            if (cfg[campo] && typeof cfg[campo] === "object") {
              for (const k of Object.keys(cfg[campo])) {
                for (const nome of lista) {
                  if (k === nome || k.startsWith(`${nome}::`)) {
                    delete cfg[campo][k];
                    localModified = true;
                    break;
                  }
                }
              }
            }
          }

          if (localModified) {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf-8");
          }
        }
      } catch {
        // Silencia erro em arquivo local
      }
    }

    invalidateLojasCache();
    invalidateProjectAccessCache();
    return { success: true, purgedCount };
  } catch (err) {
    console.error(`[purgeMultipleProjects] Erro ao expurgar lote de projetos:`, err);
    return { success: false, purgedCount: 0 };
  }
}

/**
 * Expurgo completo e definitivo de um único projeto do sistema.
 * 
 * Garante que quando um projeto é excluído permanentemente da lixeira OU
 * recriado com o mesmo nome:
 * 1. Não ressuscita logs antigos do diário de campo (diario_logs).
 * 2. Não ressuscita status antigo (concluído/andamento).
 * 3. Não ressuscita progresso das etapas (0% limpo).
 * 4. Não ressuscita datas de início, prazos finais antigos ou justificativas.
 * 5. Não ressuscita responsáveis atribuídos antigamente àquelas etapas.
 * 6. Remove vínculos de loja e acessos de usuários.
 */
export async function purgeProjectData(nomeProjeto: string): Promise<void> {
  const nome = (nomeProjeto || "").trim();
  if (!nome) return;
  await purgeMultipleProjects([nome]);
}
