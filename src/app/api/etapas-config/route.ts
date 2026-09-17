import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireSession } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import { canSeeAllProjects, isFarmerRole, isAdminRole, isDirectorRole } from "@/lib/roles";
import fs from "fs";
import path from "path";

const CONFIG_FILE = path.join(process.cwd(), ".etapas_config.json");

interface SystemConfig {
  configEtapas: Record<string, { dataInicio: string; metaDias: number; prazoLimite?: string; status?: string; hasStarted?: boolean }>;
  projetoStartDates: Record<string, string>;
  responsaveisPorEtapa: Record<string, string[]>;
  projetosPrazoFinal: Record<string, string>;
  projetoJustificativas: Record<string, Array<{ id: string; data: string; autor: string; motivo: string; observacao: string }>>;
  etapasProgresso: Record<string, number>;
  etapasStatus: Record<string, string>;
}

// 🔒 SANITIZAÇÃO OBRIGATÓRIA NO SERVIDOR:
// Nenhuma fase é considerada iniciada a menos que hasStarted === true.
// Datas são removidas de fases não iniciadas para evitar dados inconsistentes no cliente.
function sanitizeConfigEtapasServer(
  raw: Record<string, any>
): Record<string, { dataInicio: string; metaDias: number; prazoLimite?: string; hasStarted: boolean }> {
  if (!raw || typeof raw !== "object") return {};
  const out: any = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!val || typeof val !== "object") continue;
    const metaDias = typeof (val as any).metaDias === "number" ? (val as any).metaDias : 20;
    if ((val as any).hasStarted === true) {
      out[key] = {
        dataInicio: (val as any).dataInicio || "",
        metaDias,
        prazoLimite: (val as any).prazoLimite || "",
        hasStarted: true,
      };
    } else {
      out[key] = {
        dataInicio: "",
        metaDias,
        prazoLimite: "",
        hasStarted: false,
      };
    }
  }
  return out;
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

    const user = session!.user;
    const db = getSupabase();
    const userRole = user?.role || "Colaborador";

    // Busca projetos do usuário se for agricultor
    let userProjects: string[] = [];
    if (isFarmerRole(userRole)) {
      const { data: userProjs } = await db
        .from("user_projetos")
        .select("projeto_id, projetos_irrigacao(nome)")
        .eq("user_id", user.id);
      
      userProjects = (userProjs ?? [])
        .map((up: any) => up.projetos_irrigacao?.nome)
        .filter(Boolean);
    }

    let config = getLocalConfig();

    // Tenta ler do Supabase se a tabela existir
    try {
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

    // Filtrar configurações por projetos do usuário se for agricultor
    if (!canSeeAllProjects(userRole) && userProjects.length > 0) {
      const filterByProjects = (obj: Record<string, any>) => {
        const filtered: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
          // Extrai o nome do projeto da chave (formato: "Projeto::Fase")
          const projectName = key.split("::")[0];
          if (userProjects.includes(projectName)) {
            filtered[key] = value;
          }
        }
        return filtered;
      };

      config.configEtapas = filterByProjects(config.configEtapas);
      config.projetoStartDates = filterByProjects(config.projetoStartDates);
      config.responsaveisPorEtapa = filterByProjects(config.responsaveisPorEtapa);
      config.projetosPrazoFinal = filterByProjects(config.projetosPrazoFinal);
      config.projetoJustificativas = filterByProjects(config.projetoJustificativas);
      config.etapasProgresso = filterByProjects(config.etapasProgresso);
      config.etapasStatus = filterByProjects(config.etapasStatus);
    } else if (!canSeeAllProjects(userRole) && userProjects.length === 0) {
      // Agricultor sem projetos - retorna config vazia
      config.configEtapas = {};
      config.projetoStartDates = {};
      config.responsaveisPorEtapa = {};
      config.projetosPrazoFinal = {};
      config.projetoJustificativas = {};
      config.etapasProgresso = {};
      config.etapasStatus = {};
    }

    // 🔒 SANITIZAÇÃO FINAL OBRIGATÓRIA antes de responder ao cliente
    config.configEtapas = sanitizeConfigEtapasServer(config.configEtapas);

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

    const user = session!.user;
    // 🔒 Só admin e diretor podem modificar configurações do sistema
    const userRole = user?.role || "Colaborador";
    if (!isAdminRole(userRole) && !isDirectorRole(userRole)) {
      return NextResponse.json({ error: "Não autorizado. Apenas administradores e diretores podem modificar configurações." }, { status: 403 });
    }

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

      if (dbUpdates.length === 0 && !body.configEtapas) {
        return NextResponse.json({ error: "Nenhum campo de configuração válido informado." }, { status: 400 });
      }
    }

    // 🔒 SANITIZAÇÃO OBRIGATÓRIA ANTES DE PERSISTIR:
    // - Garante que configEtapas esteja sempre limpa antes de gravar no arquivo ou banco
    // - Fases não iniciadas: sem datas, hasStarted=false
    currentConfig.configEtapas = sanitizeConfigEtapasServer(currentConfig.configEtapas);
    // Regenera a entrada de dbUpdates para etapas com a versão sanitizada (apenas se foi tocada)
    const tocouEtapas = (body.tipo === "etapas") || !!body.configEtapas;
    if (tocouEtapas) {
      // Remove entrada antiga de etapas se existir e adiciona a versão limpa
      const filtered = dbUpdates.filter(u => u.chave !== "diario_etapas_config_v1");
      filtered.push({ chave: "diario_etapas_config_v1", valor: currentConfig.configEtapas });
      dbUpdates.length = 0;
      dbUpdates.push(...filtered);
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
