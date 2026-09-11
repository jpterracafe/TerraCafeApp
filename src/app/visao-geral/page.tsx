"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import {
  LayoutDashboard, Search, CheckCircle2, AlertCircle, Clock,
  Calendar, Users, RefreshCw, FileText, Loader2, Tv, Maximize2,
  Minimize2, AlertTriangle, ShieldAlert, Sparkles, Activity,
  Layers, ArrowUpRight, Check
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

        // Se houver responsáveis reais, remove a tag "Administrador" genérica
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
        if (!prazoLimiteFase && hasStarted && dataInicioFase) {
          const dIni = new Date(`${dataInicioFase}T00:00:00`);
          dIni.setDate(dIni.getDate() + metaDiasFase);
          prazoLimiteFase = dIni.toISOString().split('T')[0];
        }

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
              Painel Executivo da Diretoria
            </span>
            <span className="text-xs text-slate-400">• Atualizado {lastUpdate.toLocaleTimeString('pt-BR')}</span>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>📊 Visão Geral das Obras & Responsáveis</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Acompanhamento sucinto de cada fase, responsáveis designados e percentuais de conclusão.
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

      <main className="max-w-7xl mx-auto space-y-6">

        {/* ── KPIs Rápidos e Sucintos para o Diretor ────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-4 shadow-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Obras Ativas</span>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{statsGerais.totalProjetos}</div>
            <span className="text-[11px] text-slate-400">em andamento</span>
          </div>

          <div className="bg-white dark:bg-[#0d1527] border border-emerald-500/30 rounded-2xl p-4 shadow-sm bg-gradient-to-br from-emerald-500/5 to-transparent">
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Obras em Dia</span>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{statsGerais.emDia}</div>
            <span className="text-[11px] text-emerald-500/80">no cronograma</span>
          </div>

          <div className={`bg-white dark:bg-[#0d1527] border rounded-2xl p-4 shadow-sm ${
            statsGerais.comAtraso > 0 ? 'border-rose-500/40 bg-gradient-to-br from-rose-500/10 to-transparent' : 'border-slate-200 dark:border-[#1e293b]'
          }`}>
            <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider block">Com Atraso</span>
            <div className={`text-2xl font-black mt-0.5 ${statsGerais.comAtraso > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
              {statsGerais.comAtraso}
            </div>
            <span className="text-[11px] text-rose-500/80 font-medium">
              {statsGerais.totalFasesAtrasadas} {statsGerais.totalFasesAtrasadas === 1 ? 'fase atrasada' : 'fases atrasadas'}
            </span>
          </div>

          <div className="bg-white dark:bg-[#0d1527] border border-purple-500/30 rounded-2xl p-4 shadow-sm bg-gradient-to-br from-purple-500/5 to-transparent">
            <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">Concluídas</span>
            <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-0.5">{statsGerais.concluidos}</div>
            <span className="text-[11px] text-purple-500/80">100% entregues</span>
          </div>

          <div className="bg-white dark:bg-[#0d1527] border border-blue-500/30 rounded-2xl p-4 shadow-sm col-span-2 md:col-span-1 bg-gradient-to-br from-blue-500/5 to-transparent">
            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">Progresso Médio</span>
            <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-0.5">{statsGerais.progressoMedioGeral}%</div>
            <span className="text-[11px] text-blue-500/80">execução geral</span>
          </div>
        </div>

        {/* ── Mural Sucinto de Fases em Atraso (se houver) ─────────────── */}
        {todasFasesAtrasadas.length > 0 && (
          <div className="bg-rose-500/10 border-2 border-rose-500/40 rounded-2xl p-4 md:p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <ShieldAlert className="w-5 h-5 animate-bounce" />
                <h3 className="text-sm font-black uppercase tracking-wider">
                  Atenção Imediata: {todasFasesAtrasadas.length} {todasFasesAtrasadas.length === 1 ? 'Fase em Atraso' : 'Fases em Atraso'}
                </h3>
              </div>
              <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/20 px-2.5 py-0.5 rounded-full">
                Cobrança de Prazos
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {todasFasesAtrasadas.map((item, idx) => (
                <div
                  key={`${item.projetoNome}-${item.etapaKey}-${idx}`}
                  className="bg-white dark:bg-[#0d1527] border border-rose-500/40 rounded-xl p-3 shadow-sm flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{item.etapaIcon}</span>
                      <strong className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {item.baseName}
                      </strong>
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                      {item.etapaOrder}. {item.etapaLabel} • <strong>{item.responsaveis.join(', ')}</strong>
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="px-2 py-0.5 rounded text-[11px] font-black bg-rose-600 text-white block">
                      +{item.diasAtraso}d ATRASO
                    </span>
                    <span className="text-[10px] font-mono font-bold text-slate-400 block mt-0.5">
                      {item.progresso}% concluído
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Barra de Busca e Filtros ─────────────────────────────────── */}
        <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-3.5 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar obra ou responsável..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-[#16203a] border border-slate-200 dark:border-[#1e293b] rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
            <span className="text-xs text-slate-400 font-bold mr-1 shrink-0">Status:</span>
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
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all ${
                  filtroStatus === f.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-[#16203a] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#1f2d4e]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Lista de Obras: Cada Fase e Responsável Separados com % ───── */}
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
        ) : (
          <div className="space-y-5">
            {projetosFiltrados.map((proj) => (
              <div
                key={proj.nome}
                className={`bg-white dark:bg-[#0d1527] rounded-2xl border shadow-sm transition-all overflow-hidden ${
                  proj.temAtraso
                    ? 'border-rose-500/40'
                    : proj.concluidoGeral
                    ? 'border-emerald-500/30'
                    : 'border-slate-200 dark:border-[#1e293b]'
                }`}
              >
                {/* ── Cabeçalho Conciso da Obra ───────────────────────── */}
                <div className="p-4 md:p-5 bg-slate-50/70 dark:bg-[#0a1020]/70 border-b border-slate-100 dark:border-[#1e293b] flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-slate-200 dark:bg-[#16203a] text-slate-700 dark:text-slate-300">
                        {proj.versao !== 'V0' ? proj.versao : 'OBRA'}
                      </span>
                      <h2 className="text-lg md:text-xl font-black text-slate-900 dark:text-white">
                        {proj.baseName}
                      </h2>
                      {proj.atrasado && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-600 text-white animate-pulse">
                          🚨 Vencido em {Math.abs(proj.diasRestantes)}d
                        </span>
                      )}
                      {proj.concluidoGeral && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-600 text-white">
                          ✅ 100% Concluída
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                      {proj.dataInicio && (
                        <span>Início: <strong>{new Date(`${proj.dataInicio}T00:00:00`).toLocaleDateString('pt-BR')}</strong></span>
                      )}
                      <span>Prazo Final: <strong>{proj.prazoFormatado}</strong></span>
                      {proj.prazoFinal && !proj.concluidoGeral && (
                        <span className={proj.atrasado ? 'text-rose-500 font-bold' : 'text-slate-500'}>
                          ({proj.atrasado ? `+${Math.abs(proj.diasRestantes)}d no prazo total` : `Restam ${proj.diasRestantes}d`})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Barra de Progresso Geral da Obra */}
                  <div className="flex items-center gap-3">
                    <div className="text-right shrink-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Conclusão Total</span>
                      <span className="text-lg font-black text-slate-900 dark:text-white">{proj.progressoGeral}%</span>
                    </div>

                    <div className="w-28 h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden shrink-0">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          proj.concluidoGeral ? 'bg-emerald-500' : proj.temAtraso ? 'bg-rose-500' : 'bg-indigo-600'
                        }`}
                        style={{ width: `${proj.progressoGeral}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Tabela Executiva das 6 Fases (Cada Fase e Responsável Separados) ── */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-[#1e293b] bg-white dark:bg-[#0d1527] text-[10px] font-black uppercase tracking-wider text-slate-400">
                        <th className="py-2.5 px-4">Fase Oficial</th>
                        <th className="py-2.5 px-4">👤 Responsável(is)</th>
                        <th className="py-2.5 px-4">Prazo & Início</th>
                        <th className="py-2.5 px-4 text-center">Progresso (%)</th>
                        <th className="py-2.5 px-4 text-right">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#1e293b] text-xs">
                      {proj.fases.map((fase) => {
                        const isConcluida = fase.progresso >= 100;
                        const isAtrasada = fase.atrasadaFase;

                        return (
                          <tr
                            key={fase.key}
                            className={`transition-colors hover:bg-slate-50/70 dark:hover:bg-[#111a30]/50 ${
                              isAtrasada ? 'bg-rose-500/[0.04]' : ''
                            }`}
                          >
                            {/* 1. Fase */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span className="text-base">{fase.icon}</span>
                                <div>
                                  <strong className="font-bold text-slate-900 dark:text-slate-100 block">
                                    {fase.order}. {fase.label}
                                  </strong>
                                  <span className="text-[10px] text-slate-400 hidden sm:block">
                                    {fase.desc}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* 2. Responsável(is) em Destaque Separado */}
                            <td className="py-3 px-4">
                              <div className="flex flex-wrap gap-1">
                                {fase.responsaveis.length > 0 ? (
                                  fase.responsaveis.map((resp, rIdx) => (
                                    <span
                                      key={rIdx}
                                      className={`px-2 py-0.5 rounded-md font-bold text-[11px] border ${
                                        isAtrasada
                                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-500/40 font-black'
                                          : 'bg-slate-100 dark:bg-[#16203a] text-slate-800 dark:text-slate-200 border-slate-200 dark:border-[#1e293b]'
                                      }`}
                                    >
                                      {resp}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">Equipe de Campo</span>
                                )}
                              </div>
                            </td>

                            {/* 3. Prazos */}
                            <td className="py-3 px-4">
                              <div className="text-[11px]">
                                <span className="text-slate-700 dark:text-slate-300 font-bold block">
                                  Limite: {fase.prazoFaseFormatado}
                                </span>
                                {fase.dataInicioFase && (
                                  <span className="text-[10px] text-slate-400 block">
                                    Início: {new Date(`${fase.dataInicioFase}T00:00:00`).toLocaleDateString('pt-BR')}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 4. Percentual de Conclusão */}
                            <td className="py-3 px-4 text-center">
                              <div className="inline-flex flex-col items-center w-28">
                                <div className="flex items-center justify-between w-full text-[11px] font-black text-slate-800 dark:text-slate-200 mb-0.5">
                                  <span>{fase.progresso}%</span>
                                  {isConcluida && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                                </div>
                                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      isConcluida ? 'bg-emerald-500' : isAtrasada ? 'bg-rose-500' : 'bg-indigo-600'
                                    }`}
                                    style={{ width: `${fase.progresso}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* 5. Situação / Badge */}
                            <td className="py-3 px-4 text-right">
                              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider inline-block ${
                                isConcluida
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                  : isAtrasada
                                  ? 'bg-rose-600 text-white shadow-sm'
                                  : fase.hasStarted
                                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                              }`}>
                                {isConcluida
                                  ? 'Concluída'
                                  : isAtrasada
                                  ? `+${fase.diasAtraso}d Atraso`
                                  : fase.hasStarted
                                  ? `Restam ${fase.diasRestantesFase}d`
                                  : 'Não Iniciada'}
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
