import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { parseResponsavelEmails, normalizeName } from "@/lib/responsaveis";

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

interface CriadoresRow {
  valor: Record<string, CriadorInfo>;
}

interface UserProjetosRow {
  projeto_nome: string;
  user_email: string | null;
}

type FaseMap = Map<string, FaseRow[]>;

export interface LogRow {
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
  
  // Verifica acesso para projetos com OU sem criador definido
  // 1. Diretor/Admin veem todos
  if (isDiretorOuAdmin) return true;
  
  // 2. Tem permissão explícita via user_projetos (inclui projetos legacy)
  if (allowedProjects.has(projectName)) return true;
  
  // 3. Se o projeto tem criador cadastrado: verifica se é o criador ou responsável
  if (criadorEmail) {
    // É o criador do projeto
    if (criadorEmail === sessionEmail) return true;
    
    // É responsável direto por alguma fase do projeto (por email ou nome)
    if (fasesPorProjeto) {
      const fasesDoProj = fasesPorProjeto.get(projectName) || [];
      const ehResponsavel = fasesDoProj.some(f => {
        const r = (f.responsavel || "").trim();
        const responsaveis = parseResponsavelEmails(r);
        
        // Check by email
        const temEmail = responsaveis.some(email => email === sessionEmail.toLowerCase());
  
        // Check by name (compatibilidade com formato antigo de nomes puros)
        const nomeLc = normalizeName(sessionName);
        const temNome = nomeLc &&
          responsaveis.some(nome => normalizeName(nome) === nomeLc);
  
        return temEmail || temNome;
      });
      if (ehResponsavel) return true;
    }
    
    // Pertence a outro usuário -> oculta (não tem criador nem permissão explícita)
    return false;
  }
  
  // Projeto legado (sem criador definido): verifica permissão explícita ou responsável
  // Antes era sempre 'return true', agora também verifica fases e permissões
  if (fasesPorProjeto) {
    const fasesDoProj = fasesPorProjeto.get(projectName) || [];
    const ehResponsavel = fasesDoProj.some(f => {
      const r = (f.responsavel || "").trim();
      const responsaveis = parseResponsavelEmails(r);
      
      // Check by email
      const temEmail = responsaveis.some(email => email === sessionEmail.toLowerCase());
  
      // Check by name (compatibilidade com formato antigo de nomes puros)
      const nomeLc = normalizeName(sessionName);
      const temNome = nomeLc &&
        responsaveis.some(nome => normalizeName(nome) === nomeLc);
  
      return temEmail || temNome;
    });
    if (ehResponsavel) return true;
  }
  
  // Sem acesso direto — projeto legacy fica visível apenas se tem permissão user_projetos (já checado acima)
  return false;
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