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
 * Propaga a loja de um usuário para todos os projetos criados por ele ou vinculados a ele.
 * Fontes checadas:
 * 1. configuracoes_sistema (diario_projetos_criadores_v1)
 * 2. tabela user_projetos
 * 3. tabela fases_acao (criado_por_email)
 */
export async function propagateUserLojaToProjects(userIdentifier: string, lojaNome: string): Promise<string[]> {
  if (!userIdentifier) return [];
  const db = getSupabase();
  const idOrEmail = userIdentifier.trim().toLowerCase();

  try {
    let userEmail = idOrEmail.includes("@") ? idOrEmail : "";
    let userId = !idOrEmail.includes("@") ? idOrEmail : "";

    // Se só temos um dos dois, tenta buscar o outro no banco
    if (!userEmail || !userId) {
      try {
        const { data: userRow } = userEmail
          ? await db.from("users").select("id, email").eq("email", userEmail).maybeSingle()
          : await db.from("users").select("id, email").eq("id", userId).maybeSingle();

        if (userRow) {
          if (userRow.email) userEmail = userRow.email.trim().toLowerCase();
          if (userRow.id) userId = String(userRow.id).trim();
        }
      } catch (_) {}
    }

    const projetosDoUsuario = new Set<string>();

    // 1. Checa configuracoes_sistema (diario_projetos_criadores_v1)
    try {
      const { data: criadoresRow } = await db
        .from("configuracoes_sistema")
        .select("valor")
        .eq("chave", "diario_projetos_criadores_v1")
        .maybeSingle();

      if (criadoresRow?.valor && typeof criadoresRow.valor === "object") {
        for (const [projNome, criadorInfo] of Object.entries(criadoresRow.valor as Record<string, any>)) {
          const cEmail = String(criadorInfo?.email || "").trim().toLowerCase();
          const cId = String(criadorInfo?.id || "").trim();
          if ((userEmail && cEmail === userEmail) || (userId && cId === userId)) {
            projetosDoUsuario.add(projNome);
          }
        }
      }
    } catch (_) {}

    // 2. Checa tabela user_projetos se existir
    try {
      let queryUp = db.from("user_projetos").select("projeto_nome, user_email, user_id");
      if (userEmail && userId) {
        queryUp = queryUp.or(`user_email.eq.${userEmail},user_id.eq.${userId}`);
      } else if (userEmail) {
        queryUp = queryUp.eq("user_email", userEmail);
      } else if (userId) {
        queryUp = queryUp.eq("user_id", userId);
      }
      const { data: upRows } = await queryUp;
      if (upRows && Array.isArray(upRows)) {
        for (const r of upRows) {
          if (r.projeto_nome) projetosDoUsuario.add(r.projeto_nome);
        }
      }
    } catch (_) {}

    // 3. Checa tabela fases_acao por criado_por_email
    if (userEmail) {
      try {
        const { data: fasesRows } = await db
          .from("fases_acao")
          .select("projeto_cliente")
          .eq("criado_por_email", userEmail)
          .not("projeto_cliente", "is", null);

        if (fasesRows && Array.isArray(fasesRows)) {
          for (const f of fasesRows) {
            if (f.projeto_cliente) projetosDoUsuario.add(f.projeto_cliente);
          }
        }
      } catch (_) {}
    }

    const listaProjetos = Array.from(projetosDoUsuario);
    if (listaProjetos.length === 0) return [];

    // Atualiza o mapa de projetos no banco
    const currentProjetosLojas = await getProjectLojasMap();
    for (const proj of listaProjetos) {
      if (lojaNome) {
        currentProjetosLojas[proj] = lojaNome.trim();
      } else {
        delete currentProjetosLojas[proj];
      }
    }

    await db.from("configuracoes_sistema").upsert({
      chave: CHAVE_PROJETOS_LOJAS,
      valor: currentProjetosLojas,
      updated_at: new Date().toISOString(),
    });

    return listaProjetos;
  } catch (err) {
    console.error("[propagateUserLojaToProjects] Erro ao propagar loja para projetos:", err);
    return [];
  }
}

/**
 * Salva o vínculo de um usuário com uma loja e propaga automaticamente
 * para TODOS os projetos daquela pessoa.
 */
export async function setUserLoja(userIdentifier: string, lojaNome: string): Promise<boolean> {
  if (!userIdentifier) return false;
  const db = getSupabase();
  const idKey = userIdentifier.trim().toLowerCase();

  try {
    const currentMap = await getUserLojasMap();
    
    // Tenta resolver tanto ID quanto Email para gravar de forma idêntica
    let userEmail = idKey.includes("@") ? idKey : "";
    let userId = !idKey.includes("@") ? idKey : "";

    try {
      const { data: uRow } = userEmail
        ? await db.from("users").select("id, email").eq("email", userEmail).maybeSingle()
        : await db.from("users").select("id, email").eq("id", userId).maybeSingle();

      if (uRow) {
        if (uRow.email) userEmail = uRow.email.trim().toLowerCase();
        if (uRow.id) userId = String(uRow.id).trim();
      }
    } catch (_) {}

    const cleanLoja = lojaNome ? lojaNome.trim() : "";

    if (cleanLoja) {
      currentMap[idKey] = cleanLoja;
      if (userEmail) currentMap[userEmail] = cleanLoja;
      if (userId) currentMap[userId] = cleanLoja;
    } else {
      delete currentMap[idKey];
      if (userEmail) delete currentMap[userEmail];
      if (userId) delete currentMap[userId];
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
      if (userEmail) {
        await db.from("users").update({ loja: cleanLoja || null }).eq("email", userEmail);
      }
      if (userId) {
        await db.from("users").update({ loja: cleanLoja || null }).eq("id", userId);
      }
    } catch {
      // Coluna pode não existir
    }

    // ⚡ PROPAGAÇÃO AUTOMÁTICA: Todos os projetos deste usuário agora vão para esta loja!
    await propagateUserLojaToProjects(userIdentifier, cleanLoja);

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
