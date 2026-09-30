import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { parseResponsavelEmails, normalizeName } from "@/lib/responsaveis";
import { matchLojaNames } from "@/lib/lojas";

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
  sessionLoja?: string;
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

interface ServerAccessCacheEntry {
  data: ProjectAccessResult;
  expiresAt: number;
}
const serverAccessCache = new Map<string, ServerAccessCacheEntry>();
const ACCESS_CACHE_TTL_MS = 10 * 1000; // 10 segundos

export function invalidateProjectAccessCache(email?: string) {
  if (email) {
    serverAccessCache.delete(email.toLowerCase().trim());
  } else {
    serverAccessCache.clear();
  }
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
  const sessionLoja = ((session?.user as any)?.loja || "").trim();

  // Cache em memória de servidor (responde em 0ms para requisições paralelas do mesmo usuário)
  const cached = serverAccessCache.get(sessionEmail);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  // Coordenador possui a mesma visão executiva do Diretor
  const isDiretorOuAdmin = ["Diretor", "Coordenador", "Desenvolvedor", "Admin"].includes(sessionRole);
  const isGerente = sessionRole === "Gerente";

  const db = getSupabase();

  let mapCriadores: Record<string, CriadorInfo> = {};
  const userProjetosPermitidos = new Set<string>();

  try {
    // 👑 Diretor/Admin: precisa apenas do mapa de criadores (acesso universal sem precisar de user_projetos)
    if (isDiretorOuAdmin) {
      const criadoresRes = await db
        .from("configuracoes_sistema")
        .select("valor")
        .eq("chave", "diario_projetos_criadores_v1")
        .maybeSingle();

      if (criadoresRes?.data?.valor) {
        mapCriadores = { ...(criadoresRes.data as CriadoresRow).valor };
      }
    } else {
      // 👷 Colaborador / Gerente: busca criadores, user_projetos e filiais em paralelo
      const [criadoresRes, upRes, projLojasRes] = await Promise.all([
        Promise.resolve(
          db
            .from("configuracoes_sistema")
            .select("valor")
            .eq("chave", "diario_projetos_criadores_v1")
            .maybeSingle()
        ).catch(() => ({ data: null })),
        Promise.resolve(
          db
            .from("user_projetos")
            .select("projeto_nome, user_email")
        ).catch(() => ({ data: null })),
        sessionLoja
          ? Promise.resolve(
              db
                .from("configuracoes_sistema")
                .select("valor")
                .eq("chave", "sistema_projetos_lojas_v1")
                .maybeSingle()
            ).catch(() => ({ data: null }))
          : Promise.resolve({ data: null }),
      ]);

      if (criadoresRes?.data?.valor) {
        mapCriadores = { ...(criadoresRes.data as CriadoresRow).valor };
      }

      const upRows = upRes?.data;
      if (upRows && Array.isArray(upRows)) {
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

      // 🏢 Regra de Loja: acesso a todas as obras da sua cidade/filial
      if (sessionLoja) {
        if (projLojasRes?.data?.valor && typeof projLojasRes.data.valor === "object") {
          const mapLojas = projLojasRes.data.valor as Record<string, string>;
          for (const [projNome, lojaNome] of Object.entries(mapLojas)) {
            if (lojaNome && matchLojaNames(lojaNome, sessionLoja)) {
              userProjetosPermitidos.add(projNome);
            }
          }
        }
        for (const pNome of Object.keys(mapCriadores)) {
          if (matchLojaNames(pNome, sessionLoja)) {
            userProjetosPermitidos.add(pNome);
          }
        }
      }
    }
  } catch {
    // silent
  }

  const result: ProjectAccessResult = {
    allowedProjects: userProjetosPermitidos,
    mapCriadores,
    isDiretorOuAdmin,
    sessionEmail,
    sessionName,
    sessionRole,
    sessionLoja,
  };

  serverAccessCache.set(sessionEmail, {
    data: result,
    expiresAt: Date.now() + ACCESS_CACHE_TTL_MS,
  });

  return result;
}

/**
 * Verifica se o usuário tem acesso a um projeto específico.
 */
export function hasProjectAccess(
  projectName: string,
  access: ProjectAccessResult,
  fasesPorProjeto?: FaseMap
): boolean {
  const { isDiretorOuAdmin, mapCriadores, sessionEmail, sessionName, allowedProjects, sessionRole, sessionLoja } = access;

  // Diretor, Admin e Desenvolvedor veem todos os projetos
  if (isDiretorOuAdmin) {
    return true;
  }

  // Acesso a projetos da sua filial ou com a cidade no nome
  if (sessionLoja && matchLojaNames(projectName, sessionLoja)) {
    return true;
  }

  let criador = mapCriadores[projectName] || mapCriadores[projectName.trim()];
  if (!criador) {
    const pNomeLc = projectName.trim().toLowerCase();
    for (const [k, v] of Object.entries(mapCriadores)) {
      if (k.trim().toLowerCase() === pNomeLc) {
        criador = v;
        break;
      }
    }
  }
  const criadorEmail = criador?.email?.trim().toLowerCase();
  
  // Verifica acesso para projetos com OU sem criador definido
  // 1. Tem permissão explícita via user_projetos ou regra de loja
  if (allowedProjects.has(projectName)) return true;
  
  // 3. Se o projeto tem criador cadastrado: verifica se é o criador ou responsável
  if (criadorEmail) {
    // É o criador do projeto
    if (criadorEmail === sessionEmail) return true;
    
    // É responsável direto por alguma fase do projeto (por email ou nome)
    if (fasesPorProjeto) {
      let fasesDoProj = fasesPorProjeto.get(projectName) || fasesPorProjeto.get(projectName.trim()) || [];
      if (fasesDoProj.length === 0) {
        const pNomeLc = projectName.trim().toLowerCase();
        for (const [k, v] of fasesPorProjeto.entries()) {
          if (k.trim().toLowerCase() === pNomeLc) {
            fasesDoProj = v;
            break;
          }
        }
      }

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

      // Se todas as fases estão Não atribuído, permite acesso para a equipe operacional
      const todasFasesNaoAtribuidas = fasesDoProj.length > 0 && fasesDoProj.every(f => {
        const r = (f.responsavel || "").trim().toLowerCase();
        return !r || r === "não atribuído" || r === "nao atribuido";
      });
      if (todasFasesNaoAtribuidas) return true;
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