import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireSession } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import fs from "fs";
import path from "path";

const CONFIG_FILE = path.join(process.cwd(), ".etapas_config.json");

interface SystemConfig {
  configEtapas: Record<string, { dataInicio: string; metaDias: number; prazoLimite?: string; status?: string }>;
  projetoStartDates: Record<string, string>;
  responsaveisPorEtapa: Record<string, string[]>;
  projetosPrazoFinal: Record<string, string>;
  projetoJustificativas: Record<string, Array<{ id: string; data: string; autor: string; motivo: string; observacao: string }>>;
  etapasProgresso: Record<string, number>;
  etapasStatus: Record<string, string>;
}

function getLocalConfig(): SystemConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        configEtapas: parsed.configEtapas || {},
        projetoStartDates: parsed.projetoStartDates || {},
        responsaveisPorEtapa: parsed.responsaveisPorEtapa || {},
        projetosPrazoFinal: parsed.projetosPrazoFinal || {},
        projetoJustificativas: parsed.projetoJustificativas || {},
        etapasProgresso: parsed.etapasProgresso || {},
        etapasStatus: parsed.etapasStatus || {},
      };
    }
  } catch (e) {
    console.error("[etapas-config] Erro ao ler arquivo local:", e);
  }
  return {
    configEtapas: {},
    projetoStartDates: {},
    responsaveisPorEtapa: {},
    projetosPrazoFinal: {},
    projetoJustificativas: {},
    etapasProgresso: {},
    etapasStatus: {},
  };
}

function saveLocalConfig(cfg: SystemConfig) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf-8");
  } catch (e) {
    console.error("[etapas-config] Erro ao salvar arquivo local:", e);
  }
}

// ── GET /api/etapas-config ───────────────────────────────────────────────────
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    let config = getLocalConfig();

    // Tenta ler do Supabase se a tabela existir
    try {
      const db = getSupabase();
      const { data, error } = await db
        .from("configuracoes_sistema")
        .select("chave, valor");

      if (!error && data && data.length > 0) {
        data.forEach((row: { chave: string; valor: any }) => {
          if (row.chave === "diario_etapas_config_v1" && row.valor) {
            config.configEtapas = { ...config.configEtapas, ...row.valor };
          }
          if (row.chave === "diario_projeto_starts_v1" && row.valor) {
            config.projetoStartDates = { ...config.projetoStartDates, ...row.valor };
          }
          if (row.chave === "diario_responsaveis_por_etapa_v1" && row.valor) {
            config.responsaveisPorEtapa = { ...config.responsaveisPorEtapa, ...row.valor };
          }
          if (row.chave === "diario_projetos_prazo_final_v1" && row.valor) {
            config.projetosPrazoFinal = { ...config.projetosPrazoFinal, ...row.valor };
          }
          if (row.chave === "diario_projeto_justificativas_v1" && row.valor) {
            config.projetoJustificativas = { ...config.projetoJustificativas, ...row.valor };
          }
          if (row.chave === "diario_etapas_progresso_v1" && row.valor) {
            config.etapasProgresso = { ...config.etapasProgresso, ...row.valor };
          }
          if (row.chave === "diario_etapas_status_v1" && row.valor) {
            config.etapasStatus = { ...config.etapasStatus, ...row.valor };
          }
        });
      }
    } catch (dbErr) {
      // Falha silenciosa de tabela não existente — usa arquivo local
    }

    return NextResponse.json(config);
  } catch (e) {
    console.error("[GET /api/etapas-config]", e);
    return NextResponse.json({ error: "Erro ao buscar configurações." }, { status: 500 });
  }
}

// ── POST /api/etapas-config ──────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const err = requireSession(session);
    if (err) return err;

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
    }

    const currentConfig = getLocalConfig();
    const dbUpdates: Array<{ chave: string; valor: any }> = [];

    // Formato 1: { tipo, dados }
    if (body.tipo && body.dados) {
      const { tipo, dados } = body;
      if (tipo === "etapas") {
        currentConfig.configEtapas = { ...currentConfig.configEtapas, ...dados };
        dbUpdates.push({ chave: "diario_etapas_config_v1", valor: currentConfig.configEtapas });
      } else if (tipo === "starts") {
        currentConfig.projetoStartDates = { ...currentConfig.projetoStartDates, ...dados };
        dbUpdates.push({ chave: "diario_projeto_starts_v1", valor: currentConfig.projetoStartDates });
      } else if (tipo === "responsaveis") {
        currentConfig.responsaveisPorEtapa = { ...currentConfig.responsaveisPorEtapa, ...dados };
        dbUpdates.push({ chave: "diario_responsaveis_por_etapa_v1", valor: currentConfig.responsaveisPorEtapa });
      } else if (tipo === "prazos_finais") {
        currentConfig.projetosPrazoFinal = { ...currentConfig.projetosPrazoFinal, ...dados };
        dbUpdates.push({ chave: "diario_projetos_prazo_final_v1", valor: currentConfig.projetosPrazoFinal });
      } else if (tipo === "justificativas") {
        const proj = dados.projeto;
        const just = dados.justificativa;
        if (proj && just) {
          const lista = currentConfig.projetoJustificativas[proj] || [];
          currentConfig.projetoJustificativas[proj] = [just, ...lista];
        } else {
          currentConfig.projetoJustificativas = { ...currentConfig.projetoJustificativas, ...dados };
        }
        dbUpdates.push({ chave: "diario_projeto_justificativas_v1", valor: currentConfig.projetoJustificativas });
      } else if (tipo === "progresso") {
        currentConfig.etapasProgresso = { ...currentConfig.etapasProgresso, ...dados };
        dbUpdates.push({ chave: "diario_etapas_progresso_v1", valor: currentConfig.etapasProgresso });
      } else if (tipo === "status_etapas") {
        currentConfig.etapasStatus = { ...currentConfig.etapasStatus, ...dados };
        dbUpdates.push({ chave: "diario_etapas_status_v1", valor: currentConfig.etapasStatus });
      } else {
        return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
      }
    } else {
      // Formato 2: Objeto parcial direto { configEtapas, projetoStartDates, ... }
      if (body.configEtapas) {
        currentConfig.configEtapas = { ...currentConfig.configEtapas, ...body.configEtapas };
        dbUpdates.push({ chave: "diario_etapas_config_v1", valor: currentConfig.configEtapas });
      }
      if (body.projetoStartDates) {
        currentConfig.projetoStartDates = { ...currentConfig.projetoStartDates, ...body.projetoStartDates };
        dbUpdates.push({ chave: "diario_projeto_starts_v1", valor: currentConfig.projetoStartDates });
      }
      if (body.responsaveisPorEtapa) {
        currentConfig.responsaveisPorEtapa = { ...currentConfig.responsaveisPorEtapa, ...body.responsaveisPorEtapa };
        dbUpdates.push({ chave: "diario_responsaveis_por_etapa_v1", valor: currentConfig.responsaveisPorEtapa });
      }
      if (body.projetosPrazoFinal) {
        currentConfig.projetosPrazoFinal = { ...currentConfig.projetosPrazoFinal, ...body.projetosPrazoFinal };
        dbUpdates.push({ chave: "diario_projetos_prazo_final_v1", valor: currentConfig.projetosPrazoFinal });
      }
      if (body.projetoJustificativas) {
        currentConfig.projetoJustificativas = { ...currentConfig.projetoJustificativas, ...body.projetoJustificativas };
        dbUpdates.push({ chave: "diario_projeto_justificativas_v1", valor: currentConfig.projetoJustificativas });
      }
      if (body.etapasProgresso) {
        currentConfig.etapasProgresso = { ...currentConfig.etapasProgresso, ...body.etapasProgresso };
        dbUpdates.push({ chave: "diario_etapas_progresso_v1", valor: currentConfig.etapasProgresso });
      }
      if (body.etapasStatus) {
        currentConfig.etapasStatus = { ...currentConfig.etapasStatus, ...body.etapasStatus };
        dbUpdates.push({ chave: "diario_etapas_status_v1", valor: currentConfig.etapasStatus });
      }

      if (dbUpdates.length === 0) {
        return NextResponse.json({ error: "Nenhum campo de configuração válido informado." }, { status: 400 });
      }
    }

    saveLocalConfig(currentConfig);

    // Salva no Supabase se houver tabela configuracoes_sistema
    if (dbUpdates.length > 0) {
      try {
        const db = getSupabase();
        for (const item of dbUpdates) {
          await db.from("configuracoes_sistema").upsert({
            chave: item.chave,
            valor: item.valor,
            updated_at: new Date().toISOString(),
          });
        }
      } catch (dbErr) {
        // Tabela ainda não criada no banco — segue com arquivo local
      }
    }

    return NextResponse.json({ ok: true, config: currentConfig });
  } catch (e) {
    console.error("[POST /api/etapas-config]", e);
    return NextResponse.json({ error: "Erro ao salvar configurações." }, { status: 500 });
  }
}
