"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import BackButton from '@/components/BackButton';
import { useToast } from '@/components/Toast';
import { AlertTriangle, ChevronRight, RefreshCcw, Trash2, Inbox, Briefcase, ChevronDown, ChevronUp } from 'lucide-react';
import { FaseAcao } from '../execucao/mockFases';

export default function LixeiraPage() {
  const { success, error: toastError } = useToast();
  const [deletedFases, setDeletedFases] = useState<FaseAcao[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const loadDeleted = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/fases');
      if (res.ok) {
        const { fases } = await res.json();
        setDeletedFases((fases as FaseAcao[]).filter(f => f.isDeleted));
      }
    } catch (e) {
      console.error('[lixeira] Erro ao carregar:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDeleted(); }, [loadDeleted]);

  // ── Auto-refresh: polling 30s + recarga ao focar/visibilidade ─────────
  useEffect(() => {
    let timerId: ReturnType<typeof setInterval> | null = null;
    const REFRESH_MS = 30 * 1000;

    const startPolling = () => {
      if (timerId) return;
      timerId = setInterval(() => {
        if (!loading) loadDeleted();
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
        if (!loading) loadDeleted();
        startPolling();
      } else {
        stopPolling();
      }
    };

    const onFocus = () => {
      if (!loading) loadDeleted();
    };

    startPolling();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadDeleted, loading]);

  // Agrupa fases por projeto/cliente
  const projetosAgrupados = useMemo(() => {
    const mapa: Record<string, FaseAcao[]> = {};
    deletedFases.forEach(f => {
      const key = f.projetoCliente?.trim() || '(Sem projeto)';
      if (!mapa[key]) mapa[key] = [];
      mapa[key].push(f);
    });
    return Object.entries(mapa).sort((a, b) => a[0].localeCompare(b[0]));
  }, [deletedFases]);

  const toggleExpand = (nome: string) => {
    setExpandedProjects(prev => {
      const s = new Set(prev);
      if (s.has(nome)) s.delete(nome); else s.add(nome);
      return s;
    });
  };

  // Restaura todas as fases de um projeto
  const handleRestoreProjeto = async (nomeProjeto: string) => {
    const fasesDoProjeto = projetosAgrupados.find(([n]) => n === nomeProjeto)?.[1] ?? [];
    if (fasesDoProjeto.length === 0) return;

    const ids = fasesDoProjeto.map(f => f.id);
    setLoadingIds(prev => new Set([...prev, ...ids]));
    try {
      const resultados = await Promise.all(
        fasesDoProjeto.map(f =>
          fetch('/api/fases', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: f.id, isDeleted: false }),
          })
        )
      );
      const todasOk = resultados.every(r => r.ok);
      if (todasOk) {
        setDeletedFases(prev => prev.filter(f => !ids.includes(f.id)));
        success(`Projeto "${nomeProjeto}" restaurado com sucesso.`);
      } else {
        toastError('Algumas fases não puderam ser restauradas.');
        await loadDeleted();
      }
    } catch (e) {
      console.error('[lixeira] Erro ao restaurar projeto:', e);
      toastError('Erro ao restaurar o projeto.');
    } finally {
      setLoadingIds(prev => { const s = new Set(prev); ids.forEach(id => s.delete(id)); return s; });
    }
  };

  // Apaga permanentemente todas as fases de um projeto
  const handleHardDeleteProjeto = async (nomeProjeto: string) => {
    const fasesDoProjeto = projetosAgrupados.find(([n]) => n === nomeProjeto)?.[1] ?? [];
    if (fasesDoProjeto.length === 0) return;
    if (!confirm(`Tem certeza que deseja excluir permanentemente o projeto "${nomeProjeto}" e todas as suas ${fasesDoProjeto.length} fase${fasesDoProjeto.length !== 1 ? 's' : ''}? Esta ação não poderá ser desfeita.`)) return;

    const ids = fasesDoProjeto.map(f => f.id);
    setLoadingIds(prev => new Set([...prev, ...ids]));
    try {
      await Promise.all(
        fasesDoProjeto.map(f =>
          fetch(`/api/fases?id=${f.id}&hard=true`, { method: 'DELETE' })
        )
      );
      setDeletedFases(prev => prev.filter(f => !ids.includes(f.id)));
      success(`Projeto "${nomeProjeto}" excluído permanentemente.`);
    } catch (e) {
      console.error('[lixeira] Erro ao deletar projeto:', e);
      toastError('Erro ao excluir o projeto.');
    } finally {
      setLoadingIds(prev => { const s = new Set(prev); ids.forEach(id => s.delete(id)); return s; });
    }
  };

  // Esvazia toda a lixeira
  const handleEmptyTrash = async () => {
    if (deletedFases.length === 0) return;
    if (!confirm(`Deseja esvaziar a lixeira inteira? Isso apagará permanentemente todos os ${projetosAgrupados.length} projeto${projetosAgrupados.length !== 1 ? 's' : ''} e ${deletedFases.length} ação${deletedFases.length !== 1 ? 'ões' : ''}. Esta ação não poderá ser desfeita.`)) return;
    try {
      await Promise.all(deletedFases.map(f => fetch(`/api/fases?id=${f.id}&hard=true`, { method: 'DELETE' })));
      setDeletedFases([]);
      success('Lixeira esvaziada.');
    } catch (e) {
      console.error('[lixeira] Erro ao esvaziar lixeira:', e);
      toastError('Erro ao esvaziar a lixeira.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070c18] text-slate-600 dark:text-slate-300 p-4 md:p-6 lg:p-8 font-sans">

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400 mb-2">
            <BackButton />
            <span>Portal</span><ChevronRight className="w-4 h-4" />
            <span>Irrigação</span><ChevronRight className="w-4 h-4" />
            <span className="text-rose-600 dark:text-rose-400 font-medium">Lixeira</span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <Trash2 className="w-7 h-7 text-rose-500" />Lixeira de Projetos
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            Projetos removidos do painel. Restaure o projeto inteiro ou exclua permanentemente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ThemeToggle /><LogoutButton />
          <button
            onClick={handleEmptyTrash}
            disabled={deletedFases.length === 0}
            className="w-full md:w-auto flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-rose-900/20 text-sm"
          >
            <AlertTriangle className="w-4 h-4" />Esvaziar Lixeira
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {loading && (
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-12 text-center text-slate-500">
            <span className="inline-block w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mb-3" />
            <p className="text-sm">Carregando lixeira...</p>
          </div>
        )}

        {!loading && projetosAgrupados.length === 0 && (
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-16 text-center text-slate-500 dark:text-slate-400">
            <Inbox className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">A lixeira está vazia</h3>
            <p className="text-sm mt-1">Nenhum projeto foi removido recentemente.</p>
          </div>
        )}

        {!loading && projetosAgrupados.map(([nomeProjeto, fasesDoProjeto]) => {
          const isExpanded = expandedProjects.has(nomeProjeto);
          const isLoadingProjeto = fasesDoProjeto.some(f => loadingIds.has(f.id));

          return (
            <div key={nomeProjeto} className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl overflow-hidden shadow-lg shadow-black/10">

              {/* Cabeçalho do projeto */}
              <div className="flex items-center gap-4 p-5">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
                  <Briefcase className="w-5 h-5 text-rose-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 dark:text-white truncate">{nomeProjeto}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {fasesDoProjeto.length} fase{fasesDoProjeto.length !== 1 ? 's' : ''} removida{fasesDoProjeto.length !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Ações do projeto */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleRestoreProjeto(nomeProjeto)}
                    disabled={isLoadingProjeto}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors font-medium text-xs border border-emerald-200 dark:border-emerald-800 disabled:opacity-50"
                  >
                    <RefreshCcw className={`w-3.5 h-3.5 ${isLoadingProjeto ? 'animate-spin' : ''}`} />
                    Restaurar Projeto
                  </button>
                  <button
                    onClick={() => handleHardDeleteProjeto(nomeProjeto)}
                    disabled={isLoadingProjeto}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors font-medium text-xs border border-rose-200 dark:border-rose-800 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Excluir Permanentemente
                  </button>
                  <button
                    onClick={() => toggleExpand(nomeProjeto)}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1e293b] text-slate-400 transition-colors"
                    title={isExpanded ? 'Recolher fases' : 'Ver fases'}
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Fases do projeto (expandível) */}
              {isExpanded && (
                <div className="border-t border-slate-100 dark:border-[#1e293b]">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-[#0b1329]">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Fase</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Responsável</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Prazo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#1e293b]">
                      {fasesDoProjeto.map(fase => (
                        <tr key={fase.id} className="opacity-60">
                          <td className="px-6 py-3 text-slate-700 dark:text-slate-300">{fase.gabarito}</td>
                          <td className="px-6 py-3 text-slate-500">{fase.responsavel}</td>
                          <td className="px-6 py-3 text-slate-500">{fase.status}</td>
                          <td className="px-6 py-3 text-slate-500">
                            {new Date(`${fase.prazoLimite}T00:00:00Z`).toLocaleDateString('pt-BR')}
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
    </div>
  );
}
