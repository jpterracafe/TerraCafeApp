"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import BackButton from '@/components/BackButton';
import { useToast } from '@/components/Toast';
import {
  AlertTriangle,
  ChevronRight,
  RefreshCcw,
  Trash2,
  Inbox,
  Briefcase,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { FaseAcao } from '../execucao/mockFases';
import { offlineFetch, invalidateOfflineCache } from '@/lib/offline';
import { idbRemoveProjectLogs } from '@/lib/idb';
import { useLoja } from '@/contexts/LojaContext';
import LojaSelector from '@/components/LojaSelector';

export default function LixeiraPage() {
  const { success, error: toastError } = useToast();
  const { isProjectInSelectedLoja, projetosLojas, selectedLoja } = useLoja();
  const [deletedFases, setDeletedFases] = useState<FaseAcao[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  // Estados de ação para feedback visual e prevenção de concorrência
  const [clearingTrash, setClearingTrash] = useState(false);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Modais de confirmação seguros (não travam em mobile/PWA como o window.confirm)
  const [showEmptyModal, setShowEmptyModal] = useState(false);
  const [projectToDeleteModal, setProjectToDeleteModal] = useState<{
    nome: string;
    fasesCount: number;
  } | null>(null);

  const loadDeleted = useCallback(async () => {
    setLoading(true);
    try {
      invalidateOfflineCache();
      const res = await offlineFetch(`/api/fases?_t=${Date.now()}`);
      if (res.ok) {
        const { fases } = await res.json();
        setDeletedFases((fases as FaseAcao[]).filter((f) => f.isDeleted));
      }
    } catch (e) {
      console.error('[lixeira] Erro ao carregar:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeleted();
  }, [loadDeleted]);

  // ── Auto-refresh com proteção de estado (não interrompe operações em andamento) ─
  useEffect(() => {
    let timerId: ReturnType<typeof setInterval> | null = null;
    const REFRESH_MS = 30 * 1000;

    const canRefresh = () => !loading && !clearingTrash && !actionInProgress;

    const startPolling = () => {
      if (timerId) return;
      timerId = setInterval(() => {
        if (canRefresh()) loadDeleted();
      }, REFRESH_MS);
    };

    const stopPolling = () => {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (canRefresh()) loadDeleted();
        startPolling();
      } else {
        stopPolling();
      }
    };

    const onFocus = () => {
      if (canRefresh()) loadDeleted();
    };

    startPolling();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadDeleted, loading, clearingTrash, actionInProgress]);

  // Agrupa fases por projeto/cliente filtrados pela loja selecionada
  const projetosAgrupados = useMemo(() => {
    const mapa: Record<string, FaseAcao[]> = {};
    deletedFases.forEach((f) => {
      const key = f.projetoCliente?.trim() || '(Sem projeto)';
      if (!isProjectInSelectedLoja(key, (f as any).criadoPorEmail || (f as any).criado_por_email)) return;
      if (!mapa[key]) mapa[key] = [];
      mapa[key].push(f);
    });
    return Object.entries(mapa).sort((a, b) => a[0].localeCompare(b[0]));
  }, [deletedFases, isProjectInSelectedLoja]);

  // Total de etapas nos projetos atualmente filtrados
  const totalFasesVisiveis = useMemo(() => {
    return projetosAgrupados.reduce((acc, [, fases]) => acc + fases.length, 0);
  }, [projetosAgrupados]);

  const toggleExpand = (nome: string) => {
    setExpandedProjects((prev) => {
      const s = new Set(prev);
      if (s.has(nome)) s.delete(nome);
      else s.add(nome);
      return s;
    });
  };

  // Restaura todas as fases e o histórico completo de um projeto
  const handleRestoreProjeto = async (nomeProjeto: string) => {
    const fasesDoProjeto = projetosAgrupados.find(([n]) => n === nomeProjeto)?.[1] ?? [];
    if (fasesDoProjeto.length === 0) return;

    const ids = fasesDoProjeto.map((f) => f.id);
    setActionInProgress(`restaurar-${nomeProjeto}`);
    setLoadingIds((prev) => new Set([...prev, ...ids]));
    try {
      const res = await offlineFetch(`/api/projetos?nome=${encodeURIComponent(nomeProjeto)}`, {
        method: 'PATCH',
      });

      if (!res.ok) {
        // Fallback por garantia
        await Promise.all(
          fasesDoProjeto.map((f) =>
            offlineFetch('/api/fases', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: f.id, isDeleted: false }),
            })
          )
        );
      }

      invalidateOfflineCache();
      setDeletedFases((prev) => prev.filter((f) => !ids.includes(f.id)));
      success(`Projeto "${nomeProjeto}" e histórico restaurados com sucesso.`);
    } catch (e) {
      console.error('[lixeira] Erro ao restaurar projeto:', e);
      toastError('Erro ao restaurar o projeto.');
    } finally {
      setActionInProgress(null);
      setLoadingIds((prev) => {
        const s = new Set(prev);
        ids.forEach((id) => s.delete(id));
        return s;
      });
    }
  };

  // ── Função auxiliar: Limpa rigorosamente qualquer resquício local dos projetos ──
  const purgeLocalProjectStorage = (nomeOuNomes: string | string[]) => {
    const nomes = (Array.isArray(nomeOuNomes) ? nomeOuNomes : [nomeOuNomes])
      .map(n => (n || '').trim())
      .filter(Boolean);
    if (nomes.length === 0) return;

    const chavesStorage = [
      'diario_projeto_starts_v1',
      'diario_projetos_prazo_final_v1',
      'diario_etapas_config_v1',
      'diario_responsaveis_por_etapa_v1',
      'diario_projeto_justificativas_v1',
      'diario_etapas_progresso_v1',
      'diario_etapas_status_v1',
    ];

    chavesStorage.forEach((chave) => {
      try {
        const raw = localStorage.getItem(chave);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            let mod = false;
            nomes.forEach((nome) => {
              const nomeLc = nome.toLowerCase();
              Object.keys(parsed).forEach((k) => {
                const kLc = k.trim().toLowerCase();
                if (
                  kLc === nomeLc ||
                  kLc.startsWith(`${nomeLc}::`) ||
                  k === nome ||
                  k.startsWith(`${nome}::`)
                ) {
                  delete parsed[k];
                  mod = true;
                }
              });
            });
            if (mod) {
              localStorage.setItem(chave, JSON.stringify(parsed));
            }
          }
        }
      } catch (_) {}
    });

    try {
      nomes.forEach((nome) => {
        const nomeLc = nome.toLowerCase();
        Object.keys(sessionStorage).forEach((sk) => {
          const skLc = sk.toLowerCase();
          if (skLc.includes(`_obs_${nomeLc}_`)) {
            sessionStorage.removeItem(sk);
          }
        });
      });
    } catch (_) {}
  };

  // Abre modal para confirmar exclusão permanente de um projeto
  const promptHardDeleteProjeto = (nomeProjeto: string) => {
    const fasesDoProjeto = projetosAgrupados.find(([n]) => n === nomeProjeto)?.[1] ?? [];
    if (fasesDoProjeto.length === 0) return;
    setProjectToDeleteModal({ nome: nomeProjeto, fasesCount: fasesDoProjeto.length });
  };

  // Apaga permanentemente todas as fases e histórico de um projeto específico
  const confirmHardDeleteProjeto = async () => {
    if (!projectToDeleteModal) return;
    const nomeProjeto = projectToDeleteModal.nome;
    const fasesDoProjeto = projetosAgrupados.find(([n]) => n === nomeProjeto)?.[1] ?? [];

    const ids = fasesDoProjeto.map((f) => f.id);
    setActionInProgress(`deletar-${nomeProjeto}`);
    setLoadingIds((prev) => new Set([...prev, ...ids]));
    setProjectToDeleteModal(null);

    try {
      // Exclui via API de projetos com hard=true (expurga fases, logs, configs e lojas no servidor)
      const res = await offlineFetch(`/api/projetos?nome=${encodeURIComponent(nomeProjeto)}&hard=true`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Falha ao excluir o projeto no servidor');

      // Limpa dados locais residuais
      await idbRemoveProjectLogs(nomeProjeto);
      purgeLocalProjectStorage(nomeProjeto);

      invalidateOfflineCache();
      const nomeLc = nomeProjeto.trim().toLowerCase();
      setDeletedFases((prev) =>
        prev.filter((f) => (f.projetoCliente || '').trim().toLowerCase() !== nomeLc && !ids.includes(f.id))
      );
      success(`Projeto "${nomeProjeto}" excluído permanentemente.`);
      await loadDeleted();
    } catch (e) {
      console.error('[lixeira] Erro ao deletar projeto:', e);
      toastError('Erro ao excluir o projeto.');
    } finally {
      setActionInProgress(null);
      setLoadingIds((prev) => {
        const s = new Set(prev);
        ids.forEach((id) => s.delete(id));
        return s;
      });
    }
  };

  // Esvazia toda a lixeira de forma atômica e segura no servidor
  const confirmEmptyTrash = async () => {
    if (projetosAgrupados.length === 0) return;
    setShowEmptyModal(false);
    setClearingTrash(true);

    const nomesProjetos = projetosAgrupados.map(([nome]) => nome);

    try {
      // Chama o endpoint atômico /api/lixeira que executa o expurgo em lote no servidor sem race conditions
      const res = await offlineFetch('/api/lixeira', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projetos: nomesProjetos,
          todos: !selectedLoja || selectedLoja === 'TODAS' || selectedLoja === 'all',
          loja: selectedLoja,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || 'Erro ao esvaziar a lixeira no servidor.');
      }

      // Limpa logs locais de IndexedDB para cada projeto excluído
      await Promise.allSettled(nomesProjetos.map((nome) => idbRemoveProjectLogs(nome)));

      // Limpa dados locais residuais em localStorage e sessionStorage
      purgeLocalProjectStorage(nomesProjetos);

      // Invalida cache de dados offline
      invalidateOfflineCache();

      // Remove do estado local imediatamente
      if (!selectedLoja || selectedLoja === 'TODAS' || selectedLoja === 'all') {
        setDeletedFases([]);
      } else {
        const nomesProjetosLc = nomesProjetos.map((n) => n.trim().toLowerCase());
        setDeletedFases((prev) =>
          prev.filter((f) => !nomesProjetosLc.includes((f.projetoCliente || '').trim().toLowerCase()))
        );
      }

      success(
        selectedLoja && selectedLoja !== 'TODAS'
          ? `Lixeira da filial "${selectedLoja}" esvaziada com sucesso.`
          : 'Lixeira esvaziada com sucesso.'
      );

      // Revalida dados com o banco para garantir integridade total
      await loadDeleted();
    } catch (e: any) {
      console.error('[lixeira] Erro ao esvaziar lixeira:', e);
      toastError(e?.message || 'Erro ao esvaziar a lixeira. Tente novamente.');
    } finally {
      setClearingTrash(false);
    }
  };

  const isLojaFiltrada = selectedLoja && selectedLoja !== 'TODAS';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070c18] text-slate-600 dark:text-slate-300 p-3 sm:p-5 md:p-8 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-5 sm:mb-8 gap-3 sm:gap-4">
        <div>
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-1.5 sm:mb-2">
            <BackButton />
            <span>Portal</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span>Irrigação</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-rose-600 dark:text-rose-400 font-medium">Lixeira</span>
          </nav>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5 sm:gap-3">
            <Trash2 className="w-6 h-6 sm:w-7 sm:h-7 text-rose-500" />
            Lixeira de Projetos
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5 text-xs sm:text-sm">
            Projetos removidos do painel. Restaure o projeto inteiro ou exclua permanentemente.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <LojaSelector />
          <button
            type="button"
            onClick={() => loadDeleted()}
            disabled={loading || clearingTrash || !!actionInProgress}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all active:scale-95 shrink-0"
            title="Recarregar projetos da lixeira"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
          <button
            onClick={() => setShowEmptyModal(true)}
            disabled={projetosAgrupados.length === 0 || clearingTrash || !!actionInProgress}
            className="flex items-center justify-center gap-1.5 sm:gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 sm:px-4 py-2 rounded-xl font-bold transition-all shadow-md shadow-rose-900/20 text-xs sm:text-sm active:scale-95 shrink-0"
            title={
              isLojaFiltrada
                ? `Esvaziar lixeira da filial ${selectedLoja}`
                : 'Esvaziar todos os projetos da lixeira'
            }
          >
            {clearingTrash ? (
              <>
                <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                <span>Esvaziando...</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>
                  {isLojaFiltrada ? 'Esvaziar Filial' : 'Esvaziar Lixeira'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Alerta de aviso se houver filtro de loja ativo */}
      {isLojaFiltrada && projetosAgrupados.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl text-xs sm:text-sm text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2">
          <span>
            Exibindo apenas projetos da filial <strong>{selectedLoja}</strong> ({projetosAgrupados.length} projeto
            {projetosAgrupados.length !== 1 ? 's' : ''}).
          </span>
        </div>
      )}

      <div className="space-y-4">
        {loading && (
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-12 text-center text-slate-500">
            <span className="inline-block w-6 h-6 border-2 border-slate-300 border-t-rose-500 rounded-full animate-spin mb-3" />
            <p className="text-sm font-medium">Carregando lixeira...</p>
          </div>
        )}

        {!loading && projetosAgrupados.length === 0 && (
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-16 text-center text-slate-500 dark:text-slate-400">
            <Inbox className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">A lixeira está vazia</h3>
            <p className="text-sm mt-1">
              {isLojaFiltrada
                ? `Nenhum projeto foi removido para a filial ${selectedLoja}.`
                : 'Nenhum projeto foi removido recentemente.'}
            </p>
          </div>
        )}

        {!loading &&
          projetosAgrupados.map(([nomeProjeto, fasesDoProjeto]) => {
            const isExpanded = expandedProjects.has(nomeProjeto);
            const isLoadingProjeto =
              fasesDoProjeto.some((f) => loadingIds.has(f.id)) ||
              actionInProgress === `restaurar-${nomeProjeto}` ||
              actionInProgress === `deletar-${nomeProjeto}`;

            return (
              <div
                key={nomeProjeto}
                className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl overflow-hidden shadow-lg shadow-black/10 transition-all"
              >
                {/* Cabeçalho do projeto */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 sm:p-5">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
                      <Briefcase className="w-5 h-5 text-rose-500 dark:text-rose-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900 dark:text-white truncate">{nomeProjeto}</h3>
                        {projetosLojas[nomeProjeto] && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                            🏪 {projetosLojas[nomeProjeto]}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {fasesDoProjeto.length} fase{fasesDoProjeto.length !== 1 ? 's' : ''} removida
                        {fasesDoProjeto.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  {/* Ações do projeto */}
                  <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap justify-between sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => handleRestoreProjeto(nomeProjeto)}
                      disabled={isLoadingProjeto || clearingTrash}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors font-bold text-xs border border-emerald-200 dark:border-emerald-800 disabled:opacity-50 active:scale-95"
                    >
                      <RefreshCcw className={`w-3.5 h-3.5 ${isLoadingProjeto ? 'animate-spin' : ''}`} />
                      <span>Restaurar Projeto</span>
                    </button>
                    <button
                      onClick={() => promptHardDeleteProjeto(nomeProjeto)}
                      disabled={isLoadingProjeto || clearingTrash}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors font-bold text-xs border border-rose-200 dark:border-rose-800 disabled:opacity-50 active:scale-95"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir Permanentemente</span>
                    </button>
                    <button
                      onClick={() => toggleExpand(nomeProjeto)}
                      className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1e293b] text-slate-400 transition-colors border border-slate-200 dark:border-slate-800 sm:border-transparent shrink-0"
                      title={isExpanded ? 'Recolher fases' : 'Ver fases'}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Fases do projeto (expandível) */}
                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-[#1e293b] overflow-x-auto">
                    <table className="w-full text-sm min-w-[560px]">
                      <thead className="bg-slate-50 dark:bg-[#0b1329]">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                            Fase
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                            Responsável
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                            Prazo
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-[#1e293b]">
                        {fasesDoProjeto.map((fase) => (
                          <tr key={fase.id} className="opacity-60">
                            <td className="px-6 py-3 text-slate-700 dark:text-slate-300 font-medium">{fase.gabarito}</td>
                            <td className="px-6 py-3 text-slate-500">{fase.responsavel}</td>
                            <td className="px-6 py-3 text-slate-500">{fase.status}</td>
                            <td className="px-6 py-3 text-slate-500">
                              {fase.prazoLimite ? new Date(`${fase.prazoLimite}T00:00:00Z`).toLocaleDateString('pt-BR') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Modal de Confirmação: Esvaziar Lixeira */}
      {showEmptyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl relative text-left">
            <button
              onClick={() => setShowEmptyModal(false)}
              disabled={clearingTrash}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center mb-4 text-rose-500">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              {isLojaFiltrada ? `Esvaziar Lixeira da Filial?` : 'Esvaziar Toda a Lixeira?'}
            </h3>

            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
              Você está prestes a apagar permanentemente{' '}
              <strong className="text-slate-900 dark:text-white">
                {projetosAgrupados.length} projeto{projetosAgrupados.length !== 1 ? 's' : ''}
              </strong>{' '}
              e suas{' '}
              <strong className="text-slate-900 dark:text-white">
                {totalFasesVisiveis} etapa{totalFasesVisiveis !== 1 ? 's' : ''}
              </strong>
              {isLojaFiltrada ? (
                <> vinculados à filial <strong className="text-rose-500">{selectedLoja}</strong></>
              ) : null}
              .
            </p>

            <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl mb-5 text-xs text-rose-700 dark:text-rose-300">
              ⚠️ <strong>Atenção:</strong> Todo o histórico de diário de campo, fotos, relatórios e métricas desses projetos serão excluídos em definitivo. Esta ação não poderá ser desfeita.
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowEmptyModal(false)}
                disabled={clearingTrash}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmEmptyTrash}
                disabled={clearingTrash}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-md shadow-rose-900/30 transition-all active:scale-95 disabled:opacity-50"
              >
                {clearingTrash ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Esvaziando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Sim, Esvaziar Agora</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação: Excluir Projeto Específico */}
      {projectToDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl relative text-left">
            <button
              onClick={() => setProjectToDeleteModal(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center mb-4 text-rose-500">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              Excluir Projeto Permanentemente?
            </h3>

            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
              Deseja excluir permanentemente o projeto{' '}
              <strong className="text-slate-900 dark:text-white">&quot;{projectToDeleteModal.nome}&quot;</strong> e todas as suas{' '}
              <strong>{projectToDeleteModal.fasesCount} etapa{projectToDeleteModal.fasesCount !== 1 ? 's' : ''}</strong>?
            </p>

            <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl mb-5 text-xs text-rose-700 dark:text-rose-300">
              ⚠️ Esta operação apagará definitivamente todos os registros, históricos e fotos de campo deste projeto.
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setProjectToDeleteModal(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmHardDeleteProjeto}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-md shadow-rose-900/30 transition-all active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span>Excluir Permanentemente</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
