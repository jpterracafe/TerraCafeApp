"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { isMasterDevSession } from "@/lib/client-roles";
import { matchLojaNames, extractProjectBaseName } from "@/lib/lojas";

export interface LojaItem {
  id: string;
  nome: string;
  ativo: boolean;
  createdAt: string;
}

interface LojaContextType {
  lojas: LojaItem[];
  selectedLoja: string; // "TODAS" ou nome da loja
  setSelectedLoja: (loja: string) => void;
  userAssignedLoja: string | null;
  canSwitchLoja: boolean;
  isDiretor: boolean;
  isCoordenador: boolean;
  isGerente: boolean;
  isAdmin: boolean;
  projetosLojas: Record<string, string>;
  usuariosLojas: Record<string, string>;
  refreshLojas: () => Promise<void>;
  atribuirProjetoLoja: (projetoNome: string, lojaNome: string) => Promise<boolean>;
  getLojaDoProjeto: (projetoNome: string, criadorEmail?: string) => string;
  isProjectInSelectedLoja: (projetoNome: string, criadorEmail?: string) => boolean;
}

const LojaContext = createContext<LojaContextType | undefined>(undefined);

export const DEFAULT_LOJAS_LIST: LojaItem[] = [
  { id: "loja-guaxupe", nome: "Terra Café Guaxupé", ativo: true, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "loja-pouso-alegre", nome: "DaTerra Pouso Alegre", ativo: true, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "loja-sao-joao", nome: "DaTerra São João da Boa Vista", ativo: true, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "loja-taubate", nome: "DaTerra Taubaté", ativo: true, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "loja-patrocinio", nome: "DaTerra Patrocínio", ativo: true, createdAt: "2026-01-01T00:00:00.000Z" },
];

export function LojaProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  // Inicialização instantânea do cache local para não travar a abertura das telas
  const [lojas, setLojas] = useState<LojaItem[]>(() => {
    if (typeof window === "undefined") return DEFAULT_LOJAS_LIST;
    try {
      const saved = localStorage.getItem("terracafe_lojas_cache") || sessionStorage.getItem("terracafe_lojas_cache");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return DEFAULT_LOJAS_LIST;
    } catch { return DEFAULT_LOJAS_LIST; }
  });
  const [projetosLojas, setProjetosLojas] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("terracafe_projetos_lojas_cache") || sessionStorage.getItem("terracafe_projetos_lojas_cache");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [usuariosLojas, setUsuariosLojas] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("terracafe_usuarios_lojas_cache") || sessionStorage.getItem("terracafe_usuarios_lojas_cache");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [selectedLoja, setSelectedLojaState] = useState<string>("TODAS");

  const userRole = (session?.user as any)?.role || "Colaborador";
  const isMasterDev = isMasterDevSession(session);
  const isCoordenador = userRole === "Coordenador";
  const isDiretor = userRole === "Diretor" || isCoordenador;
  const isGerente = userRole === "Gerente";
  const isAdmin = userRole === "Admin" || isMasterDev;
  const canSwitchLoja = isDiretor || isCoordenador || isAdmin || isGerente;

  // Loja atribuída ao usuário na sessão ou no banco
  const userAssignedLoja = useMemo(() => {
    return (session?.user as any)?.loja || null;
  }, [session]);

  const loadLojasData = useCallback(async () => {
    try {
      const res = await fetch("/api/lojas", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
      });
      if (res.ok) {
        const data = await res.json();
        const listaLojas = data.lojas || [];
        const mapProj = data.projetosLojas || {};
        const mapUsers = data.usuariosLojas || {};

        setLojas(listaLojas);
        setProjetosLojas(mapProj);
        setUsuariosLojas(mapUsers);

        try {
          localStorage.setItem("terracafe_lojas_cache", JSON.stringify(listaLojas));
          localStorage.setItem("terracafe_projetos_lojas_cache", JSON.stringify(mapProj));
          localStorage.setItem("terracafe_usuarios_lojas_cache", JSON.stringify(mapUsers));
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.warn("[LojaProvider] Falha ao recarregar lojas da rede:", err);
    }
  }, []);

  useEffect(() => {
    loadLojasData();
  }, [status, loadLojasData]);

  // Listener para sincronização instantânea quando uma loja for criada, editada ou excluída no admin
  useEffect(() => {
    const handleLojasUpdated = () => {
      try {
        localStorage.removeItem("terracafe_lojas_cache");
        sessionStorage.removeItem("terracafe_lojas_cache");
      } catch {}
      loadLojasData();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("terracafe_lojas_updated", handleLojasUpdated);
      return () => {
        window.removeEventListener("terracafe_lojas_updated", handleLojasUpdated);
      };
    }
  }, [loadLojasData]);

  // Inicializa a loja selecionada de acordo com o perfil
  useEffect(() => {
    if (!session?.user) return;

    const saved = localStorage.getItem("terracafe_selected_loja");
    let target = "TODAS";

    if (isDiretor || isCoordenador) {
      // Diretor e Coordenador: visão executiva geral, pode alternar entre todas as filiais
      const userLoja = (session.user as any)?.loja;
      if (saved && saved !== "TODAS") {
        target = saved;
      } else if (userLoja) {
        target = userLoja;
      } else {
        target = "TODAS";
      }
    } else if (isAdmin) {
      // Admin/Master: pode ver todas por padrão ou usar a salva
      target = saved || "TODAS";
    } else if (isGerente) {
      // Gerente: fixado na sua loja atribuída (acesso a todas as obras da sua cidade)
      const userLoja = (session.user as any)?.loja;
      target = userLoja || "TODAS";
    } else {
      // Montador / Colaborador: fixado na sua loja se tiver, ou TODAS
      const userLoja = (session.user as any)?.loja;
      target = userLoja || "TODAS";
    }

    setSelectedLojaState((curr) => (curr !== target ? target : curr));
  }, [session, isDiretor, isCoordenador, isGerente, isAdmin]);

  const setSelectedLoja = useCallback((loja: string) => {
    setSelectedLojaState(loja);
    try {
      localStorage.setItem("terracafe_selected_loja", loja);
    } catch {
      // fallback
    }
  }, []);

  const atribuirProjetoLoja = useCallback(async (projetoNome: string, lojaNome: string): Promise<boolean> => {
    try {
      const cleanLoja = (lojaNome || "").trim();
      const cleanProj = (projetoNome || "").trim();
      const baseProj = extractProjectBaseName(cleanProj);

      // Otimisticamente atualiza o estado local e os dois storages
      setProjetosLojas((prev) => {
        const updated = { ...prev };
        if (cleanLoja) {
          updated[cleanProj] = cleanLoja;
          updated[projetoNome] = cleanLoja;
          if (baseProj) updated[baseProj] = cleanLoja;
        } else {
          delete updated[cleanProj];
          delete updated[projetoNome];
          if (baseProj) delete updated[baseProj];
        }
        try {
          localStorage.setItem("terracafe_projetos_lojas_cache", JSON.stringify(updated));
          sessionStorage.setItem("terracafe_projetos_lojas_cache", JSON.stringify(updated));
        } catch {}
        return updated;
      });

      const res = await fetch("/api/lojas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projetoNome, lojaNome: cleanLoja }),
      });

      if (res.ok) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("terracafe_lojas_updated"));
        }
        return true;
      }
    } catch (e) {
      console.error("[atribuirProjetoLoja] Erro:", e);
    }
    return false;
  }, []);

  /**
   * Retorna a filial oficial vinculada a um projeto com máxima resiliência:
   * 1. Vínculo direto no mapa de projetos (nome exato, trimmed, base sem V0/V1, minúsculas)
   * 2. Vínculo herdado do criador da obra (usuariosLojas)
   * 3. Reconhecimento automático se o próprio nome do projeto cita a cidade da filial
   */
  const getLojaDoProjeto = useCallback(
    (projetoNome: string, criadorEmail?: string): string => {
      const pNomeTrim = (projetoNome || "").trim();
      if (!pNomeTrim) return "";

      const pBase = extractProjectBaseName(pNomeTrim);
      const pNomeLc = pNomeTrim.toLowerCase();
      const pBaseLc = pBase.toLowerCase();

      // 1. Busca direta no mapa
      if (projetosLojas[pNomeTrim]) return projetosLojas[pNomeTrim];
      if (projetosLojas[projetoNome]) return projetosLojas[projetoNome];
      if (pBase && projetosLojas[pBase]) return projetosLojas[pBase];

      // Busca insensível a maiúsculas / espaços / versões
      for (const [k, v] of Object.entries(projetosLojas)) {
        if (!v) continue;
        const kTrim = k.trim();
        const kLc = kTrim.toLowerCase();
        const kBase = extractProjectBaseName(kTrim).toLowerCase();
        if (kLc === pNomeLc || (kBase && kBase === pBaseLc) || (kBase && kBase === pNomeLc) || kLc === pBaseLc) {
          return v;
        }
      }

      // 2. Vínculo herdado do criador da obra
      if (criadorEmail) {
        const cEmailLc = criadorEmail.toLowerCase().trim();
        if (usuariosLojas[cEmailLc]) {
          return usuariosLojas[cEmailLc];
        }
      }

      // 3. Fallback: reconhecimento se o nome do projeto cita a cidade da filial
      for (const loja of lojas) {
        if (matchLojaNames(pNomeTrim, loja.nome)) {
          return loja.nome;
        }
      }

      return "";
    },
    [projetosLojas, usuariosLojas, lojas]
  );

  /**
   * Verifica se um projeto pertence à loja atualmente selecionada.
   */
  const isProjectInSelectedLoja = useCallback(
    (projetoNome: string, criadorEmail?: string): boolean => {
      if (!selectedLoja || selectedLoja === "TODAS") return true;

      const pNomeTrim = (projetoNome || "").trim();
      if (!pNomeTrim) return false;

      const lojaVinculada = getLojaDoProjeto(pNomeTrim, criadorEmail);
      if (lojaVinculada) {
        return matchLojaNames(lojaVinculada, selectedLoja);
      }

      // Se a obra NÃO possui nenhum vínculo com outra loja (sem filial direta nem filial do criador),
      // pertence ao escopo geral da empresa
      return true;
    },
    [selectedLoja, getLojaDoProjeto]
  );

  const contextValue = useMemo<LojaContextType>(
    () => ({
      lojas,
      selectedLoja,
      setSelectedLoja,
      userAssignedLoja,
      canSwitchLoja,
      isDiretor,
      isCoordenador,
      isGerente,
      isAdmin,
      projetosLojas,
      usuariosLojas,
      refreshLojas: loadLojasData,
      atribuirProjetoLoja,
      getLojaDoProjeto,
      isProjectInSelectedLoja,
    }),
    [
      lojas,
      selectedLoja,
      setSelectedLoja,
      userAssignedLoja,
      canSwitchLoja,
      isDiretor,
      isCoordenador,
      isGerente,
      isAdmin,
      projetosLojas,
      usuariosLojas,
      loadLojasData,
      atribuirProjetoLoja,
      getLojaDoProjeto,
      isProjectInSelectedLoja,
    ]
  );

  return (
    <LojaContext.Provider value={contextValue}>
      {children}
    </LojaContext.Provider>
  );
}

export function useLoja() {
  const context = useContext(LojaContext);
  if (!context) {
    throw new Error("useLoja deve ser usado dentro de um LojaProvider");
  }
  return context;
}
