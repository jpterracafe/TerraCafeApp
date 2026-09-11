"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import {
  LayoutDashboard, Search, CheckCircle2, AlertCircle, Clock,
  Calendar, Users, CloudRain, Layers, ArrowUpRight,
  RefreshCw, FileText, Check, Loader2, Tv, Maximize2,
  Minimize2, AlertTriangle, ShieldAlert, Sparkles, Activity
} from 'lucide-react';
import { EtapaCampo } from '../irrigacao/types';
import { FaseAcao } from '../irrigacao/execucao/mockFases';
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
  { key: 'elétrica',                    label: 'Elétrica',                    icon: '⚡', desc: 'Quadros elétricos, automação e cabeamento', order: 4 },
  { key: 'lavagem do sistema e testes',  label: 'Lavagem & Testes',            icon: '💧', desc: 'Limpeza, teste de pressão e estanqueidade', order: 5 },
  { key: 'entrega técnica',             label: 'Entrega Técnica',             icon: '📋', desc: 'Checklist, treinamento operacional e entrega', order: 6 },
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

  // Filtros
  const [search, setSearch] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'atrasado' | 'em_andamento' | 'concluido'>('todos');

  const [fases, setFases] = useState<FaseAcao[]>([]);
  const [diarioLogs, setDiarioLogs] = useState<any[]>([]);

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

      const lista = resProj.projetos ?? [];
      setProjetosList(lista);

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

  // ── Auto-refresh: 20s no Modo TV / 30s no modo normal ─────────
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

    const onFocus = () => {
      if (!loading && !refreshing) carregarDados();
    };

    startPolling();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [carregarDados, loading, refreshing, modoTV]);

  // Auto-scroll suave no modo TV (quando ativado)
  useEffect(() => {
    if (!modoTV || !autoScroll) return;
    let direction = 1;
    const interval = setInterval(() => {
      if (!scrollContainerRef.current) return;
      const el = scrollContainerRef.current;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
        direction = -1;
      } else if (el.scrollTop <= 10) {
        direction = 1;
      }
      el.scrollBy({ top: direction * 80, behavior: 'smooth' });
    }, 4000);
    return () => clearInterval(interval);
  }, [modoTV, autoScroll]);

  const handleRefresh = () => {
    setRefreshing(true);
    carregarDados();
  };

  const toggleModoTV = () => {
    if (!modoTV) {
      // Tenta colocar em fullscreen se suportado pelo navegador
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

  // Processa dados de cada projeto para a tela executiva de Paulo
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

        const respDiarioLogs = diarioLogs
          .filter(l =>
            l.projetoCliente &&
            l.projetoCliente.trim() === nomeProjeto.trim() &&
            l.atividade &&
            (l.atividade.trim().toLowerCase() === et.key.toLowerCase() ||
             l.atividade.trim().toLowerCase().includes(et.key.toLowerCase()) ||
             et.key.toLowerCase().includes(l.atividade.trim().toLowerCase())) &&
            l.responsavel &&
            l.responsavel.trim()
          )
          .flatMap(l => l.responsavel.split(',').map((r: string) => r.trim()))
          .filter(Boolean);

        let todosResponsaveis = Array.from(
          new Set([
            ...respConfig.map(r => (r || '').trim()).filter(Boolean),
            ...respFasesAcao,
            ...respDiarioLogs,
          ])
        ).filter(Boolean);

        // Se houver responsáveis reais atribuídos ou registrados no diário (além do Administrador genérico),
        // remove "Administrador" para dar destaque ao responsável de campo correto
        if (todosResponsaveis.length > 1 && todosResponsaveis.includes('Administrador')) {
          todosResponsaveis = todosResponsaveis.filter(r => r !== 'Administrador');
        }

        const responsaveis = todosResponsaveis.sort((a, b) => a.localeCompare(b, 'pt-BR'));

        const pctProgresso = config.etapasProgresso[chaveEtapa] ?? 0;
        somaProgresso += pctProgresso;

        const cfgFase = config.configEtapas[chaveEtapa];
        const hasStarted = !!cfgFase?.dataInicio;
        const dataInicioFase = cfgFase?.dataInicio || '';
        const metaDiasFase = cfgFase?.metaDias || 20;

        let prazoLimiteFase = cfgFase?.prazoLimite || '';
        if (!prazoLimiteFase && hasStarted) {
          const dIni = new Date(`${dataInicioFase}T00:00:00`);
          dIni.setDate(dIni.getDate() + metaDiasFase);
          prazoLimiteFase = dIni.toISOString().split('T')[0];
        }

        let diasRestantesFase = 0;
        let atrasadaFase = false;
        let prazoFaseFormatado = 'Pendente';
        let diasAtraso = 0;

        if (hasStarted && prazoLimiteFase) {
          const dFim = new Date(`${prazoLimiteFase}T00:00:00`);
          dFim.setHours(0, 0, 0, 0);
          diasRestantesFase = Math.ceil((dFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          atrasadaFase = diasRestantesFase < 0 && pctProgresso < 100;
          if (atrasadaFase) {
            diasAtraso = Math.abs(diasRestantesFase);
            qtdFasesAtrasadas++;
          }
          prazoFaseFormatado = dFim.toLocaleDateString('pt-BR');
        }

        let status = 'Pendente';
        if (pctProgresso >= 100) status = 'Concluída';
        else if (atrasadaFase) status = 'Atrasada';
        else if (hasStarted) status = 'Em andamento';

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
        temAtraso,
        concluidoGeral,
        progressoGeral,
        justificativas,
        fases: fasesDetalhadas,
      };
    });
  }, [projetosList, config, fases, diarioLogs]);

  // Lista unificada de TODAS as Fases em Atraso no Sistema (Para o Mural de Atenção da TV)
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

    // Ordena pelo maior número de dias de atraso primeiro (mais crítico no topo)
    return list.sort((a, b) => b.diasAtraso - a.diasAtraso);
  }, [projetosProcessados]);

  // Prazos Críticos (Vencem hoje ou nos próximos 3 dias)
  const prazosCriticos = useMemo(() => {
    const list: Array<{
      projetoNome: string;
      baseName: string;
      etapaLabel: string;
      etapaIcon: string;
      responsaveis: string[];
      diasRestantes: number;
      prazoFormatado: string;
      progresso: number;
    }> = [];

    projetosProcessados.forEach(p => {
      p.fases.forEach(f => {
        if (f.hasStarted && !f.atrasadaFase && f.progresso < 100 && f.diasRestantesFase >= 0 && f.diasRestantesFase <= 3) {
          list.push({
            projetoNome: p.nome,
            baseName: p.baseName,
            etapaLabel: f.label,
            etapaIcon: f.icon,
            responsaveis: f.responsaveis.length > 0 ? f.responsaveis : ['Equipe Técnica'],
            diasRestantes: f.diasRestantesFase,
            prazoFormatado: f.prazoFaseFormatado,
            progresso: f.progresso,
          });
        }
      });
    });

    return list.sort((a, b) => a.diasRestantes - b.diasRestantes);
  }, [projetosProcessados]);

  // Filtros aplicados na lista de projetos
  const projetosFiltrados = useMemo(() => {
    return projetosProcessados.filter(p => {
      const matchBusca = p.nome.toLowerCase().includes(search.toLowerCase());
      if (!matchBusca) return false;

      if (filtroStatus === 'concluido') return p.concluidoGeral;
      if (filtroStatus === 'atrasado') return p.temAtraso && !p.concluidoGeral;
      if (filtroStatus === 'em_andamento') return !p.concluidoGeral && !p.temAtraso;
      return true;
    });
  }, [projetosProcessados, search, filtroStatus]);

  // KPIs
  const statsGerais = useMemo(() => {
    const totalProjetos = projetosProcessados.length;
    const concluidos = projetosProcessados.filter(p => p.concluidoGeral).length;
    const comAtraso = projetosProcessados.filter(p => p.temAtraso && !p.concluidoGeral).length;
    const emDia = totalProjetos - concluidos - comAtraso;
    const totalFasesAtrasadas = todasFasesAtrasadas.length;

    // Responsaveis com pendências de atraso
    const responsaveisComAtraso = Array.from(
      new Set(todasFasesAtrasadas.flatMap(f => f.responsaveis))
    );

    return {
      totalProjetos,
      concluidos,
      comAtraso,
      emDia,
      totalFasesAtrasadas,
      totalResponsaveisAtraso: responsaveisComAtraso.length,
    };
  }, [projetosProcessados, todasFasesAtrasadas]);

  return (
    <div
      ref={scrollContainerRef}
      className={`min-h-screen transition-colors duration-300 ${
        modoTV
          ? 'bg-[#030712] text-slate-100 p-4 md:p-6 overflow-y-auto h-screen'
          : 'bg-slate-50 dark:bg-[#070c18] text-slate-800 dark:text-slate-100 pb-16'
      }`}
    >
      
      {/* ── HEADER PRINCIPAL (COM CONTROLES DE TV & ATUALIZAÇÃO) ── */}
      <header className={`border-b transition-all ${
        modoTV
          ? 'bg-[#0b1329]/90 backdrop-blur-md border-red-500/30 rounded-2xl px-6 py-4 mb-6 shadow-2xl sticky top-0 z-40'
          : 'bg-white dark:bg-[#0d1527] border-slate-200 dark:border-[#1e293b] px-4 md:px-8 py-5 shadow-sm'
      }`}>
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Título & Status */}
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider border ${
                modoTV
                  ? 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse'
                  : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
              }`}>
                {modoTV ? '📺 MODO TV / PAINEL OPERACIONAL' : 'PAINEL DA DIRETORIA • PAULO'}
              </span>

              {/* Indicador AO VIVO */}
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>AO VIVO</span>
              </div>

              {horaAtual && (
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-[#111a30] border border-slate-200 dark:border-[#1e293b] text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300">
                  🕒 {horaAtual}
                </span>
              )}
            </div>

            <h1 className={`font-black tracking-tight flex items-center gap-3 ${
              modoTV ? 'text-2xl md:text-3xl text-white' : 'text-2xl md:text-3xl text-slate-900 dark:text-white'
            }`}>
              <LayoutDashboard className="w-7 h-7 text-blue-500 shrink-0" />
              <span>Acompanhamento de Obras & Prazos de Campo</span>
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Visualização instantânea de responsáveis, fases atrasadas e entregas para toda a equipe.
            </p>
          </div>

          {/* Botões de Ação */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Botão Modo TV */}
            <button
              type="button"
              onClick={toggleModoTV}
              className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 border transition-all shadow-md active:scale-95 ${
                modoTV
                  ? 'bg-red-600 hover:bg-red-700 text-white border-red-500 shadow-red-900/30'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white border-blue-500/40 shadow-blue-900/20'
              }`}
              title={modoTV ? 'Sair do Modo TV' : 'Ativar Modo TV (Tela Cheia)'}
            >
              <Tv className="w-4 h-4" />
              <span>{modoTV ? 'Sair do Modo TV' : 'Ativar Modo TV'}</span>
            </button>

            {modoTV && (
              <button
                type="button"
                onClick={() => setAutoScroll(prev => !prev)}
                className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                  autoScroll
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                    : 'bg-[#111a30] text-slate-300 border-[#1e293b] hover:bg-[#1a2542]'
                }`}
              >
                {autoScroll ? '⏸ Auto-Scroll Ligado' : '▶ Auto-Scroll'}
              </button>
            )}

            {/* Atualizar */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#111a30] hover:bg-slate-200 dark:hover:bg-[#1a2542] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#1e293b] flex items-center gap-2 transition-all shadow-sm"
              title="Atualizar agora"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-500' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>

            {!modoTV && (
              <button
                type="button"
                onClick={() => router.push('/irrigacao/diario-campo')}
                className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#111a30] hover:bg-blue-600 hover:text-white border border-slate-200 dark:border-[#1e293b] text-slate-700 dark:text-slate-300 flex items-center gap-2 transition-all"
              >
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Diário de Campo</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={`space-y-6 ${modoTV ? 'max-w-[1700px] mx-auto' : 'max-w-7xl mx-auto px-4 md:px-8 mt-6'}`}>

        {/* ── 🚨 MURAL DE ATENÇÃO MÁXIMA: QUEM ESTÁ ATRASADO (SUPER DESTAQUE NA TV) ── */}
        {todasFasesAtrasadas.length > 0 ? (
          <div className="bg-gradient-to-br from-rose-950/40 via-red-900/20 to-slate-900 border-2 border-rose-500/60 rounded-2xl p-5 md:p-6 shadow-2xl shadow-rose-950/30 animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-3 border-b border-rose-500/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                  <ShieldAlert className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <h2 className="text-lg md:text-xl font-black text-rose-400 uppercase tracking-tight flex items-center gap-2">
                    <span>Mural de Atenção: Fases & Responsáveis em Atraso</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-600 text-white shadow-md">
                      {todasFasesAtrasadas.length} {todasFasesAtrasadas.length === 1 ? 'FASE' : 'FASES'}
                    </span>
                  </h2>
                  <p className="text-xs text-rose-300/80">
                    Obras com prazos expirados requerem ação imediata dos responsáveis abaixo.
                  </p>
                </div>
              </div>

              <span className="text-xs font-mono font-bold text-rose-300 bg-rose-500/10 px-3 py-1.5 rounded-xl border border-rose-500/20 self-start md:self-auto">
                ⚠️ {statsGerais.totalResponsaveisAtraso} {statsGerais.totalResponsaveisAtraso === 1 ? 'responsável notificado' : 'responsáveis notificados'}
              </span>
            </div>

            {/* Grid de Cards de Atraso em Grande Destaque */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {todasFasesAtrasadas.map((item, idx) => (
                <div
                  key={`${item.projetoNome}-${item.etapaKey}-${idx}`}
                  className="bg-white/95 dark:bg-[#0c1324]/95 border-2 border-rose-500/50 rounded-xl p-4 shadow-lg hover:border-rose-400 transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-wider text-rose-500 block truncate">
                        {item.baseName} {item.versao !== 'V0' ? `(${item.versao})` : ''}
                      </span>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                        <span>{item.etapaIcon}</span>
                        <span className="capitalize">{item.etapaOrder}. {item.etapaLabel}</span>
                      </h3>
                    </div>

                    {/* Badge de dias de atraso */}
                    <div className="text-right shrink-0">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-rose-600 text-white shadow-sm block animate-pulse">
                        +{item.diasAtraso}d ATRASO
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Prazo: {item.prazoFormatado}
                      </span>
                    </div>
                  </div>

                  {/* Responsáveis com destaque visual forte */}
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 mt-3">
                    <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider block mb-1">
                      👤 Responsável(is) Cobrado(s):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {item.responsaveis.map((resp, rIdx) => (
                        <span
                          key={rIdx}
                          className="px-2 py-0.5 rounded-md text-xs font-black bg-white dark:bg-[#16203a] border border-rose-500/40 text-slate-900 dark:text-rose-200 shadow-sm"
                        >
                          {resp}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Barra de Progresso Atual da Fase */}
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                      <span>Executado até o momento:</span>
                      <strong className="text-slate-700 dark:text-slate-200">{item.progresso}%</strong>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-rose-500 rounded-full" style={{ width: `${item.progresso}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Banner Positivo quando ZERO fases estão atrasadas */
          <div className="bg-emerald-500/10 border-2 border-emerald-500/30 rounded-2xl p-4 md:p-5 flex items-center justify-between gap-4 shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base md:text-lg font-black text-emerald-700 dark:text-emerald-400">
                  🎉 Excelente! Nenhuma fase em atraso no momento.
                </h2>
                <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">
                  Todas as etapas de campo estão dentro do prazo estipulado pela diretoria.
                </p>
              </div>
            </div>
            <span className="text-xs font-extrabold uppercase px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hidden sm:inline-block">
              100% No Cronograma
            </span>
          </div>
        )}

        {/* ── ALERTA DE PRAZOS CRÍTICOS (PRÓXIMOS 3 DIAS) ── */}
        {prazosCriticos.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 shadow-md">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="text-sm font-black text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                Atenção aos Prazos Próximos (Vencem em até 3 dias):
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {prazosCriticos.map((crit, cIdx) => (
                <div key={cIdx} className="p-3 rounded-xl bg-white dark:bg-[#0c1324] border border-amber-500/30 flex items-center justify-between gap-2 shadow-sm">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 block truncate">
                      {crit.baseName} • {crit.etapaIcon} {crit.etapaLabel}
                    </span>
                    <strong className="text-xs text-slate-800 dark:text-slate-200 block truncate">
                      {crit.responsaveis.join(', ')}
                    </strong>
                  </div>
                  <span className="px-2 py-1 rounded-lg text-xs font-black bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0">
                    {crit.diasRestantes === 0 ? 'Vence HOJE' : `Restam ${crit.diasRestantes}d`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── KPIS RESUMO RÁPIDO ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-500 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              Obras com Atraso
            </span>
            <div className="text-3xl font-black text-rose-600 dark:text-rose-400 mt-1">
              {statsGerais.comAtraso}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {statsGerais.totalFasesAtrasadas} fases atrasadas no total
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Obras no Prazo
            </span>
            <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {statsGerais.emDia}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">Dentro do cronograma</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-500 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              Obras Concluídas
            </span>
            <div className="text-3xl font-black text-purple-600 dark:text-purple-400 mt-1">
              {statsGerais.concluidos}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">100% finalizadas</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-500 flex items-center gap-1.5">
              <Layers className="w-4 h-4" />
              Total de Obras
            </span>
            <div className="text-3xl font-black text-blue-600 dark:text-blue-400 mt-1">
              {statsGerais.totalProjetos}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">Cadastradas no sistema</span>
          </div>
        </div>

        {/* ── BARRA DE FILTROS (ESCONDIDA OU COMPACTADA NO MODO TV) ── */}
        {!modoTV && (
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar obra, fazenda ou cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl pl-9 pr-3 py-2 text-xs md:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
              <span className="text-xs text-slate-400 font-semibold mr-1 shrink-0">Filtrar:</span>
              {[
                { id: 'todos', label: 'Todas as Obras' },
                { id: 'atrasado', label: '🚨 Em Atraso' },
                { id: 'em_andamento', label: '⏳ Em Dia' },
                { id: 'concluido', label: '✅ Concluídas' },
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltroStatus(f.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                    filtroStatus === f.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-[#111a30] text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── LISTA DE OBRAS E ACOMPANHAMENTO DAS 6 FASES ── */}
        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-500">
              Carregando dados das obras para a diretoria...
            </p>
          </div>
        ) : projetosFiltrados.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl">
            <Layers className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-40" />
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">Nenhuma obra encontrada</h3>
            <p className="text-xs text-slate-500 mt-1">Nenhum projeto corresponde ao filtro selecionado.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {projetosFiltrados.map((proj) => (
              <div
                key={proj.nome}
                className={`rounded-2xl p-5 md:p-6 transition-all shadow-md ${
                  proj.temAtraso
                    ? 'bg-white dark:bg-[#0d1527] border-2 border-rose-500/40 shadow-rose-950/10'
                    : proj.concluidoGeral
                      ? 'bg-white dark:bg-[#0d1527] border border-purple-500/30'
                      : 'bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b]'
                }`}
              >
                {/* Cabeçalho da Obra */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-[#1e293b] pb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] uppercase font-black tracking-wider px-2.5 py-0.5 rounded ${
                        proj.temAtraso
                          ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30'
                          : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                      }`}>
                        {proj.temAtraso ? '⚠️ Obra com Pendência / Atraso' : 'Obra de Irrigação'}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">
                        Start: {proj.dataInicio ? new Date(`${proj.dataInicio}T00:00:00`).toLocaleDateString('pt-BR') : 'Não informado'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                        {proj.baseName}
                      </h2>
                      {proj.versao !== 'V0' && (
                        <span className="px-2.5 py-0.5 rounded text-xs font-black bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                          {proj.versao}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Badges de Prazo Final e Progresso */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Prazo Final Total da Obra */}
                    <div className={`px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2.5 ${
                      proj.concluidoGeral
                        ? 'bg-purple-500/15 border-purple-500/30 text-purple-600 dark:text-purple-300'
                        : proj.atrasado
                          ? 'bg-rose-600 text-white border-rose-700 shadow-md animate-pulse'
                          : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                    }`}>
                      <Calendar className="w-4 h-4" />
                      <div>
                        <span className="block text-[10px] font-semibold opacity-80">
                          Prazo Final Total: {proj.prazoFormatado}
                        </span>
                        <span className="text-sm font-black">
                          {proj.concluidoGeral
                            ? 'Obra Concluída'
                            : proj.atrasado
                              ? `+${Math.abs(proj.diasRestantes)} dias do prazo total`
                              : `Restam ${proj.diasRestantes} dias para entrega`}
                        </span>
                      </div>
                    </div>

                    {/* Progresso Geral */}
                    <div className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#111a30] border border-slate-200 dark:border-[#1e293b] text-right">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Progresso Médio</span>
                      <span className={`text-xl font-black ${
                        proj.concluidoGeral ? 'text-purple-500' : 'text-blue-600 dark:text-blue-400'
                      }`}>
                        {proj.progressoGeral}%
                      </span>
                    </div>

                    {!modoTV && (
                      <button
                        type="button"
                        onClick={() => router.push('/irrigacao/diario-campo')}
                        className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#111a30] hover:bg-blue-600 hover:text-white border border-slate-200 dark:border-[#1e293b] text-slate-600 dark:text-slate-300 transition-all shadow-sm"
                        title="Abrir no Diário de Campo"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* ── AS 6 FASES DA OBRA EM GRID COM DESTAQUE AOS RESPONSÁVEIS ── */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-blue-500" />
                      Status das 6 Fases de Campo:
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Início, Prazos e Responsáveis Atribuídos
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {proj.fases.map((fase) => {
                      const isConcluida = fase.progresso >= 100;
                      return (
                        <div
                          key={fase.key}
                          className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                            isConcluida
                              ? 'bg-purple-500/5 border-purple-500/30'
                              : fase.atrasadaFase
                                ? 'bg-rose-500/10 border-2 border-rose-500/60 shadow-sm'
                                : fase.hasStarted
                                  ? 'bg-blue-500/5 border-blue-500/30'
                                  : 'bg-slate-50 dark:bg-[#0a1020] border-slate-200 dark:border-[#1e293b]'
                          }`}
                        >
                          <div>
                            {/* Nome da Fase e Badge */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xl">{fase.icon}</span>
                                <div className="min-w-0">
                                  <h4 className="text-xs font-black text-slate-900 dark:text-white truncate capitalize">
                                    {fase.order}. {fase.label}
                                  </h4>
                                  <p className="text-[10px] text-slate-400 truncate">{fase.desc}</p>
                                </div>
                              </div>

                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border shrink-0 ${
                                isConcluida
                                  ? 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-500/30'
                                  : fase.atrasadaFase
                                    ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                                    : fase.hasStarted
                                      ? 'bg-blue-500/20 text-blue-600 dark:text-blue-300 border-blue-500/30'
                                      : 'bg-slate-200 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'
                              }`}>
                                {isConcluida ? 'Concluída' : fase.atrasadaFase ? `+${fase.diasAtraso}d ATRASADA` : fase.hasStarted ? 'Em andamento' : 'Pendente'}
                              </span>
                            </div>

                            {/* Informações de Início e Prazo Limite */}
                            <div className="p-2.5 rounded-lg bg-white/70 dark:bg-[#070c18]/80 border border-slate-200/70 dark:border-[#1e293b]/70 mb-2.5 space-y-1 text-[11px]">
                              {fase.hasStarted ? (
                                <>
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-400">Início:</span>
                                    <strong className="text-slate-700 dark:text-slate-200">
                                      {new Date(`${fase.dataInicioFase}T00:00:00`).toLocaleDateString('pt-BR')}
                                    </strong>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-400">Prazo da Fase:</span>
                                    <strong className={fase.atrasadaFase ? 'text-rose-500 font-black' : 'text-blue-600 dark:text-blue-400'}>
                                      {fase.prazoFaseFormatado} ({fase.metaDiasFase}d)
                                    </strong>
                                  </div>
                                  <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-100 dark:border-[#1e293b]">
                                    <span className="text-slate-400">Situação:</span>
                                    <span className={`font-black ${
                                      isConcluida
                                        ? 'text-purple-500'
                                        : fase.atrasadaFase
                                          ? 'text-rose-500'
                                          : 'text-emerald-500'
                                    }`}>
                                      {isConcluida
                                        ? '✅ Entregue'
                                        : fase.atrasadaFase
                                          ? `🚨 Atrasado em ${fase.diasAtraso} dias`
                                          : `Restam ${fase.diasRestantesFase} dias`}
                                    </span>
                                  </div>
                                </>
                              ) : (
                                <div className="text-slate-400 text-center py-1">
                                  <span>Fase não iniciada ainda</span>
                                </div>
                              )}
                            </div>

                            {/* Responsáveis com Alto Destaque */}
                            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#070c18] border border-slate-200/60 dark:border-[#1e293b]/60 mb-2">
                              <span className="text-[10px] font-bold text-slate-400 block mb-0.5">
                                👤 Responsável(is):
                              </span>
                              <strong className="text-xs text-slate-900 dark:text-slate-100 font-black block truncate">
                                {fase.responsaveis.length > 0 ? fase.responsaveis.join(', ') : 'Equipe Técnica Geral'}
                              </strong>
                            </div>
                          </div>

                          {/* Barra de Progresso da Fase */}
                          <div className="pt-2 border-t border-slate-100 dark:border-[#1e293b]">
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="text-slate-400">Progresso:</span>
                              <span className={`font-black text-xs ${
                                isConcluida
                                  ? 'text-purple-600 dark:text-purple-400'
                                  : fase.atrasadaFase
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-blue-600 dark:text-blue-400'
                              }`}>
                                {fase.progresso}%
                              </span>
                            </div>
                            <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  isConcluida
                                    ? 'bg-purple-600'
                                    : fase.atrasadaFase
                                      ? 'bg-rose-500'
                                      : 'bg-gradient-to-r from-blue-500 to-emerald-500'
                                }`}
                                style={{ width: `${fase.progresso}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── HISTÓRICO DE JUSTIFICATIVAS / OCORRÊNCIAS REGISTRADAS ── */}
                {proj.justificativas.length > 0 && (
                  <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/25 space-y-2 mt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-amber-700 dark:text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        Justificativas Registradas ({proj.justificativas.length}):
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Chuva, quebras e manutenções
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {proj.justificativas.map((j) => (
                        <div
                          key={j.id}
                          className="p-3 rounded-lg bg-white dark:bg-[#070c18] border border-amber-500/20 text-xs shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                              {j.motivo}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(`${j.data}T00:00:00`).toLocaleDateString('pt-BR')} • {j.autor}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                            {j.observacao}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </main>

    </div>
  );
}
