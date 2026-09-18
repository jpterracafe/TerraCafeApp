import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export interface SessionUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  role?: string;
}

export interface CriadorInfo {
  email: string;
  nome?: string;
  id?: string;
  criadoEm?: string;
}

export interface ProjectAccessResult {
  allowedProjects: Set<string>;
  mapCriadores: Record<string, CriadorInfo>;
  isDiretorOuAdmin: boolean;
  sessionEmail: string;
  sessionName: string;
  sessionRole: string;
}

interface FaseRow {
  projeto_cliente: string;
  responsavel: string | null;
}

function parseResponsavelEmails(responsavel?: string): { email: string; nome: string }[] {
  if (!responsavel) return [];
  
  // Formato esperado: "email|nome,email|nome" ou apenas "nome" (compatibilidade)
  const pairs = responsavel.split(',').map(part => part.trim()).filter(Boolean);
  
  const result: { email: string; nome: string }[] = [];
  
  for (const pair of pairs) {
    // Tenta parser como "email|nome"
    const pipeIndex = pair.indexOf('|');
    if (pipeIndex > 0 && pipeIndex < pair.length - 1) {
      const email = pair.substring(0, pipeIndex).trim().toLowerCase();
      const nome = pair.substring(pipeIndex + 1).trim();
      if (email.includes('@')) {
        result.push({ email, nome });
        continue;
      }
    }
    // Fallback: trata como nome antigo
    const nome = pair.trim();
    if (nome) {
      result.push({ email: "", nome });
    }
  }
  
  return result;
}

interface CriadoresRow {
  valor: Record<string, CriadorInfo>;
}

interface UserProjetosRow {
  projeto_nome: string;
  user_email: string | null;
}

type FaseMap = Map<string, FaseRow[]>;

interface LogRow {
  projeto_cliente?: string;
  projetoCliente?: string;
  [key: string]: unknown;
}

/**
 * Verifica quais projetos o usuário tem acesso baseado no role e criadores.
 * Retorna um Set com os nomes dos projetos permitidos e o mapa de criadores.
 */
export async function getUserProjectAccess(): Promise<ProjectAccessResult> {
  const session = await getServerSession(authOptions);
  
  const sessionEmail = session?.user?.email?.trim().toLowerCase() ?? "";
  const sessionName = session?.user?.name?.trim() ?? "";
  const sessionRole = (session?.user as { role?: string } | undefined)?.role || "Colaborador";

  const isDiretorOuAdmin = ["Diretor", "Desenvolvedor", "Admin"].includes(sessionRole);

  const db = getSupabase();

  // Carrega mapa de criadores de configuracoes_sistema
  let mapCriadores: Record<string, CriadorInfo> = {};
  try {
    const { data: criadoresRow } = await db
      .from("configuracoes_sistema")
      .select("valor")
      .eq("chave", "diario_projetos_criadores_v1")
      .maybeSingle();
    if (criadoresRow?.valor) {
      mapCriadores = { ...(criadoresRow as CriadoresRow).valor };
    }
  } catch {
    // silent
  }

  // Complementa com user_projetos se a tabela existir
  const userProjetosPermitidos = new Set<string>();
  try {
    const { data: upRows } = await db.from("user_projetos").select("projeto_nome, user_email");
    if (upRows) {
      for (const up of upRows as UserProjetosRow[]) {
        const pNome = up.projeto_nome;
        const uEmail = up.user_email?.trim().toLowerCase();
        if (pNome && uEmail) {
          if (!mapCriadores[pNome]) {
            mapCriadores[pNome] = { email: uEmail };
          }
          if (uEmail === sessionEmail) {
            userProjetosPermitidos.add(pNome);
          }
        }
      }
    }
  } catch {
    // silent
  }

  return {
    allowedProjects: userProjetosPermitidos,
    mapCriadores,
    isDiretorOuAdmin,
    sessionEmail,
    sessionName,
    sessionRole,
  };
}

/**
 * Verifica se o usuário tem acesso a um projeto específico.
 */
export function hasProjectAccess(
  projectName: string,
  access: ProjectAccessResult,
  fasesPorProjeto?: FaseMap
): boolean {
  const { isDiretorOuAdmin, mapCriadores, sessionEmail, sessionName, allowedProjects } = access;

  // Diretor, Admin e Desenvolvedor veem todos os projetos
  if (isDiretorOuAdmin) {
    return true;
  }

  const criador = mapCriadores[projectName];
  const criadorEmail = criador?.email?.trim().toLowerCase();
  
  // Se o projeto tem criador cadastrado:
  if (criadorEmail) {
    // É o criador do projeto
    if (criadorEmail === sessionEmail) return true;
    
    // Tem permissão explícita via user_projetos
    if (allowedProjects.has(projectName)) return true;
    
    // É responsável direto por alguma fase do projeto (por email ou nome)
    if (fasesPorProjeto) {
      const fasesDoProj = fasesPorProjeto.get(projectName) || [];
      const ehResponsavel = fasesDoProj.some(f => {
        const r = (f.responsavel || "").trim();
        const responsaveis = parseResponsavelEmails(r);
        
        // Check by email
        const temEmail = responsaveis.some(email => email === sessionEmail.toLowerCase());
        
        // Check by name (compatibilidade com formato antigo)
        const temNome = r.toLowerCase() === sessionName.toLowerCase() || 
                        r.toLowerCase().includes(sessionName.toLowerCase());
        
        return temEmail || temNome;
      });
      if (ehResponsavel) return true;
    }
    
    // Pertence a outro usuário -> oculta
    return false;
  }
  
  // Projeto legado (sem criador definido): acessível
  return true;
}

/**
 * Filtra um array de projetos baseado no acesso do usuário.
 */
export function filterProjectsByAccess(
  projects: string[],
  access: ProjectAccessResult,
  fasesPorProjeto?: FaseMap
): string[] {
  return projects.filter(p => hasProjectAccess(p, access, fasesPorProjeto));
}

/**
 * Filtra um objeto de configuração (etapas, prazos, etc.) mantendo apenas projetos permitidos.
 */
export function filterConfigByAccess<T extends Record<string, unknown>>(
  config: T,
  access: ProjectAccessResult,
  fasesPorProjeto?: FaseMap
): T {
  const filtered: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(config)) {
    // Extrai o nome do projeto da chave (formato: "Projeto::etapa" ou apenas "Projeto")
    // Usa split com limite 2 para pegar apenas a primeira ocorrência de ::
    const projectName = key.includes("::") ? key.split("::", 2)[0] : key;
    
    if (hasProjectAccess(projectName, access, fasesPorProjeto)) {
      filtered[key] = value;
    }
  }
  
  return filtered as T;
}

/**
 * Filtra logs do diário mantendo apenas os de projetos permitidos.
 */
export function filterLogsByAccess(
  logs: LogRow[],
  access: ProjectAccessResult,
  fasesPorProjeto?: FaseMap
): LogRow[] {
  return logs.filter(log => {
    const projectName = log.projeto_cliente || log.projetoCliente || "";
    return hasProjectAccess(projectName, access, fasesPorProjeto);
  });
}