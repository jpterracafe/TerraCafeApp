"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import BackButton from '@/components/BackButton';
import { useToast } from '@/components/Toast';
import { ChevronRight, RefreshCcw, Trash2, Archive, Briefcase, ChevronDown, ChevronUp, CalendarCheck } from 'lucide-react';
import { FaseAcao } from '../execucao/mockFases';
import { offlineFetch } from '@/lib/offline';
import { useLoja } from '@/contexts/LojaContext';
import LojaSelector from '@/components/LojaSelector';

interface ProjetoConcluido {
  nome: string;
  prazoFinal: string;
  concluidoEm: string | null;
  criador: { email?: string; nome?: string } | null;
}

function formatData(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(`${value}T00:00:00`);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

function formatConcluidoEm(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ProjetosConcluidosPage() {
  const { success, error: toastError } = useToast();
  const { isProjectInSelectedLoja, projetosLojas } = useLoja();
  const [projetosInfo, setProjetosInfo] = useState<ProjetoConcluido[]>([]);
  const [fasesConcluidas, setFasesConcluidas] = useState<FaseAcao[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const loadConcluidos = useCallback(async () => {
    setLoading(true);
    try {
      const [resProjetos, resFases] = await Promise.all([
        offlineFetch('/api/projetos?concluidos=true&detalhado=true'),
        offlineFetch('/api/fases'),
      ]);

      const nomesConcluidos = new Set<string>();
      if (resProjetos.ok) {
        const data = await resProjetos.json();
        const lista = (data?.projetos || []) as ProjetoConcluido[];
        setProjetosInfo(lista);
        lista.forEach(p => nomesConcluidos.add(p.nome));
      } else {
        setProjetosInfo([]);
      }

      if (resFases.ok) {
        const { fases } = await resFases.json();
        setFasesConcluidas(
          (fases as FaseAcao[]).filter(
            f => !f.isDeleted && f.projetoCliente && nomesConcluidos.has(f.projetoCliente)
          )
        );
      } else {
        setFasesConcluidas([]);
      }
    } catch (e) {
      console.error('[concluidos] Erro ao carregar:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConcluidos(); }, [loadConcluidos]);

  // ── Auto-refresh: polling 30s + recarga ao focar/visibilidade ─────────
  useEffect(() => {
    let timerId: ReturnType<typeof setInterval> | null = null;
    const REFRESH_MS = 30 * 1000;

    const startPolling = () => {
      if (timerId) return;
      timerId = setInterval(() => {
        if (!loading) loadConcluidos();
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
        if (!loading) loadConcluidos();
        startPolling();
      } else {
        stopPolling();
      }
    };

    const onFocus = () => {
      if (!loading) loadConcluidos();
    };

    startPolling();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadConcluidos, loading]);

  const fasesPorProjeto = useMemo(() => {
    const mapa: Record<string, FaseAcao[]> = {};
    fasesConcluidas.forEach(f => {
      const key = f.projetoCliente?.trim() || '(Sem projeto)';
      if (!mapa[key]) mapa[key] = [];
      mapa[key].push(f);
    });
    return mapa;
  }, [fasesConcluidas]);

  const toggleExpand = (nome: string) => {
    setExpandedProjects(prev => {
      const s = new Set(prev);
      if (s.has(nome)) s.delete(nome); else s.add(nome);
      return s;
    });
  };

  // Reabre o projeto (volta para a lista ativa de projetos)
  const handleReabrirProjeto = async (nomeProjeto: string) => {
    const fasesDoProjeto = fasesPorProjeto[nomeProjeto] || [];
    const ids = fasesDoProjeto.map(f => f.id);
    setLoadingIds(prev => new Set([...prev, ...(ids.length ? ids : [nomeProjeto])]));
    try {
      const res = await offlineFetch('/api/projetos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeProjeto, concluido: false }),
      });
      if (!res.ok) throw new Error('Erro na API ao reabrir projeto.');

      setFasesConcluidas(prev => prev.filter(f => f.projetoCliente !== nomeProjeto));
      setProjetosInfo(prev => prev.filter(p => p.nome !== nomeProjeto));
      success(`Projeto "${nomeProjeto}" reaberto e voltou para a lista ativa.`);
    } catch (e) {
      console.error('[concluidos] Erro ao reabrir projeto:', e);
      toastError('Erro ao reabrir o projeto.');
    } finally {
      setLoadingIds(prev => {
        const s = new Set(prev);
        (ids.length ? ids : [nomeProjeto]).forEach(id => s.delete(id));
        return s;
      });
    }
  };

  // Envia para a lixeira (soft delete). O projeto continua na lixeira até ser restaurado/excluído.
  const handleEnviarLixeira = async (nomeProjeto: string) => {
    if (!confirm(`Deseja enviar o projeto concluído "${nomeProjeto}" para a Lixeira de Projetos? Ele pode ser restaurado depois.`)) return;

    const fasesDoProjeto = fasesPorProjeto[nomeProjeto] || [];
    const ids = fasesDoProjeto.map(f => f.id);
    setLoadingIds(prev => new Set([...prev, ...(ids.length ? ids : [nomeProjeto])]));
    try {
      const res = await offlineFetch(`/api/projetos?nome=${encodeURIComponent(nomeProjeto)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro na API ao mover para a lixeira.');

      setFasesConcluidas(prev => prev.filter(f => f.projetoCliente !== nomeProjeto));
      setProjetosInfo(prev => prev.filter(p => p.nome !== nomeProjeto));
      success(`Projeto "${nomeProjeto}" movido para a Lixeira de Projetos.`);
    } catch (e) {
      console.error('[concluidos] Erro ao enviar para lixeira:', e);
      toastError('Erro ao mover o projeto para a lixeira.');
    } finally {
      setLoadingIds(prev => {
        const s = new Set(prev);
        (ids.length ? ids : [nomeProjeto]).forEach(id => s.delete(id));
        return s;
      });
    }
  };

  const projetosFiltrados = useMemo(() => {
    return projetosInfo.filter(p => isProjectInSelectedLoja(p.nome, p.criador?.email));
  }, [projetosInfo, isProjectInSelectedLoja]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070c18] text-slate-600 dark:text-slate-300 p-4 md:p-6 lg:p-8 font-sans">

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400 mb-2">
            <BackButton />
            <span>Portal</span><ChevronRight className="w-4 h-4" />
            <span>Irrigação</span><ChevronRight className="w-4 h-4" />
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">Projetos Concluídos</span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <Archive className="w-7 h-7 text-emerald-500" />Projetos Concluídos
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            Projetos finalizados. Reabra o projeto se alguma fase precisar voltar ao acompanhamento.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LojaSelector />
          <ThemeToggle /><LogoutButton />
        </div>
      </div>

      <div className="space-y-4">
        {loading && (
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-12 text-center text-slate-500">
            <span className="inline-block w-6 h-6 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin mb-3" />
            <p className="text-sm">Carregando projetos concluídos...</p>
          </div>
        )}

        {!loading && projetosFiltrados.length === 0 && (
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-16 text-center text-slate-500 dark:text-slate-400">
            <Archive className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Nenhum projeto concluído</h3>
            <p className="text-sm mt-1">Quando finalizar todas as fases, use o botão &quot;Concluir Projeto&quot; no Diário de Campo.</p>
          </div>
        )}

        {!loading && projetosFiltrados.map(projeto => {
          const nomeProjeto = projeto.nome;
          const isExpanded = expandedProjects.has(nomeProjeto);
          const fasesDoProjeto = fasesPorProjeto[nomeProjeto] || [];
          const isLoadingProjeto = fasesDoProjeto.some(f => loadingIds.has(f.id)) || loadingIds.has(nomeProjeto);

          return (
            <div key={nomeProjeto} className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl overflow-hidden shadow-lg shadow-black/5">

              {/* Cabeçalho do projeto */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <Briefcase className="w-5 h-5 text-emerald-400" />
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
                  <p className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="inline-flex items-center gap-1">
                      <CalendarCheck className="w-3 h-3" />
                      Concluído em {formatConcluidoEm(projeto.concluidoEm)}
                    </span>
                    {projeto.prazoFinal && (
                      <span>
                        Prazo final: <strong className="text-slate-500 dark:text-slate-300">{formatData(projeto.prazoFinal)}</strong>
                      </span>
                    )}
                    {projeto.criador?.nome && (
                      <span>Criador: {projeto.criador.nome}</span>
                    )}
                  </p>
                </div>

                {/* Ações do projeto */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <button
                    onClick={() => handleReabrirProjeto(nomeProjeto)}
                    disabled={isLoadingProjeto}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors font-medium text-xs border border-emerald-200 dark:border-emerald-800 disabled:opacity-50"
                  >
                    <RefreshCcw className={`w-3.5 h-3.5 ${isLoadingProjeto ? 'animate-spin' : ''}`} />
                    Reabrir Projeto
                  </button>
                  <button
                    onClick={() => handleEnviarLixeira(nomeProjeto)}
                    disabled={isLoadingProjeto}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors font-medium text-xs border border-rose-200 dark:border-rose-800 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Enviar à Lixeira
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
                <div className="border-t border-slate-100 dark:border-[#1e293b] overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
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
                        <tr key={fase.id}>
                          <td className="px-6 py-3 text-slate-700 dark:text-slate-300 capitalize">{fase.gabarito}</td>
                          <td className="px-6 py-3 text-slate-500">{fase.responsavel}</td>
                          <td className="px-6 py-3 text-slate-500">{fase.status}</td>
                          <td className="px-6 py-3 text-slate-500">{formatData(fase.prazoLimite)}</td>
                        </tr>
                      ))}
                      {fasesDoProjeto.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-4 text-center text-xs text-slate-400">
                            Nenhuma fase encontrada para este projeto.
                          </td>
                        </tr>
                      )}
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