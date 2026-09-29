import { getSupabase } from "@/lib/supabase";
import { setProjectLoja } from "@/lib/lojas";
import fs from "fs";
import path from "path";

const CONFIG_FILE = path.join(process.cwd(), ".etapas_config.json");

/**
 * Expurgo completo e definitivo de um projeto do sistema.
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

  const db = getSupabase();

  try {
    // 1. Apaga do banco relacional (fases e histórico de diário de campo)
    await Promise.allSettled([
      db.from("fases_acao").delete().eq("projeto_cliente", nome),
      db.from("diario_logs").delete().eq("projeto_cliente", nome),
      db.from("user_projetos").delete().eq("projeto_nome", nome),
    ]);

    // 2. Remove da tabela de vinculação de lojas
    try {
      await setProjectLoja(nome, "");
    } catch {
      // noop
    }

    // 3. Limpa todas as chaves de metadados em configuracoes_sistema
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
    ];

    const { data: rows } = await db
      .from("configuracoes_sistema")
      .select("chave, valor")
      .in("chave", chavesParaLimpar);

    if (rows && rows.length > 0) {
      for (const row of rows) {
        if (!row.valor || typeof row.valor !== "object") continue;
        const map = { ...row.valor };
        let modified = false;

        // Limpa tanto chaves diretas (ex: map[nome]) quanto compostas (ex: map["nome::Valetas"])
        for (const k of Object.keys(map)) {
          if (k === nome || k.startsWith(`${nome}::`)) {
            delete map[k];
            modified = true;
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

    // 4. Limpa arquivo local em disco (.etapas_config.json) se existir (ambiente dev/self-hosted)
    if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
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
                if (k === nome || k.startsWith(`${nome}::`)) {
                  delete cfg[campo][k];
                  localModified = true;
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
  } catch (err) {
    console.error(`[purgeProjectData] Erro ao expurgar dados do projeto "${nome}":`, err);
  }
}
