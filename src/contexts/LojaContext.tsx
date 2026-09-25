"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { isMasterDevSession } from "@/lib/client-roles";

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
      const saved = sessionStorage.getItem("terracafe_lojas_cache");
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
      const saved = sessionStorage.getItem("terracafe_projetos_lojas_cache");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [usuariosLojas, setUsuariosLojas] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = sessionStorage.getItem("terracafe_usuarios_lojas_cache");
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
  const canSwitchLoja = isDiretor || isCoordenador || isAdmin;

  // Loja atribuída ao usuário na sessão ou no banco
  const userAssignedLoja = useMemo(() => {
    return (session?.user as any)?.loja || null;
  }, [session]);

  const loadLojasData = useCallback(async () => {
    try {
      // Uma única requisição unificada e rápida
      const res = await fetch("/api/lojas");
      if (res.ok) {
        const data = await res.json();
        const listaLojas = data.lojas || [];
        const mapProj = data.projetosLojas || {};
        const mapUsers = data.usuariosLojas || {};

        setLojas(listaLojas);
        setProjetosLojas(mapProj);
        setUsuariosLojas(mapUsers);

        try {
          sessionStorage.setItem("terracafe_lojas_cache", JSON.stringify(listaLojas));
          sessionStorage.setItem("terracafe_projetos_lojas_cache", JSON.stringify(mapProj));
          sessionStorage.setItem("terracafe_usuarios_lojas_cache", JSON.stringify(mapUsers));
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error("[LojaProvider] Erro ao carregar lojas:", err);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      loadLojasData();
    }
  }, [status, loadLojasData]);

  // Inicializa a loja selecionada de acordo com o perfil
  useEffect(() => {
    if (!session?.user) return;

    const saved = localStorage.getItem("terracafe_selected_loja");

    if (isDiretor || isCoordenador) {
      // Diretor e Coordenador: visão executiva geral, pode alternar entre todas as filiais
      const userLoja = (session.user as any)?.loja;
      if (saved && saved !== "TODAS") {
        setSelectedLojaState(saved);
      } else if (userLoja) {
        setSelectedLojaState(userLoja);
      } else {
        setSelectedLojaState("TODAS");
      }
    } else if (isAdmin) {
      // Admin/Master: pode ver todas por padrão ou usar a salva
      if (saved) {
        setSelectedLojaState(saved);
      } else {
        setSelectedLojaState("TODAS");
      }
    } else if (isGerente) {
      // Gerente: fixado na sua loja atribuída (acesso a todas as obras da sua cidade)
      const userLoja = (session.user as any)?.loja;
      if (userLoja) {
        setSelectedLojaState(userLoja);
      } else {
        setSelectedLojaState("TODAS");
      }
    } else {
      // Montador / Colaborador: fixado na sua loja se tiver, ou TODAS
      const userLoja = (session.user as any)?.loja;
      if (userLoja) {
        setSelectedLojaState(userLoja);
      } else {
        setSelectedLojaState("TODAS");
      }
    }
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
      const res = await fetch("/api/lojas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projetoNome, lojaNome }),
      });
      if (res.ok) {
        setProjetosLojas((prev) => ({ ...prev, [projetoNome]: lojaNome }));
        return true;
      }
    } catch (e) {
      console.error("[atribuirProjetoLoja] Erro:", e);
    }
    return false;
  }, []);

  /**
   * Verifica se um projeto pertence à loja atualmente selecionada.
   */
  const isProjectInSelectedLoja = useCallback(
    (projetoNome: string, criadorEmail?: string): boolean => {
      if (selectedLoja === "TODAS") return true;

      // 1. Vínculo direto projeto -> loja
      const lojaDireta = projetosLojas[projetoNome];
      if (lojaDireta) {
        return lojaDireta.toLowerCase() === selectedLoja.toLowerCase();
      }

      // 2. Vínculo herdado do criador do projeto
      if (criadorEmail) {
        const emailLc = criadorEmail.toLowerCase().trim();
        const lojaCriador = usuariosLojas[emailLc];
        if (lojaCriador) {
          return lojaCriador.toLowerCase() === selectedLoja.toLowerCase();
        }
      }

      // 3. Projetos ainda sem atribuição aparecem se o usuário estiver vendo "TODAS",
      // mas se estiver vendo uma loja específica, ficam ocultos daquela loja
      return false;
    },
    [selectedLoja, projetosLojas, usuariosLojas]
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
