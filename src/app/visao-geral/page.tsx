"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import {
  Search, CheckCircle2, AlertCircle, Clock,
  Calendar, Users, RefreshCw, FileText, Loader2, Tv,
  AlertTriangle, ShieldAlert, Activity,
  Layers, ArrowUpRight, TrendingUp, ChevronDown, LayoutGrid, List
} from 'lucide-react';
import { EtapaCampo, RegistroDiarioCampo } from '../irrigacao/types';
import { extractProjectBaseName, getProjectVersion } from '../irrigacao/execucao/page';

interface JustificativaItem {
  id: string;
  data: string;
  autor: string;
  motivo: string;
  observacao: string;
}

interface SystemConfigResponse {
  configEtapas: Record<string, { dataInicio: string; metaDias: number; prazoLimite?: string; status?: string }>;
  projetoStartDates: Record<string, string>;
  responsaveisPorEtapa: Record<string, string[]>;
  projetosPrazoFinal: Record<string, string>;
  projetoJustificativas: Record<string, JustificativaItem[]>;
  etapasProgresso: Record<string, number>;
  etapasStatus: Record<string, string>;
}

// As 6 Fases Oficiais do Sistema de Irrigação
const ETAPAS_OFICIAIS: { key: EtapaCampo; label: string; icon: string; desc: string; order: number }[] = [
  { key: 'Valetas',                     label: 'Valetas',                     icon: '⛏️', desc: 'Abertura e nivelamento de valas', order: 1 },
  { key: 'montagem campo',              label: 'Montagem Campo',              icon: '🌱', desc: 'Tubulações, gotejadores e conexões', order: 2 },
  { key: 'casa de bombas',              label: 'Casa de Bombas',              icon: '⚙️', desc: 'Bombas, filtros e cabeçal de controle', order: 3 },
  { key: 'elétrica',                    label: 'Elétrica',                    icon: '⚡', desc: 'Quadros elétricos e automação', order: 4 },
  { key: 'lavagem do sistema e testes',  label: 'Lavagem & Testes',            icon: '💧', desc: 'Limpeza, teste de pressão e estanqueidade', order: 5 },
  { key: 'entrega técnica',             label: 'Entrega Técnica',             icon: '📋', desc: 'Checklist final e entrega ao cliente', order: 6 },
];

export default function VisaoGeralDiretorPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [horaAtual, setHoraAtual] = useState<string>('');

  // Modo TV
  const [modoTV, setModoTV] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [projetosList, setProjetosList] = useState<string[]>([]);
  const [config, setConfig] = useState<SystemConfigResponse>({
    configEtapas: {},
    projetoStartDates: {},
    responsaveisPorEtapa: {},
    projetosPrazoFinal: {},
    projetoJustificativas: {},
    etapasProgresso: {},
    etapasStatus: {},
  });

  const [fases, setFases] = useState<any[]>([]);
  const [diarioLogs, setDiarioLogs] = useState<RegistroDiarioCampo[]>([]);

  // Filtros
  const [search, setSearch] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'atrasado' | 'em_andamento' | 'concluido'>('todos');

  // Atualiza relógio do Modo TV a cada segundo
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setHoraAtual(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Carrega dados consolidados
  const carregarDados = useCallback(async () => {
    try {
      const [resProj, resConfig, resFases, resLogs] = await Promise.all([
        fetch('/api/projetos').then(r => r.ok ? r.json() : { projetos: [] }),
        fetch('/api/etapas-config').then(r => r.ok ? r.json() : null),
        fetch('/api/fases').then(r => r.ok ? r.json() : { fases: [] }),
        fetch('/api/diario-logs').then(r => r.ok ? r.json() : { logs: [] }),
      ]);

      setProjetosList(resProj.projetos ?? []);
      if (resConfig) {
        setConfig(resConfig);
      }
      setFases(resFases.fases ?? []);
      setDiarioLogs(resLogs.logs ?? []);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('[visao-geral] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Auto-refresh: 20s no Modo TV / 30s no modo normal
  useEffect(() => {
    let timerId: ReturnType<typeof setInterval> | null = null;
    const REFRESH_MS = modoTV ? 20 * 1000 : 30 * 1000;

    const startPolling = () => {
      if (timerId) return;
      timerId = setInterval(() => {
        if (!loading && !refreshing) carregarDados();
      }, REFRESH_MS);
    };

    const stopPolling = () => {
      if (timerId) { clearInterval(timerId); timerId = null; }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!loading && !refreshing) carregarDados();
        startPolling();
      } else {
        stopPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [carregarDados, loading, refreshing, modoTV]);

  const handleRefresh = () => {
    setRefreshing(true);
    carregarDados();
  };

  const toggleModoTV = () => {
    if (!modoTV) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      setModoTV(true);
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setModoTV(false);
    }
  };

  // Processa dados de cada projeto para a tela executiva da Diretoria
  const projetosProcessados = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    return projetosList.map(nomeProjeto => {
      const prazoFinal = config.projetosPrazoFinal[nomeProjeto] || '';
      const dataInicio = config.projetoStartDates[nomeProjeto] || '';
      const justificativas = config.projetoJustificativas[nomeProjeto] || [];

      // Cálculos de prazo final do projeto total
      let diasRestantes = 0;
      let atrasado = false;
      let prazoFormatado = 'Não definido';

      if (prazoFinal) {
        const dPrazo = new Date(`${prazoFinal}T00:00:00`);
        prazoFormatado = dPrazo.toLocaleDateString('pt-BR');
        dPrazo.setHours(0, 0, 0, 0);
        const diffMs = dPrazo.getTime() - hoje.getTime();
        diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        atrasado = diasRestantes < 0;
      }

      // Detalhamento das 6 fases individuais
      let somaProgresso = 0;
      let qtdFasesAtrasadas = 0;
      let qtdFasesConcluidas = 0;
      let qtdFasesEmAndamento = 0;

      const fasesDetalhadas = ETAPAS_OFICIAIS.map(et => {
        const chaveEtapa = `${nomeProjeto}::${et.key}`;
        const respConfig = config.responsaveisPorEtapa[chaveEtapa] || [];
        
        const respFasesAcao = fases.filter(f =>
          !f.isDeleted &&
          f.projetoCliente &&
          f.projetoCliente.trim() === nomeProjeto.trim() &&
          f.responsavel &&
          f.responsavel.trim() &&
          f.responsavel.trim() !== 'Não atribuído'
        ).map(f => f.responsavel.trim());

        const logsEtapa = diarioLogs.filter(l =>
          l.projetoCliente &&
          l.projetoCliente.trim() === nomeProjeto.trim() &&
          l.atividade &&
          (l.atividade.trim().toLowerCase() === et.key.toLowerCase() ||
           l.atividade.trim().toLowerCase().includes(et.key.toLowerCase()) ||
           et.key.toLowerCase().includes(l.atividade.trim().toLowerCase()))
        ).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

        const respDiarioLogs = logsEtapa
          .flatMap(l => (l.responsavel || '').split(',').map((r: string) => r.trim()))
          .filter(Boolean);

        let todosResponsaveis = Array.from(
          new Set([
            ...respConfig.map(r => (r || '').trim()).filter(Boolean),
            ...respFasesAcao,
            ...respDiarioLogs,
          ])
        ).filter(Boolean);

        // Se houver responsáveis reais, remove a tag "Administrador" genérica
        if (todosResponsaveis.length > 1 && todosResponsaveis.includes('Administrador')) {
          todosResponsaveis = todosResponsaveis.filter(r => r !== 'Administrador');
        }

        const responsaveis = todosResponsaveis.sort((a, b) => a.localeCompare(b, 'pt-BR'));

        // Detecção de início e prazos
        const cfgFase = config.configEtapas[chaveEtapa];
        const hasStarted = !!cfgFase?.dataInicio || logsEtapa.length > 0;
        const dataInicioFase = cfgFase?.dataInicio || (logsEtapa.length > 0 ? logsEtapa[logsEtapa.length - 1].data : '');
        const metaDiasFase = cfgFase?.metaDias || 20;

        let prazoLimiteFase = cfgFase?.prazoLimite || '';
        if (!prazoLimiteFase && hasStarted && dataInicioFase) {
          const dIni = new Date(`${dataInicioFase}T00:00:00`);
          dIni.setDate(dIni.getDate() + metaDiasFase);
          prazoLimiteFase = dIni.toISOString().split('T')[0];
        }

        // ── CÁLCULO DE PROGRESSO (%) ─────────────────────────────────────
        // P1: valor manual do campo (agricultor) → prevalece sempre
        // P2: conclusão explícita → 100%
        // P3: temporal puro = diasDecorridos/metaDias (sem cap artificial)
        // Se passou o prazo sem manual → "Prazo Estourado"
        const hasConcluidoLog = logsEtapa.some(l => 
          (l.status || '').toLowerCase().includes('concluído') || 
          (l.status || '').toLowerCase().includes('concluido')
        );

        let pctProgresso = 0;
        let prazoBloqueado = false; // true quando passou o tempo sem conclusão manual

        // Prioridade 1: Valor manual salvo pelo agricultor no diário
        if (config.etapasProgresso && typeof config.etapasProgresso[chaveEtapa] === 'number') {
          pctProgresso = config.etapasProgresso[chaveEtapa];
        }
        // Prioridade 2: Conclusão explícita (botão "Concluir Fase")
        else if (hasConcluidoLog || config.etapasStatus[chaveEtapa] === 'Concluída') {
          pctProgresso = 100;
        }
        // Prioridade 3: Temporal puro — avança conforme os dias decorrem
        else if (hasStarted && dataInicioFase) {
          const dIni = new Date(`${dataInicioFase}T00:00:00`);
          dIni.setHours(0, 0, 0, 0);
          const diasDecorridos = Math.max(0, Math.floor((hoje.getTime() - dIni.getTime()) / (1000 * 60 * 60 * 24)));
          const pct = Math.round((diasDecorridos / Math.max(1, metaDiasFase)) * 100);

          if (pct >= 100) {
            // Passou o prazo sem conclusão manual → trava em 99% e sinaliza
            pctProgresso = 99;
            prazoBloqueado = true;
          } else {
            pctProgresso = pct;
          }
        }

        somaProgresso += pctProgresso;

        let diasRestantesFase = 0;
        let atrasadaFase = false;
        let prazoFaseFormatado = 'Não iniciado';
        let diasAtraso = 0;

        if (hasStarted && prazoLimiteFase) {
          const dFim = new Date(`${prazoLimiteFase}T00:00:00`);
          dFim.setHours(0, 0, 0, 0);
          prazoFaseFormatado = dFim.toLocaleDateString('pt-BR');
          diasRestantesFase = Math.ceil((dFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          atrasadaFase = diasRestantesFase < 0 && pctProgresso < 100;
          if (atrasadaFase) {
            diasAtraso = Math.abs(diasRestantesFase);
            qtdFasesAtrasadas++;
          }
        }

        let status = 'Não iniciada';
        if (pctProgresso >= 100) {
          status = 'Concluída';
          qtdFasesConcluidas++;
        } else if (atrasadaFase) {
          status = 'Atrasada';
        } else if (hasStarted) {
          status = 'Em andamento';
          qtdFasesEmAndamento++;
        }

        return {
          ...et,
          responsaveis,
          progresso: pctProgresso,
          hasStarted,
          dataInicioFase,
          prazoLimiteFase,
          prazoFaseFormatado,
          metaDiasFase,
          diasRestantesFase,
          atrasadaFase,
          diasAtraso,
          status,
          totalLogs: logsEtapa.length,
          prazoBloqueado,
        };
      });

      const progressoGeral = Math.round(somaProgresso / ETAPAS_OFICIAIS.length);
      const concluidoGeral = progressoGeral >= 100;
      const temAtraso = atrasado || qtdFasesAtrasadas > 0;

      return {
        nome: nomeProjeto,
        baseName: extractProjectBaseName(nomeProjeto),
        versao: getProjectVersion(nomeProjeto),
        prazoFinal,
        prazoFormatado,
        dataInicio,
        diasRestantes,
        atrasado,
        qtdFasesAtrasadas,
        qtdFasesConcluidas,
        qtdFasesEmAndamento,
        temAtraso,
        concluidoGeral,
        progressoGeral,
        justificativas,
        fases: fasesDetalhadas,
      };
    });
  }, [projetosList, config, fases, diarioLogs]);

  // Lista unificada de Fases em Atraso para alerta conciso
  const todasFasesAtrasadas = useMemo(() => {
    const list: Array<{
      projetoNome: string;
      baseName: string;
      versao: string;
      etapaKey: string;
      etapaLabel: string;
      etapaIcon: string;
      etapaOrder: number;
      responsaveis: string[];
      diasAtraso: number;
      prazoFormatado: string;
      progresso: number;
    }> = [];

    projetosProcessados.forEach(p => {
      p.fases.forEach(f => {
        if (f.atrasadaFase && f.progresso < 100) {
          list.push({
            projetoNome: p.nome,
            baseName: p.baseName,
            versao: p.versao,
            etapaKey: f.key,
            etapaLabel: f.label,
            etapaIcon: f.icon,
            etapaOrder: f.order,
            responsaveis: f.responsaveis.length > 0 ? f.responsaveis : ['Equipe Técnica'],
            diasAtraso: f.diasAtraso,
            prazoFormatado: f.prazoFaseFormatado,
            progresso: f.progresso,
          });
        }
      });
    });

    return list.sort((a, b) => b.diasAtraso - a.diasAtraso);
  }, [projetosProcessados]);

  // Filtros aplicados na lista de projetos
  const projetosFiltrados = useMemo(() => {
    return projetosProcessados.filter(p => {
      const matchBusca = p.nome.toLowerCase().includes(search.toLowerCase()) ||
        p.fases.some(f => f.responsaveis.some(r => r.toLowerCase().includes(search.toLowerCase())));
      if (!matchBusca) return false;

      if (filtroStatus === 'concluido') return p.concluidoGeral;
      if (filtroStatus === 'atrasado') return p.temAtraso && !p.concluidoGeral;
      if (filtroStatus === 'em_andamento') return !p.concluidoGeral && !p.temAtraso;
      return true;
    });
  }, [projetosProcessados, search, filtroStatus]);

  // KPIs Gerais Sucintos
  const statsGerais = useMemo(() => {
    const totalProjetos = projetosProcessados.length;
    const concluidos = projetosProcessados.filter(p => p.concluidoGeral).length;
    const comAtraso = projetosProcessados.filter(p => p.temAtraso && !p.concluidoGeral).length;
    const emDia = totalProjetos - concluidos - comAtraso;
    const totalFasesAtrasadas = todasFasesAtrasadas.length;

    let somaProgressoTotal = 0;
    projetosProcessados.forEach(p => { somaProgressoTotal += p.progressoGeral; });
    const progressoMedioGeral = totalProjetos > 0 ? Math.round(somaProgressoTotal / totalProjetos) : 0;

    return {
      totalProjetos,
      concluidos,
      comAtraso,
      emDia,
      totalFasesAtrasadas,
      progressoMedioGeral,
    };
  }, [projetosProcessados, todasFasesAtrasadas]);


  // Estado de expansão individual dos projetos e modo de visualização
  const [projetosExpandidos, setProjetosExpandidos] = useState<Set<string>>(new Set());
  const [modoView, setModoView] = useState<'resumido' | 'detalhado'>('resumido');

  const toggleExpansao = (nomeProjeto: string) => {
    setProjetosExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(nomeProjeto)) next.delete(nomeProjeto);
      else next.add(nomeProjeto);
      return next;
    });
  };

  return (
    <div
      ref={scrollContainerRef}
      className={`min-h-screen bg-[#f8fafc] dark:bg-[#070c18] text-slate-900 dark:text-slate-100 font-sans transition-colors ${
        modoTV ? 'p-4 md:p-6 overflow-y-auto' : 'p-4 md:p-8'
      }`}
    >
      {/* ── Topbar Executiva & Controles ────────────────────────────────── */}
      <header className="max-w-7xl mx-auto mb-6 bg-white/90 dark:bg-[#0d1527]/90 backdrop-blur-md p-4 md:p-5 rounded-2xl border border-slate-200 dark:border-[#1e293b] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              Painel Executivo
            </span>
            <span className="text-xs text-slate-400">• {lastUpdate.toLocaleTimeString('pt-BR')}</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
            📊 Visão Geral das Obras
          </h1>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Fases, responsáveis e progresso. O % de cada fase é atualizado pela equipe no Diário de Campo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {horaAtual && (
            <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#16203a] border border-slate-200 dark:border-[#1e293b] text-xs font-mono font-bold text-slate-700 dark:text-slate-200">
              🕒 {horaAtual}
            </div>
          )}

          <button
            onClick={toggleModoTV}
            className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all ${
              modoTV
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                : 'bg-slate-100 dark:bg-[#16203a] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#1e293b]'
            }`}
            title="Alternar Modo TV"
          >
            <Tv className="w-3.5 h-3.5" />
            <span>{modoTV ? 'Sair TV' : 'Modo TV'}</span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#16203a] hover:bg-slate-200 dark:hover:bg-[#1f2d4e] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#1e293b] flex items-center gap-1.5 transition-all"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            onClick={() => router.push('/irrigacao/execucao')}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#16203a] hover:bg-slate-200 dark:hover:bg-[#1f2d4e] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#1e293b] flex items-center gap-1.5 transition-all"
          >
            <Layers className="w-3.5 h-3.5 text-blue-500" />
            <span>Painel Operacional</span>
          </button>

          <button
            onClick={() => router.push('/irrigacao/diario-campo')}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex items-center gap-1.5 transition-all"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Diário de Campo</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-4">

        {/* ── Alertas de Fases em Atraso (se houver) ────────────────────── */}
        {todasFasesAtrasadas.length > 0 && (
          <div className="bg-rose-500/10 dark:bg-rose-950/20 border-2 border-rose-500/40 dark:border-rose-500/30 rounded-2xl p-3.5 md:p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 animate-bounce" />
                <h3 className="text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  {todasFasesAtrasadas.length} {todasFasesAtrasadas.length === 1 ? 'Fase em Atraso' : 'Fases em Atraso'} — Atenção Imediata
                </h3>
              </div>
              <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/15 px-2.5 py-1 rounded-full border border-rose-500/30 shrink-0">
                Cobrança de Prazos
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {todasFasesAtrasadas.map((item, idx) => (
                <div
                  key={`${item.projetoNome}-${item.etapaKey}-${idx}`}
                  className="bg-white dark:bg-[#0d1527] border border-rose-500/30 rounded-xl p-4 flex flex-col gap-3"
                >
                  {/* Topo: ícone + info + badge de atraso */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <span className="text-xl shrink-0 mt-0.5">{item.etapaIcon}</span>
                      <div className="min-w-0">
                        <span className="font-black text-sm text-slate-900 dark:text-white block truncate">{item.baseName}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 block">
                          {item.etapaOrder}. {item.etapaLabel}
                        </span>
                        {item.responsaveis.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.responsaveis.map((r, i) => (
                              <span key={i} className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700">
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="px-3 py-1.5 rounded-xl text-sm font-black bg-rose-600 text-white shrink-0 shadow-sm">
                      +{item.diasAtraso}d
                    </span>
                  </div>

                  {/* Barra de conclusão */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className="text-slate-500 dark:text-slate-400 font-semibold">Conclusão da fase</span>
                      <span className="font-black text-rose-600 dark:text-rose-400">{item.progresso}%</span>
                    </div>
                    <div className="w-full h-2 bg-rose-100 dark:bg-rose-950/30 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-rose-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, item.progresso)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Barra de controles: busca + filtro + toggle modo ──────────── */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Busca */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar obra ou responsável..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          {/* Filtro status */}
          <div className="flex items-center gap-1 bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-1 flex-shrink-0">
            {([
              { id: 'todos', label: 'Todas' },
              { id: 'atrasado', label: '🚨 Atraso' },
              { id: 'em_andamento', label: '⏳ Em Dia' },
              { id: 'concluido', label: '✅ Concluídas' },
            ] as const).map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltroStatus(f.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filtroStatus === f.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Toggle Resumido / Detalhado */}
          <div className="flex items-center gap-1 bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-1 ml-auto shrink-0">
            <button
              type="button"
              onClick={() => setModoView('resumido')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                modoView === 'resumido' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Modo Resumido: cards compactos lado a lado"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Resumido
            </button>
            <button
              type="button"
              onClick={() => setModoView('detalhado')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                modoView === 'detalhado' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Modo Detalhado: tabela completa de fases"
            >
              <List className="w-3.5 h-3.5" />
              Detalhado
            </button>
          </div>
        </div>

        {/* ── Lista de Obras ──────────────────────────────────────────────── */}
        {loading ? (
          <div className="text-center py-20 bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-500">Carregando visão executiva das obras...</p>
          </div>
        ) : projetosFiltrados.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl">
            <Layers className="w-10 h-10 text-slate-400 mx-auto mb-2 opacity-40" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Nenhuma obra encontrada</h3>
            <p className="text-xs text-slate-500 mt-0.5">Tente ajustar o filtro ou o termo de busca.</p>
          </div>
        ) : modoView === 'resumido' ? (
          /* ── MODO RESUMIDO: grid de cards compactos ──────────────────── */
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {projetosFiltrados.map((proj) => {
              const expandido = projetosExpandidos.has(proj.nome);
              return (
                <div
                  key={proj.nome}
                  className={`bg-white dark:bg-[#0d1527] rounded-2xl border shadow-sm transition-all overflow-hidden ${
                    proj.temAtraso ? 'border-rose-500/40' :
                    proj.concluidoGeral ? 'border-emerald-500/40' :
                    'border-slate-200 dark:border-[#1e293b]'
                  }`}
                >
                  {/* Cabeçalho clicável do card */}
                  <button
                    type="button"
                    onClick={() => toggleExpansao(proj.nome)}
                    className="w-full text-left p-4 hover:bg-slate-50/70 dark:hover:bg-[#111a30]/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {/* Nome + badges */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                          {proj.versao !== 'V0' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-slate-200 dark:bg-[#16203a] text-slate-600 dark:text-slate-400 shrink-0">
                              {proj.versao}
                            </span>
                          )}
                          <h2 className="text-sm font-black text-slate-900 dark:text-white truncate">
                            {proj.baseName}
                          </h2>
                          {proj.atrasado && !proj.concluidoGeral && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-600 text-white shrink-0 animate-pulse">
                              🚨 Vencido
                            </span>
                          )}
                          {proj.concluidoGeral && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-600 text-white shrink-0">
                              ✅ Concluída
                            </span>
                          )}
                        </div>

                        {/* Prazo */}
                        <p className={`text-[11px] font-semibold mb-3 ${
                          proj.atrasado ? 'text-rose-500' : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {proj.prazoFormatado !== 'Não definido'
                            ? proj.atrasado
                              ? `⚠️ Venceu há ${Math.abs(proj.diasRestantes)}d — Prazo: ${proj.prazoFormatado}`
                              : `Prazo: ${proj.prazoFormatado} (${proj.diasRestantes}d restantes)`
                            : 'Prazo não definido'}
                        </p>

                        {/* Barra de progresso geral */}
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${
                                proj.concluidoGeral ? 'bg-emerald-500' :
                                proj.temAtraso ? 'bg-rose-500' : 'bg-indigo-500'
                              }`}
                              style={{ width: `${proj.progressoGeral}%` }}
                            />
                          </div>
                          <span className={`text-sm font-black shrink-0 ${
                            proj.concluidoGeral ? 'text-emerald-600 dark:text-emerald-400' :
                            proj.temAtraso ? 'text-rose-600 dark:text-rose-400' :
                            'text-slate-900 dark:text-white'
                          }`}>
                            {proj.progressoGeral}%
                          </span>
                        </div>

                        {/* Bollhas de status das 6 fases */}
                        <div className="flex items-center gap-1 flex-wrap">
                          {proj.fases.map(fase => (
                            <div
                              key={fase.key}
                              title={`${fase.label}: ${fase.prazoBloqueado ? '⚠️ Prazo Estourado' : fase.progresso + '%'} ${fase.status}`}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                fase.progresso >= 100
                                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                                  : fase.prazoBloqueado
                                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-700 dark:text-rose-300 animate-pulse'
                                  : fase.atrasadaFase
                                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400'
                                  : fase.hasStarted
                                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
                                  : 'bg-slate-100 dark:bg-slate-800/50 border-slate-300 dark:border-slate-700 text-slate-400'
                              }`}
                            >
                              <span>{fase.icon}</span>
                              <span>{fase.prazoBloqueado ? '⚠️' : `${fase.progresso}%`}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Seta */}
                      <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 mt-0.5 transition-transform duration-200 ${expandido ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* Detalhe expandido */}
                  {expandido && (
                    <div className="border-t border-slate-100 dark:border-[#1e293b]">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50/80 dark:bg-[#0a1020]/60 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-[#1e293b]">
                              <th className="py-2 px-3">Fase</th>
                              <th className="py-2 px-3">Responsável(is)</th>
                              <th className="py-2 px-3 text-center">%</th>
                              <th className="py-2 px-3 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-[#1e293b] text-xs">
                            {proj.fases.map(fase => {
                              const isConcluida = fase.progresso >= 100;
                              const isAtrasada = fase.atrasadaFase;
                              return (
                                <tr key={fase.key} className={`${isAtrasada ? 'bg-rose-500/[0.03]' : ''}`}>
                                  <td className="py-2 px-3">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm">{fase.icon}</span>
                                      <div>
                                        <strong className="text-[11px] text-slate-900 dark:text-slate-100 block">{fase.order}. {fase.label}</strong>
                                        {fase.dataInicioFase && (
                                          <span className="text-[10px] text-slate-400">{new Date(`${fase.dataInicioFase}T00:00:00`).toLocaleDateString('pt-BR')} → {fase.prazoFaseFormatado}</span>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2 px-3">
                                    <div className="flex flex-wrap gap-1">
                                      {fase.responsaveis.length > 0
                                        ? fase.responsaveis.map((r, i) => (
                                          <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${isAtrasada ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700' : 'bg-slate-100 dark:bg-[#16203a] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#1e293b]'}`}>{r}</span>
                                        ))
                                        : <span className="text-slate-400 text-[10px] italic">—</span>
                                      }
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <div className="flex flex-col items-center gap-0.5 w-16 mx-auto">
                                      <span className={`text-xs font-black ${isConcluida ? 'text-emerald-600 dark:text-emerald-400' : fase.prazoBloqueado ? 'text-rose-500' : 'text-slate-700 dark:text-slate-200'}`}>
                                        {fase.prazoBloqueado ? '⚠️ 99%' : `${fase.progresso}%`}
                                      </span>
                                      <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${isConcluida ? 'bg-emerald-500' : fase.prazoBloqueado ? 'bg-rose-500 animate-pulse' : isAtrasada ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, fase.progresso)}%` }} />
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 text-right">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${isConcluida ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : isAtrasada ? 'bg-rose-600 text-white' : fase.hasStarted ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                      {isConcluida ? '✓ OK' : isAtrasada ? `+${fase.diasAtraso}d` : fase.hasStarted ? `${fase.diasRestantesFase}d` : '—'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ── MODO DETALHADO: lista vertical com tabela completa ──────── */
          <div className="space-y-4">
            {projetosFiltrados.map((proj) => (
              <div
                key={proj.nome}
                className={`bg-white dark:bg-[#0d1527] rounded-2xl border shadow-sm overflow-hidden ${
                  proj.temAtraso ? 'border-rose-500/40' :
                  proj.concluidoGeral ? 'border-emerald-500/40' :
                  'border-slate-200 dark:border-[#1e293b]'
                }`}
              >
                {/* Cabeçalho da obra */}
                <div className="p-4 md:p-5 bg-slate-50/70 dark:bg-[#0a1020]/70 border-b border-slate-100 dark:border-[#1e293b] flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {proj.versao !== 'V0' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-slate-200 dark:bg-[#16203a] text-slate-700 dark:text-slate-300">
                          {proj.versao}
                        </span>
                      )}
                      <h2 className="text-lg font-black text-slate-900 dark:text-white">{proj.baseName}</h2>
                      {proj.atrasado && !proj.concluidoGeral && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-600 text-white animate-pulse">🚨 Vencido em {Math.abs(proj.diasRestantes)}d</span>
                      )}
                      {proj.concluidoGeral && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-600 text-white">✅ 100% Concluída</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                      {proj.dataInicio && <span>Início: <strong>{new Date(`${proj.dataInicio}T00:00:00`).toLocaleDateString('pt-BR')}</strong></span>}
                      <span>Prazo: <strong>{proj.prazoFormatado}</strong></span>
                      {proj.prazoFinal && !proj.concluidoGeral && (
                        <span className={proj.atrasado ? 'text-rose-500 font-bold' : ''}>
                          ({proj.atrasado ? `+${Math.abs(proj.diasRestantes)}d` : `Restam ${proj.diasRestantes}d`})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Conclusão</span>
                      <span className="text-xl font-black text-slate-900 dark:text-white">{proj.progressoGeral}%</span>
                    </div>
                    <div className="w-24 h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${proj.concluidoGeral ? 'bg-emerald-500' : proj.temAtraso ? 'bg-rose-500' : 'bg-indigo-600'}`}
                        style={{ width: `${proj.progressoGeral}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Tabela de fases */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-[#1e293b] text-[10px] font-black uppercase tracking-wider text-slate-400">
                        <th className="py-2 px-4">Fase</th>
                        <th className="py-2 px-4">👤 Responsável(is)</th>
                        <th className="py-2 px-4 text-center">Progresso</th>
                        <th className="py-2 px-4 text-right">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#1e293b] text-xs">
                      {proj.fases.map((fase) => {
                        const isConcluida = fase.progresso >= 100;
                        const isAtrasada = fase.atrasadaFase;
                        return (
                          <tr key={fase.key} className={`transition-colors hover:bg-slate-50/70 dark:hover:bg-[#111a30]/50 ${isAtrasada ? 'bg-rose-500/[0.04]' : ''}`}>
                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm shrink-0">{fase.icon}</span>
                                <div>
                                  <strong className="font-bold text-slate-900 dark:text-slate-100 block text-[11px]">{fase.order}. {fase.label}</strong>
                                  {fase.dataInicioFase ? (
                                    <span className="text-[10px] text-slate-400 hidden sm:block">{new Date(`${fase.dataInicioFase}T00:00:00`).toLocaleDateString('pt-BR')} → {fase.prazoFaseFormatado}</span>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 hidden sm:block">Prazo: {fase.prazoFaseFormatado}</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-4">
                              <div className="flex flex-wrap gap-1">
                                {fase.responsaveis.length > 0
                                  ? fase.responsaveis.map((resp, rIdx) => (
                                    <span key={rIdx} className={`px-1.5 py-0.5 rounded font-bold text-[10px] border ${isAtrasada ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-500/40' : 'bg-slate-100 dark:bg-[#16203a] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#1e293b]'}`}>{resp}</span>
                                  ))
                                  : <span className="text-slate-400 italic text-[10px]">—</span>
                                }
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              <div className="inline-flex flex-col items-center w-24 mx-auto">
                                <span className={`text-xs font-black mb-1 ${isConcluida ? 'text-emerald-600 dark:text-emerald-400' : fase.prazoBloqueado ? 'text-rose-600 dark:text-rose-400' : isAtrasada ? 'text-rose-600 dark:text-rose-400' : fase.progresso >= 75 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`}>
                                  {fase.prazoBloqueado ? '⚠️ 99%' : `${fase.progresso}%`}
                                </span>
                                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all duration-500 ${isConcluida ? 'bg-emerald-500' : fase.prazoBloqueado ? 'bg-rose-500 animate-pulse' : isAtrasada ? 'bg-rose-500' : fase.progresso >= 75 ? 'bg-blue-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, fase.progresso)}%` }} />
                                </div>
                                {fase.prazoBloqueado && <span className="text-[9px] text-rose-600 dark:text-rose-400 mt-0.5 font-bold">Prazo Estourado</span>}
                                {!fase.prazoBloqueado && fase.totalLogs > 0 && <span className="text-[9px] text-slate-400 mt-0.5">{fase.totalLogs} reg.</span>}
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider inline-block ${isConcluida ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : isAtrasada ? 'bg-rose-600 text-white' : fase.hasStarted ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                {isConcluida ? '✓ Concluída' : isAtrasada ? `+${fase.diasAtraso}d Atraso` : fase.hasStarted ? `Restam ${fase.diasRestantesFase}d` : 'Não Iniciada'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

      </main>

    </div>
  );
}
