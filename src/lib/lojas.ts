import { getSupabase } from "@/lib/supabase";

export interface Loja {
  id: string;
  nome: string;
  ativo: boolean;
  createdAt: string;
}

const CHAVE_LOJAS = "sistema_lojas_v1";
const CHAVE_USUARIOS_LOJAS = "sistema_usuarios_lojas_v1";
const CHAVE_PROJETOS_LOJAS = "sistema_projetos_lojas_v1";

/**
 * Retorna a lista de todas as lojas cadastradas no sistema.
 * Prioriza tabela `lojas` se existir, com fallback para `configuracoes_sistema`.
 */
export async function getLojas(): Promise<Loja[]> {
  const db = getSupabase();

  // 1. Tenta buscar da tabela 'lojas'
  try {
    const { data, error } = await db
      .from("lojas")
      .select("id, nome, ativo, created_at")
      .order("nome", { ascending: true });

    if (!error && data && data.length > 0) {
      return data.map((d: any) => ({
        id: String(d.id),
        nome: String(d.nome),
        ativo: d.ativo !== false,
        createdAt: d.created_at || new Date().toISOString(),
      }));
    }
  } catch {
    // Tabela pode não existir ainda
  }

  // 2. Fallback: configuracoes_sistema
  try {
    const { data: configRow } = await db
      .from("configuracoes_sistema")
      .select("valor")
      .eq("chave", CHAVE_LOJAS)
      .maybeSingle();

    if (configRow?.valor && Array.isArray(configRow.valor)) {
      return configRow.valor as Loja[];
    }
  } catch (err) {
    console.error("[getLojas] Erro ao buscar de configuracoes_sistema:", err);
  }

  return [];
}

/**
 * Salva a lista de lojas tanto em configuracoes_sistema quanto na tabela lojas (se existir).
 */
export async function saveLojas(lojas: Loja[]): Promise<boolean> {
  const db = getSupabase();
  try {
    const { error } = await db
      .from("configuracoes_sistema")
      .upsert({
        chave: CHAVE_LOJAS,
        valor: lojas,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error("[saveLojas] Erro ao salvar em configuracoes_sistema:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[saveLojas] Exceção ao salvar lojas:", err);
    return false;
  }
}

/**
 * Retorna o mapa de vínculos de usuários com lojas:
 * Chave: userId ou email (em minúsculas) -> Valor: nome da loja
 */
export async function getUserLojasMap(): Promise<Record<string, string>> {
  const db = getSupabase();
  try {
    const { data: configRow } = await db
      .from("configuracoes_sistema")
      .select("valor")
      .eq("chave", CHAVE_USUARIOS_LOJAS)
      .maybeSingle();

    if (configRow?.valor && typeof configRow.valor === "object") {
      return configRow.valor as Record<string, string>;
    }
  } catch (err) {
    console.error("[getUserLojasMap] Erro:", err);
  }
  return {};
}

/**
 * Salva o vínculo de um usuário com uma loja.
 */
export async function setUserLoja(userIdentifier: string, lojaNome: string): Promise<boolean> {
  if (!userIdentifier) return false;
  const db = getSupabase();
  const idKey = userIdentifier.trim().toLowerCase();

  try {
    const currentMap = await getUserLojasMap();
    if (lojaNome) {
      currentMap[idKey] = lojaNome.trim();
    } else {
      delete currentMap[idKey];
    }

    const { error } = await db
      .from("configuracoes_sistema")
      .upsert({
        chave: CHAVE_USUARIOS_LOJAS,
        valor: currentMap,
        updated_at: new Date().toISOString(),
      });

    // Best-effort: se a coluna users.loja existir, atualiza lá também
    try {
      if (idKey.includes("@")) {
        await db.from("users").update({ loja: lojaNome || null }).eq("email", idKey);
      } else {
        await db.from("users").update({ loja: lojaNome || null }).eq("id", idKey);
      }
    } catch {
      // Coluna pode não existir
    }

    return !error;
  } catch (err) {
    console.error("[setUserLoja] Erro ao salvar vínculo:", err);
    return false;
  }
}

/**
 * Retorna a loja atribuída a um usuário específico por email ou ID.
 */
export async function getUserAssignedLoja(user: { id?: string | null; email?: string | null }): Promise<string | null> {
  const map = await getUserLojasMap();
  if (user.id && map[user.id.toLowerCase()]) {
    return map[user.id.toLowerCase()];
  }
  if (user.email && map[user.email.trim().toLowerCase()]) {
    return map[user.email.trim().toLowerCase()];
  }
  return null;
}

/**
 * Retorna o mapa de vínculos de projetos com lojas:
 * Chave: nome do projeto -> Valor: nome da loja
 */
export async function getProjectLojasMap(): Promise<Record<string, string>> {
  const db = getSupabase();
  try {
    const { data: configRow } = await db
      .from("configuracoes_sistema")
      .select("valor")
      .eq("chave", CHAVE_PROJETOS_LOJAS)
      .maybeSingle();

    if (configRow?.valor && typeof configRow.valor === "object") {
      return configRow.valor as Record<string, string>;
    }
  } catch (err) {
    console.error("[getProjectLojasMap] Erro:", err);
  }
  return {};
}

/**
 * Atribui ou altera a loja de um projeto específico.
 */
export async function setProjectLoja(projetoNome: string, lojaNome: string): Promise<boolean> {
  if (!projetoNome) return false;
  const db = getSupabase();
  try {
    const currentMap = await getProjectLojasMap();
    if (lojaNome) {
      currentMap[projetoNome] = lojaNome.trim();
    } else {
      delete currentMap[projetoNome];
    }

    const { error } = await db
      .from("configuracoes_sistema")
      .upsert({
        chave: CHAVE_PROJETOS_LOJAS,
        valor: currentMap,
        updated_at: new Date().toISOString(),
      });

    return !error;
  } catch (err) {
    console.error("[setProjectLoja] Erro:", err);
    return false;
  }
}
