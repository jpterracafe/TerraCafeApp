"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import BackButton from '@/components/BackButton';
import { useToast } from '@/components/Toast';
import { 
  Calendar, 
  Search, 
  X, 
  User, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  FileText, 
  Briefcase, 
  Layers, 
  Activity, 
  RefreshCw,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Droplets,
  Plus,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { EtapaCampo, RegistroDiarioCampo } from '../types';

// ── Helpers para controle de versões de projetos (mantidos para compatibilidade) ──
export function extractProjectBaseName(name: string): string {
  if (!name) return '';
  return name.replace(/\s*\([vV]\d+\)$/, '').trim();
}

export function getProjectVersion(name: string): string {
  if (!name) return 'V0';
  const match = name.match(/\([vV](\d+)\)$/);
  return match ? `V${match[1]}` : 'V0';
}

export function incrementProjectVersion(name: string): string {
  if (!name) return '';
  const match = name.match(/\([vV](\d+)\)$/);
  if (match) {
    const currentNum = parseInt(match[1], 10);
    const nextNum = currentNum + 1;
    return name.replace(/\([vV]\d+\)$/, `(V${nextNum})`);
  }
  return `${name.trim()} (V1)`;
}

// ── As 6 Fases Oficiais do Diário de Campo ──────────────────────────────────
export const ETAPAS_OFICIAIS: { key: EtapaCampo; label: string; icon: string; desc: string; order: number }[] = [
  { key: 'Valetas',                     label: 'Valetas',                     icon: '⛏️', desc: 'Abertura e nivelamento de valas', order: 1 },
  { key: 'montagem campo',              label: 'Montagem Campo',              icon: '🌱', desc: 'Tubulações, gotejadores e conexões', order: 2 },
  { key: 'casa de bombas',              label: 'Casa de Bombas',              icon: '⚙️', desc: 'Bombas, filtros e cabeçal', order: 3 },
  { key: 'elétrica',                    label: 'Elétrica',                    icon: '⚡', desc: 'Quadros elétricos e automação', order: 4 },
  { key: 'lavagem do sistema e testes',  label: 'Lavagem & Testes',            icon: '💧', desc: 'Limpeza, teste de pressão e estanqueidade', order: 5 },
  { key: 'entrega técnica',             label: 'Entrega Técnica',             icon: '📋', desc: 'Checklist final e treinamento ao cliente', order: 6 },
];

interface EtapaConfigItem {
  dataInicio: string;
  metaDias: number;
  prazoLimite?: string;
  hasStarted?: boolean;
}

interface SystemConfigResponse {
  configEtapas: Record<string, EtapaConfigItem>;
  projetoStartDates: Record<string, string>;
  responsaveisPorEtapa: Record<string, string[]>;
  projetosPrazoFinal: Record<string, string>;
  etapasProgresso: Record<string, number>;
  etapasStatus: Record<string, string>;
}

export default function PainelOperacionalObrasPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Dados do sistema
  const [projetosList, setProjetosList] = useState<string[]>([]);
  const [config, setConfig] = useState<SystemConfigResponse>({
    configEtapas: {},
    projetoStartDates: {},
    responsaveisPorEtapa: {},
    projetosPrazoFinal: {},
    etapasProgresso: {},
    etapasStatus: {},
  });
  const [diarioLogs, setDiarioLogs] = useState<RegistroDiarioCampo[]>([]);

  // Filtros
  const [search, setSearch] = useState('');
  const [filtroProjeto, setFiltroProjeto] = useState<string>('todos');
  const [filtroEtapa, setFiltroEtapa] = useState<string>('todos');
  const [filtroSituacao, setFiltroSituacao] = useState<'todos' | 'em_andamento' | 'atrasado' | 'concluido' | 'nao_iniciado'>('todos');

  // Carrega dados consolidados do Diário de Campo e Projetos
  const loadData = useCallback(async () => {
    try {
      const [resProj, resConfig, resLogs] = await Promise.all([
        fetch('/api/projetos').then(r => r.ok ? r.json() : { projetos: [] }),
        fetch('/api/etapas-config').then(r => r.ok ? r.json() : null),
        fetch('/api/diario-logs').then(r => r.ok ? r.json() : { logs: [] }),
      ]);

      setProjetosList(resProj.projetos ?? []);
      if (resConfig) {
        setConfig(resConfig);
      }
      setDiarioLogs(resLogs.logs ?? []);
      setLastUpdate(new Date());
    } catch (e) {
      console.error('[execucao] Erro ao carregar dados:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh a cada 30 segundos
  useEffect(() => {
    let timerId: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (timerId) return;
      timerId = setInterval(() => {
        if (!loading && !refreshing) loadData();
      }, 30000);
    };

    const stopPolling = () => {
      if (timerId) { clearInterval(timerId); timerId = null; }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!loading && !refreshing) loadData();
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
  }, [loadData, loading, refreshing]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Processa dados dos projetos e das 6 etapas reais
  const projetosProcessados = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    return projetosList.map(nomeProjeto => {
      const baseName = extractProjectBaseName(nomeProjeto);
      const versao = getProjectVersion(nomeProjeto);
      const prazoFinal = config.projetosPrazoFinal[nomeProjeto] || '';
      const dataInicio = config.projetoStartDates[nomeProjeto] || '';

      // Cálculos de prazo total do projeto
      let diasRestantesTotal = 0;
      let atrasadoTotal = false;
      let prazoFinalFormatado = 'Não definido';

      if (prazoFinal) {
        const dPrazo = new Date(`${prazoFinal}T00:00:00`);
        prazoFinalFormatado = dPrazo.toLocaleDateString('pt-BR');
        dPrazo.setHours(0, 0, 0, 0);
        const diffMs = dPrazo.getTime() - hoje.getTime();
        diasRestantesTotal = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        atrasadoTotal = diasRestantesTotal < 0;
      }

      // Processamento individual das 6 fases
      let somaProgresso = 0;
      let qtdFasesEmAndamento = 0;
      let qtdFasesAtrasadas = 0;
      let qtdFasesConcluidas = 0;

      const fases = ETAPAS_OFICIAIS.map(et => {
        const chaveEtapa = `${nomeProjeto}::${et.key}`;
        const cfgFase = config.configEtapas[chaveEtapa];
        const pctProgresso = config.etapasProgresso[chaveEtapa] ?? 0;
        somaProgresso += pctProgresso;

        // Logs específicos desta etapa e projeto
        const logsEtapa = diarioLogs.filter(l =>
          l.projetoCliente &&
          l.projetoCliente.trim() === nomeProjeto.trim() &&
          l.atividade &&
          (l.atividade.toLowerCase() === et.key.toLowerCase() ||
           l.atividade.toLowerCase().includes(et.key.toLowerCase()) ||
           et.key.toLowerCase().includes(l.atividade.toLowerCase()))
        ).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

        const ultimoLog = logsEtapa[0] || null;

        // Responsáveis da etapa (Config + Logs)
        const respConfig = config.responsaveisPorEtapa[chaveEtapa] || [];
        const respLogs = logsEtapa
          .flatMap(l => (l.responsavel || '').split(',').map(r => r.trim()))
          .filter(Boolean);

        let todosResp = Array.from(new Set([...respConfig, ...respLogs])).filter(Boolean);
        if (todosResp.length > 1 && todosResp.includes('Administrador')) {
          todosResp = todosResp.filter(r => r !== 'Administrador');
        }

        const hasStarted = !!cfgFase?.dataInicio || logsEtapa.length > 0;
        const dataInicioFase = cfgFase?.dataInicio || (logsEtapa.length > 0 ? logsEtapa[logsEtapa.length - 1].data : '');
        const metaDiasFase = cfgFase?.metaDias || 20;

        let prazoLimiteFase = cfgFase?.prazoLimite || '';
        if (!prazoLimiteFase && hasStarted && dataInicioFase) {
          const dIni = new Date(`${dataInicioFase}T00:00:00`);
          dIni.setDate(dIni.getDate() + metaDiasFase);
          prazoLimiteFase = dIni.toISOString().split('T')[0];
        }

        let diasRestantesFase = 0;
        let atrasadaFase = false;
        let diasAtraso = 0;
        let prazoFaseFormatado = 'Não iniciado';

        if (hasStarted && prazoLimiteFase) {
          const dFim = new Date(`${prazoLimiteFase}T00:00:00`);
          dFim.setHours(0, 0, 0, 0);
          prazoFaseFormatado = dFim.toLocaleDateString('pt-BR');
          diasRestantesFase = Math.ceil((dFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          atrasadaFase = diasRestantesFase < 0 && pctProgresso < 100;
          if (atrasadaFase) {
            diasAtraso = Math.abs(diasRestantesFase);
          }
        }

        let situacaoFase: 'concluido' | 'atrasado' | 'em_andamento' | 'nao_iniciado' = 'nao_iniciado';
        if (pctProgresso >= 100) {
          situacaoFase = 'concluido';
          qtdFasesConcluidas++;
        } else if (atrasadaFase) {
          situacaoFase = 'atrasado';
          qtdFasesAtrasadas++;
        } else if (hasStarted) {
          situacaoFase = 'em_andamento';
          qtdFasesEmAndamento++;
        }

        return {
          ...et,
          progresso: pctProgresso,
          hasStarted,
          dataInicioFase,
          prazoLimiteFase,
          prazoFaseFormatado,
          metaDiasFase,
          diasRestantesFase,
          atrasadaFase,
          diasAtraso,
          situacaoFase,
          responsaveis: todosResp,
          totalLogs: logsEtapa.length,
          ultimoLog,
        };
      });

      const progressoGeral = Math.round(somaProgresso / ETAPAS_OFICIAIS.length);
      const concluidoGeral = progressoGeral >= 100;

      return {
        nome: nomeProjeto,
        baseName,
        versao,
        prazoFinal,
        prazoFinalFormatado,
        dataInicio,
        diasRestantesTotal,
        atrasadoTotal,
        progressoGeral,
        concluidoGeral,
        qtdFasesEmAndamento,
        qtdFasesAtrasadas,
        qtdFasesConcluidas,
        fases,
      };
    });
  }, [projetosList, config, diarioLogs]);

  // Estatísticas e KPIs Operacionais
  const kpis = useMemo(() => {
    const hojeStr = new Date().toISOString().split('T')[0];
    const totalLogsHoje = diarioLogs.filter(l => l.data === hojeStr).length;

    let totalFasesAndamento = 0;
    let totalFasesAtrasadas = 0;
    let totalFasesConcluidas = 0;

    projetosProcessados.forEach(p => {
      totalFasesAndamento += p.qtdFasesEmAndamento;
      totalFasesAtrasadas += p.qtdFasesAtrasadas;
      totalFasesConcluidas += p.qtdFasesConcluidas;
    });

    return {
      totalProjetos: projetosProcessados.length,
      totalFasesAndamento,
      totalFasesAtrasadas,
      totalFasesConcluidas,
      totalLogsHoje,
      totalLogsGeral: diarioLogs.length,
    };
  }, [projetosProcessados, diarioLogs]);

  // Filtro inteligente de projetos e etapas
  const projetosFiltrados = useMemo(() => {
    const q = search.toLowerCase().trim();

    return projetosProcessados
      .filter(p => {
        if (filtroProjeto !== 'todos' && p.nome !== filtroProjeto) {
          return false;
        }

        // Filtro por texto na busca
        if (q) {
          const matchNome = p.nome.toLowerCase().includes(q);
          const matchResp = p.fases.some(f => f.responsaveis.some(r => r.toLowerCase().includes(q)));
          const matchLog = p.fases.some(f => (f.ultimoLog?.observacoes || '').toLowerCase().includes(q));
          if (!matchNome && !matchResp && !matchLog) return false;
        }

        // Filtro por Situação
        if (filtroSituacao === 'atrasado' && p.qtdFasesAtrasadas === 0 && !p.atrasadoTotal) return false;
        if (filtroSituacao === 'em_andamento' && p.qtdFasesEmAndamento === 0) return false;
        if (filtroSituacao === 'concluido' && !p.concluidoGeral) return false;
        if (filtroSituacao === 'nao_iniciado' && p.progressoGeral > 0) return false;

        return true;
      })
      .map(p => {
        // Se houver filtro de etapa específico, filtra as fases exibidas
        if (filtroEtapa !== 'todos') {
          return {
            ...p,
            fases: p.fases.filter(f => f.key === filtroEtapa),
          };
        }
        return p;
      });
  }, [projetosProcessados, search, filtroProjeto, filtroEtapa, filtroSituacao]);

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#070c18] text-slate-900 dark:text-slate-100 p-4 md:p-8 font-sans transition-colors">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Topbar & Navegação ────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 dark:bg-[#0d1527]/80 backdrop-blur-md p-4 md:p-6 rounded-2xl border border-slate-200/80 dark:border-[#1e293b]/80 shadow-sm">
          <div className="flex items-center gap-3">
            <BackButton fallback="/visao-geral" />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Irrigação & Obras
                </span>
                <span className="text-xs text-slate-400">• Atualizado {lastUpdate.toLocaleTimeString('pt-BR')}</span>
              </div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span>⚡ Painel Operacional de Obras</span>
              </h1>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Acompanhamento em tempo real das 6 fases oficiais e apontamentos do Diário de Campo.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#16203a] hover:bg-slate-200 dark:hover:bg-[#1f2d4e] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#1e293b] flex items-center gap-1.5 transition-all"
              title="Recarregar dados"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>

            <Link
              href="/irrigacao/diario-campo"
              className="px-3.5 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex items-center gap-1.5 transition-all shadow-emerald-500/20"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Diário de Campo</span>
            </Link>

            <Link
              href="/visao-geral"
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600/10 dark:bg-indigo-500/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center gap-1.5 transition-all"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Aba Diretor</span>
            </Link>

            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>

        {/* ── Cards de KPIs Operacionais ───────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-medium">Projetos Ativos</span>
              <Layers className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {kpis.totalProjetos}
            </div>
            <span className="text-[11px] text-slate-400">obras cadastradas</span>
          </div>

          <div className="bg-white dark:bg-[#0d1527] border border-blue-500/30 rounded-2xl p-4 shadow-sm bg-gradient-to-br from-blue-500/5 to-transparent">
            <div className="flex items-center justify-between text-blue-500 mb-1">
              <span className="text-xs font-bold">Fases em Execução</span>
              <Clock className="w-4 h-4 text-blue-500 animate-pulse" />
            </div>
            <div className="text-2xl font-black text-blue-600 dark:text-blue-400">
              {kpis.totalFasesAndamento}
            </div>
            <span className="text-[11px] text-blue-500/80">em andamento normal</span>
          </div>

          <div className={`bg-white dark:bg-[#0d1527] border rounded-2xl p-4 shadow-sm ${
            kpis.totalFasesAtrasadas > 0 
              ? 'border-rose-500/40 bg-gradient-to-br from-rose-500/10 to-transparent' 
              : 'border-slate-200 dark:border-[#1e293b]'
          }`}>
            <div className="flex items-center justify-between text-rose-500 mb-1">
              <span className="text-xs font-bold">Fases em Atraso</span>
              <AlertTriangle className={`w-4 h-4 ${kpis.totalFasesAtrasadas > 0 ? 'animate-bounce text-rose-500' : 'text-slate-400'}`} />
            </div>
            <div className={`text-2xl font-black ${kpis.totalFasesAtrasadas > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
              {kpis.totalFasesAtrasadas}
            </div>
            <span className="text-[11px] text-rose-500/80 font-medium">requerem atenção</span>
          </div>

          <div className="bg-white dark:bg-[#0d1527] border border-emerald-500/30 rounded-2xl p-4 shadow-sm bg-gradient-to-br from-emerald-500/5 to-transparent">
            <div className="flex items-center justify-between text-emerald-500 mb-1">
              <span className="text-xs font-bold">Fases Concluídas</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {kpis.totalFasesConcluidas}
            </div>
            <span className="text-[11px] text-emerald-500/80">100% finalizadas</span>
          </div>

          <div className="bg-white dark:bg-[#0d1527] border border-purple-500/30 rounded-2xl p-4 shadow-sm col-span-2 sm:col-span-1 bg-gradient-to-br from-purple-500/5 to-transparent">
            <div className="flex items-center justify-between text-purple-500 mb-1">
              <span className="text-xs font-bold">Apontamentos Hoje</span>
              <FileText className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
              {kpis.totalLogsHoje}
            </div>
            <span className="text-[11px] text-purple-500/80">{kpis.totalLogsGeral} no total</span>
          </div>
        </div>

        {/* ── Barra de Filtros e Busca ──────────────────────────────────── */}
        <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por projeto, responsável ou observação..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-[#16203a] border border-slate-200 dark:border-[#1e293b] rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Filtro Projeto */}
            <select
              value={filtroProjeto}
              onChange={(e) => setFiltroProjeto(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-[#16203a] border border-slate-200 dark:border-[#1e293b] rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="todos">Todos os Projetos ({projetosList.length})</option>
              {projetosList.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            {/* Filtro Etapa Oficial */}
            <select
              value={filtroEtapa}
              onChange={(e) => setFiltroEtapa(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-[#16203a] border border-slate-200 dark:border-[#1e293b] rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="todos">Todas as 6 Fases</option>
              {ETAPAS_OFICIAIS.map(et => (
                <option key={et.key} value={et.key}>{et.icon} {et.order}. {et.label}</option>
              ))}
            </select>

            {/* Filtro Situação */}
            <select
              value={filtroSituacao}
              onChange={(e) => setFiltroSituacao(e.target.value as any)}
              className="px-3 py-2 bg-slate-50 dark:bg-[#16203a] border border-slate-200 dark:border-[#1e293b] rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="todos">Todas as Situações</option>
              <option value="em_andamento">⚡ Em Andamento</option>
              <option value="atrasado">🚨 Com Atraso</option>
              <option value="concluido">✅ Concluídas</option>
              <option value="nao_iniciado">⚪ Não Iniciadas</option>
            </select>
          </div>
        </div>

        {/* ── Lista de Projetos com Pipeline das 6 Fases Oficiais ───────── */}
        {loading ? (
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-12 text-center">
            <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">Carregando painel operacional das obras...</p>
          </div>
        ) : projetosFiltrados.length === 0 ? (
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-12 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Nenhum projeto encontrado com os filtros atuais</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Experimente limpar o campo de busca ou selecionar &quot;Todos os Projetos&quot;.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {projetosFiltrados.map((projeto) => (
              <div
                key={projeto.nome}
                className="bg-white dark:bg-[#0d1527] border border-slate-200/90 dark:border-[#1e293b] rounded-2xl p-5 md:p-6 shadow-md transition-all hover:border-slate-300 dark:hover:border-slate-700"
              >
                {/* Header do Projeto */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-[#1e293b]">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider bg-slate-100 dark:bg-[#16203a] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#1e293b]">
                        {projeto.versao !== 'V0' ? `${projeto.versao}` : 'PROJETO'}
                      </span>
                      <h2 className="text-lg md:text-xl font-black text-slate-900 dark:text-white">
                        {projeto.baseName}
                      </h2>
                      {projeto.atrasadoTotal && (
                        <span className="px-2 py-0.5 rounded-md text-xs font-black bg-rose-600 text-white animate-pulse shadow-sm">
                          🚨 Obra em Atraso ({Math.abs(projeto.diasRestantesTotal)}d)
                        </span>
                      )}
                      {projeto.concluidoGeral && (
                        <span className="px-2 py-0.5 rounded-md text-xs font-black bg-emerald-600 text-white shadow-sm">
                          ✅ Obra Concluída
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex-wrap">
                      {projeto.dataInicio && (
                        <span>Início: <strong>{new Date(`${projeto.dataInicio}T00:00:00`).toLocaleDateString('pt-BR')}</strong></span>
                      )}
                      <span>Prazo Final: <strong>{projeto.prazoFinalFormatado}</strong></span>
                      {projeto.prazoFinal && !projeto.concluidoGeral && (
                        <span className={projeto.atrasadoTotal ? 'text-rose-500 font-bold' : 'text-slate-500'}>
                          {projeto.atrasadoTotal ? `Vencido há ${Math.abs(projeto.diasRestantesTotal)} dias` : `Restam ${projeto.diasRestantesTotal} dias`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progresso Geral & Botão Diário */}
                  <div className="flex items-center gap-3 self-start md:self-auto">
                    <div className="text-right shrink-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Progresso Geral</span>
                      <span className="text-lg font-black text-slate-900 dark:text-white">{projeto.progressoGeral}%</span>
                    </div>

                    <div className="w-24 h-2.5 bg-slate-100 dark:bg-[#16203a] rounded-full overflow-hidden shrink-0 border border-slate-200/50 dark:border-[#1e293b]">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          projeto.concluidoGeral ? 'bg-emerald-500' : projeto.atrasadoTotal ? 'bg-rose-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${projeto.progressoGeral}%` }}
                      />
                    </div>

                    <Link
                      href={`/irrigacao/diario-campo`}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1 transition-all"
                      title="Abrir no Diário de Campo"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Apontar</span>
                    </Link>
                  </div>
                </div>

                {/* ── Pipeline Visual das 6 Fases ───────────────────────── */}
                <div className="my-4 p-3 bg-slate-50 dark:bg-[#0a0f1d] rounded-xl border border-slate-200/60 dark:border-[#1e293b]/60">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    <span>Esteira Oficial das 6 Fases de Campo</span>
                    <span>{projeto.qtdFasesConcluidas}/6 Concluídas</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                    {projeto.fases.map((fase) => {
                      let bgCard = 'bg-white dark:bg-[#111a30] text-slate-400 border-slate-200 dark:border-[#1e293b]';
                      let dotColor = 'bg-slate-300 dark:bg-slate-700';

                      if (fase.situacaoFase === 'concluido') {
                        bgCard = 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
                        dotColor = 'bg-emerald-500';
                      } else if (fase.situacaoFase === 'atrasado') {
                        bgCard = 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/40 animate-pulse';
                        dotColor = 'bg-rose-500';
                      } else if (fase.situacaoFase === 'em_andamento') {
                        bgCard = 'bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';
                        dotColor = 'bg-blue-500 animate-ping';
                      }

                      return (
                        <div
                          key={fase.key}
                          className={`p-2 rounded-lg border text-center transition-all ${bgCard}`}
                        >
                          <div className="flex items-center justify-center gap-1 mb-0.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                            <span className="text-[11px]">{fase.icon}</span>
                            <span className="text-[11px] font-bold truncate">{fase.order}. {fase.label}</span>
                          </div>
                          <span className="text-[10px] font-mono font-bold block">
                            {fase.progresso}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Cards / Grade Operacional das Fases ────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2">
                  {projeto.fases.map((fase) => {
                    const isConcluida = fase.situacaoFase === 'concluido';
                    const isAtrasada = fase.situacaoFase === 'atrasado';
                    const isAndamento = fase.situacaoFase === 'em_andamento';

                    return (
                      <div
                        key={fase.key}
                        className={`rounded-xl p-3.5 border transition-all flex flex-col justify-between ${
                          isAtrasada
                            ? 'bg-rose-50/50 dark:bg-rose-950/10 border-rose-500/40'
                            : isConcluida
                            ? 'bg-emerald-50/30 dark:bg-emerald-950/10 border-emerald-500/30'
                            : isAndamento
                            ? 'bg-blue-50/30 dark:bg-blue-950/10 border-blue-500/30'
                            : 'bg-slate-50/50 dark:bg-[#0c1324] border-slate-200 dark:border-[#1e293b]'
                        }`}
                      >
                        <div>
                          {/* Cabeçalho da Fase */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                                Fase {fase.order} de 6
                              </span>
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <span>{fase.icon}</span>
                                <span>{fase.label}</span>
                              </h4>
                            </div>

                            {/* Badge de Situação */}
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide shrink-0 ${
                              isConcluida
                                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                : isAtrasada
                                ? 'bg-rose-600 text-white shadow-sm'
                                : isAndamento
                                ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                            }`}>
                              {isConcluida
                                ? 'Concluída'
                                : isAtrasada
                                ? `+${fase.diasAtraso}d Atraso`
                                : isAndamento
                                ? `Restam ${fase.diasRestantesFase}d`
                                : 'Não Iniciada'}
                            </span>
                          </div>

                          {/* Prazos da Fase */}
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5 mb-2.5">
                            <div className="flex justify-between">
                              <span>Prazo Limite:</span>
                              <strong className="text-slate-700 dark:text-slate-200">{fase.prazoFaseFormatado}</strong>
                            </div>
                            {fase.dataInicioFase && (
                              <div className="flex justify-between">
                                <span>Início:</span>
                                <span>{new Date(`${fase.dataInicioFase}T00:00:00`).toLocaleDateString('pt-BR')}</span>
                              </div>
                            )}
                          </div>

                          {/* Responsáveis da Fase */}
                          <div className="p-2 rounded-lg bg-white/80 dark:bg-[#16203a]/80 border border-slate-200/60 dark:border-[#1e293b]/60 mb-2.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                              👤 Equipe Responsável:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {fase.responsaveis.length > 0 ? (
                                fase.responsaveis.map((resp, rIdx) => (
                                  <span
                                    key={rIdx}
                                    className="px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] text-slate-800 dark:text-slate-200"
                                  >
                                    {resp}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-slate-400 italic">Equipe de campo padrão</span>
                              )}
                            </div>
                          </div>

                          {/* Último Apontamento no Diário */}
                          {fase.ultimoLog && (
                            <div className="p-2 rounded-lg bg-slate-100/70 dark:bg-[#070c18]/70 border border-slate-200/50 dark:border-[#1e293b]/50 text-[11px] mb-2.5">
                              <div className="flex items-center justify-between text-slate-400 mb-0.5">
                                <span className="font-bold">📝 Último Apontamento:</span>
                                <span>{new Date(`${fase.ultimoLog.data}T00:00:00`).toLocaleDateString('pt-BR')}</span>
                              </div>
                              <p className="text-slate-700 dark:text-slate-300 line-clamp-2 italic">
                                &quot;{fase.ultimoLog.observacoes || fase.ultimoLog.status}&quot;
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Barra de Progresso da Fase & Ação */}
                        <div className="pt-2 border-t border-slate-200/50 dark:border-[#1e293b]/50">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="text-slate-400">Progresso da Fase:</span>
                            <span className="font-black text-slate-800 dark:text-slate-200">{fase.progresso}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-2.5">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isConcluida ? 'bg-emerald-500' : isAtrasada ? 'bg-rose-500' : 'bg-blue-500'
                              }`}
                              style={{ width: `${fase.progresso}%` }}
                            />
                          </div>

                          <Link
                            href="/irrigacao/diario-campo"
                            className="w-full py-1.5 px-2.5 rounded-lg text-xs font-bold text-center bg-white dark:bg-[#16203a] hover:bg-slate-100 dark:hover:bg-[#1f2d4e] border border-slate-200 dark:border-[#1e293b] text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1 transition-all"
                          >
                            <FileText className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Registrar no Diário</span>
                            <ArrowRight className="w-3 h-3 text-slate-400 ml-auto" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
