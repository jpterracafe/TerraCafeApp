"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import {
  LayoutDashboard, Search, CheckCircle2, AlertCircle, Clock,
  Calendar, Users, CloudRain, ChevronRight, Layers, ArrowUpRight,
  RefreshCw, FileText, Check, Plus, Loader2,
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
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'em_andamento' | 'atrasado' | 'concluido'>('todos');

  const [fases, setFases] = useState<FaseAcao[]>([]);

  // Carrega dados consolidados
  const carregarDados = useCallback(async () => {
    try {
      const [resProj, resConfig, resFases] = await Promise.all([
        fetch('/api/projetos').then(r => r.ok ? r.json() : { projetos: [] }),
        fetch('/api/etapas-config').then(r => r.ok ? r.json() : null),
        fetch('/api/fases').then(r => r.ok ? r.json() : { fases: [] }),
      ]);

      const lista = resProj.projetos ?? [];
      setProjetosList(lista);

      if (resConfig) {
        setConfig(resConfig);
      }

      setFases(resFases.fases ?? []);
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

  // ── Auto-refresh: polling 30s + recarga ao focar/visibilidade ─────────
  useEffect(() => {
    let timerId: ReturnType<typeof setInterval> | null = null;
    const REFRESH_MS = 30 * 1000;

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
  }, [carregarDados, loading, refreshing]);

  const handleRefresh = () => {
    setRefreshing(true);
    carregarDados();
  };

  // Processa dados de cada projeto para a tela executiva de Paulo
  const projetosProcessados = useMemo(() => {
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
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        dPrazo.setHours(0, 0, 0, 0);
        const diffMs = dPrazo.getTime() - hoje.getTime();
        diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        atrasado = diasRestantes < 0;
      }

      // Detalhamento das 6 fases individuais
      let somaProgresso = 0;
      const fasesDetalhadas = ETAPAS_OFICIAIS.map(et => {
        const chaveEtapa = `${nomeProjeto}::${et.key}`;
        const respConfig = config.responsaveisPorEtapa[chaveEtapa] || [];
        const respFasesAcao = fases.filter(f =>
          !f.isDeleted &&
          f.projetoCliente.trim() === nomeProjeto.trim() &&
          f.etapaCampo === et.key &&
          f.responsavel &&
          f.responsavel.trim() &&
          f.responsavel.trim() !== 'Não atribuído'
        ).map(f => f.responsavel.trim());
        const responsaveis = Array.from(
          new Set([...respFasesAcao, ...respConfig.map(r => (r || '').trim()).filter(Boolean)])
        ).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
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

        if (hasStarted && prazoLimiteFase) {
          const dFim = new Date(`${prazoLimiteFase}T00:00:00`);
          const hoje = new Date();
          hoje.setHours(0, 0, 0, 0);
          dFim.setHours(0, 0, 0, 0);
          diasRestantesFase = Math.ceil((dFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          atrasadaFase = diasRestantesFase < 0 && pctProgresso < 100;
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
          status,
        };
      });

      const progressoGeral = Math.round(somaProgresso / ETAPAS_OFICIAIS.length);
      const concluidoGeral = progressoGeral >= 100;

      return {
        nome: nomeProjeto,
        baseName: extractProjectBaseName(nomeProjeto),
        versao: getProjectVersion(nomeProjeto),
        prazoFinal,
        prazoFormatado,
        dataInicio,
        diasRestantes,
        atrasado,
        concluidoGeral,
        progressoGeral,
        justificativas,
        fases: fasesDetalhadas,
      };
    });
  }, [projetosList, config, fases]);

  // Filtros aplicados
  const projetosFiltrados = useMemo(() => {
    return projetosProcessados.filter(p => {
      const matchBusca = p.nome.toLowerCase().includes(search.toLowerCase());
      if (!matchBusca) return false;

      if (filtroStatus === 'concluido') return p.concluidoGeral;
      if (filtroStatus === 'atrasado') return p.atrasado && !p.concluidoGeral;
      if (filtroStatus === 'em_andamento') return !p.concluidoGeral && !p.atrasado;
      return true;
    });
  }, [projetosProcessados, search, filtroStatus]);

  // KPIs da Diretoria
  const statsGerais = useMemo(() => {
    const total = projetosProcessados.length;
    const concluidos = projetosProcessados.filter(p => p.concluidoGeral).length;
    const atrasados = projetosProcessados.filter(p => p.atrasado && !p.concluidoGeral).length;
    const emAndamento = total - concluidos - atrasados;
    const mediaProgresso = total > 0
      ? Math.round(projetosProcessados.reduce((acc, p) => acc + p.progressoGeral, 0) / total)
      : 0;
    const totalJustificativas = projetosProcessados.reduce((acc, p) => acc + p.justificativas.length, 0);

    return { total, concluidos, atrasados, emAndamento, mediaProgresso, totalJustificativas };
  }, [projetosProcessados]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070c18] text-slate-800 dark:text-slate-100 font-sans pb-16">
      
      {/* ── HEADER SUPERIOR EXECUTIVO (SEM DUPLICAÇÃO) ── */}
      <div className="bg-white dark:bg-[#0d1527] border-b border-slate-200 dark:border-[#1e293b] px-4 md:px-8 py-5 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                Painel da Diretoria • Resumo Executivo
              </span>
              <span className="text-xs text-slate-400">
                Visão Consolidada de Irrigação
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex flex-wrap items-center gap-2.5">
              <LayoutDashboard className="w-7 h-7 text-blue-600 dark:text-blue-400" />
              Resumo Geral de Projetos (Paulo - Diretor)
              <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider">
                Somente Leitura
              </span>
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Acompanhamento independente das 6 fases de cada obra: início, prazos específicos de cada fase, responsáveis e justificativas.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-[#111a30] hover:bg-slate-200 dark:hover:bg-[#1a2542] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#1e293b] flex items-center gap-2 transition-all shadow-sm"
              title="Atualizar dados"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-500' : ''}`} />
              <span>Atualizar</span>
            </button>

            <button
              onClick={() => router.push('/irrigacao/diario-campo')}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 shadow-md shadow-blue-900/20 transition-all active:scale-95"
            >
              <FileText className="w-4 h-4" />
              <span>Abrir Diário de Campo</span>
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-8 mt-6 space-y-6">

        {/* ── CARDS DE KPIS DIRETORIA ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Projetos</span>
            <div className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white mt-1">
              {statsGerais.total}
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Obras cadastradas</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-500">Média de Execução</span>
            <div className="text-2xl md:text-3xl font-black text-blue-600 dark:text-blue-400 mt-1">
              {statsGerais.mediaProgresso}%
            </div>
            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${statsGerais.mediaProgresso}%` }} />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-500">Em Andamento</span>
            <div className="text-2xl md:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {statsGerais.emAndamento}
            </div>
            <span className="text-[11px] text-emerald-600/80 mt-1 block">No cronograma</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-500">Com Alerta / Atraso</span>
            <div className="text-2xl md:text-3xl font-black text-rose-600 dark:text-rose-400 mt-1">
              {statsGerais.atrasados}
            </div>
            <span className="text-[11px] text-rose-500/80 mt-1 block">Prazo expirado</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-500">Entregues</span>
            <div className="text-2xl md:text-3xl font-black text-purple-600 dark:text-purple-400 mt-1">
              {statsGerais.concluidos}
            </div>
            <span className="text-[11px] text-purple-500/80 mt-1 block">100% concluídos</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500">Justificativas</span>
            <div className="text-2xl md:text-3xl font-black text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1.5">
              <CloudRain className="w-5 h-5 text-amber-500" />
              {statsGerais.totalJustificativas}
            </div>
            <span className="text-[11px] text-amber-600/80 mt-1 block">Chuva e quebras</span>
          </div>
        </div>

        {/* ── BARRA DE BUSCA E FILTROS ── */}
        <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por projeto ou fazenda..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl pl-9 pr-3 py-2 text-xs md:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
            <span className="text-xs text-slate-400 font-semibold mr-1 shrink-0">Filtrar:</span>
            {[
              { id: 'todos', label: 'Todos os Projetos' },
              { id: 'em_andamento', label: 'Em Andamento' },
              { id: 'atrasado', label: 'Em Alerta / Atrasados' },
              { id: 'concluido', label: 'Concluídos' },
            ].map(f => (
              <button
                key={f.id}
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

        {/* ── LISTAGEM DE PROJETOS COM AS 6 FASES, INÍCIO E PRAZO INDIVIDUAL ── */}
        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              Carregando resumo executivo dos projetos...
            </p>
          </div>
        ) : projetosFiltrados.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl">
            <Layers className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-40" />
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">Nenhum projeto encontrado</h3>
            <p className="text-xs text-slate-500 mt-1">Crie projetos no Diário de Campo para que eles apareçam aqui.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {projetosFiltrados.map((proj) => (
              <div
                key={proj.nome}
                className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-5 md:p-6 shadow-md transition-all hover:border-blue-500/40 space-y-5"
              >
                {/* Cabeçalho do Card do Projeto */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-[#1e293b] pb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        Projeto de Irrigação
                      </span>
                      <span className="text-xs text-slate-400">
                        Start da Obra: {proj.dataInicio ? new Date(`${proj.dataInicio}T00:00:00`).toLocaleDateString('pt-BR') : 'Não iniciado'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">
                        {proj.baseName}
                      </h2>
                      <span className="px-2 py-0.5 rounded text-xs font-black border bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                        {proj.versao}
                      </span>
                    </div>
                  </div>

                  {/* Indicador de Prazo Final TOTAL da Obra & Progresso Geral */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Prazo Final Total do Projeto */}
                    <div className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                      proj.concluidoGeral
                        ? 'bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400'
                        : proj.atrasado
                          ? 'bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400 animate-pulse'
                          : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                    }`}>
                      <Calendar className="w-4 h-4" />
                      <div>
                        <span className="block text-[10px] font-semibold opacity-75">
                          🔒 Prazo Final Total da Obra: {proj.prazoFormatado}
                        </span>
                        <span>
                          {proj.concluidoGeral
                            ? 'Projeto Totalmente Concluído'
                            : proj.atrasado
                              ? `Obra Atrasada (+${Math.abs(proj.diasRestantes)} dias do prazo total)`
                              : `Restam ${proj.diasRestantes} dias para entrega final`}
                        </span>
                      </div>
                    </div>

                    {/* Badge de Progresso Geral */}
                    <div className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#111a30] border border-slate-200 dark:border-[#1e293b] text-right">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Progresso Médio</span>
                      <span className="text-lg font-black text-blue-600 dark:text-blue-400">
                        {proj.progressoGeral}%
                      </span>
                    </div>

                    {/* Botão de abrir no diário */}
                    <button
                      type="button"
                      onClick={() => router.push(`/irrigacao/diario-campo`)}
                      className="p-2 rounded-xl bg-slate-100 dark:bg-[#111a30] hover:bg-blue-600 hover:text-white border border-slate-200 dark:border-[#1e293b] text-slate-600 dark:text-slate-300 transition-all"
                      title="Abrir no Diário de Campo"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* ── AS 6 FASES DO PROJETO EM GRID COM DATAS INDIVIDUAIS ── */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-500" />
                      Acompanhamento das 6 Fases (Início e Prazo Individual de Cada Fase):
                    </span>
                    <span className="text-[11px] text-slate-400 hidden sm:inline">
                      Cada fase tem início e prazo próprios antes do prazo final da obra
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
                              ? 'bg-purple-500/5 border-purple-500/30 dark:bg-purple-950/10'
                              : fase.atrasadaFase
                                ? 'bg-rose-500/5 border-rose-500/30 dark:bg-rose-950/10'
                                : fase.hasStarted
                                  ? 'bg-blue-500/5 border-blue-500/30 dark:bg-blue-950/10'
                                  : 'bg-slate-50 dark:bg-[#0a1020] border-slate-200 dark:border-[#1e293b]'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-lg">{fase.icon}</span>
                                <div className="min-w-0">
                                  <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate capitalize">
                                    {fase.order}. {fase.label}
                                  </h4>
                                  <p className="text-[10px] text-slate-400 truncate">{fase.desc}</p>
                                </div>
                              </div>

                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                                isConcluida
                                  ? 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-500/30'
                                  : fase.atrasadaFase
                                    ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border-rose-500/30'
                                    : fase.hasStarted
                                      ? 'bg-blue-500/20 text-blue-600 dark:text-blue-300 border-blue-500/30'
                                      : 'bg-slate-200 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'
                              }`}>
                                {fase.status}
                              </span>
                            </div>

                            {/* Informações de Início e Prazo Limite desta Fase */}
                            <div className="p-2 rounded-lg bg-white/60 dark:bg-[#070c18]/60 border border-slate-200/60 dark:border-[#1e293b]/60 mb-2.5 space-y-1 text-[11px]">
                              {fase.hasStarted ? (
                                <>
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-400">Início da Fase:</span>
                                    <strong className="text-slate-700 dark:text-slate-200">
                                      {new Date(`${fase.dataInicioFase}T00:00:00`).toLocaleDateString('pt-BR')}
                                    </strong>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-400">Prazo da Fase:</span>
                                    <strong className={fase.atrasadaFase ? 'text-rose-500' : 'text-blue-600 dark:text-blue-400'}>
                                      {fase.prazoFaseFormatado} ({fase.metaDiasFase}d)
                                    </strong>
                                  </div>
                                  <div className="flex items-center justify-between text-[10px] pt-0.5 border-t border-slate-100 dark:border-[#1e293b]">
                                    <span className="text-slate-400">Situação:</span>
                                    <span className={`font-bold ${fase.atrasadaFase ? 'text-rose-500' : isConcluida ? 'text-purple-500' : 'text-emerald-500'}`}>
                                      {isConcluida
                                        ? 'Entregue'
                                        : fase.atrasadaFase
                                          ? `+${Math.abs(fase.diasRestantesFase)}d em atraso`
                                          : `Restam ${fase.diasRestantesFase} dias`}
                                    </span>
                                  </div>
                                </>
                              ) : (
                                <div className="flex items-center justify-between text-slate-400">
                                  <span>Fase não iniciada ainda</span>
                                </div>
                              )}
                            </div>

                            {/* Responsável atribuído na etapa */}
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 mb-2">
                              <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span className="text-slate-400">Responsável:</span>
                              <strong className="truncate">
                                {fase.responsaveis.length > 0 ? fase.responsaveis.join(', ') : 'Equipe Técnica Geral'}
                              </strong>
                            </div>
                          </div>

                          {/* Barra e % de Execução Interativa + Botão de Configurar Prazo */}
                          <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-[#1e293b]">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-400">Execução:</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                                isConcluida
                                  ? 'bg-purple-600 text-white'
                                  : fase.progresso >= 25
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                              }`}>
                                {fase.progresso}%
                              </span>
                            </div>

                            <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  isConcluida
                                    ? 'bg-purple-600'
                                    : fase.progresso > 0
                                      ? 'bg-gradient-to-r from-blue-500 to-emerald-500'
                                      : 'bg-slate-300 dark:bg-slate-700'
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

                {/* ── HISTÓRICO DE JUSTIFICATIVAS / AUDITORIA DE ATRASOS PARA PAULO ── */}
                {proj.justificativas.length > 0 && (
                  <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/25 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        Justificativas de Ocorrências Registradas pela Equipe ({proj.justificativas.length}):
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Auditoria de Motivos de Atraso
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

      {/* ── MODAL: INICIAR / DEFINIR PRAZO DA FASE ESPECÍFICA ── */}
      {faseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Início e Prazo da Fase
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                    {faseModalProjeto} • Fase: {faseModalEtapa}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFaseModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-[#1e293b] text-slate-500"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              {config.projetosPrazoFinal[faseModalProjeto] && (
                <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/25 text-purple-700 dark:text-purple-300 text-xs">
                  <span className="font-bold block">Prazo Final Total da Obra:</span>
                  <span className="text-sm font-black">
                    {new Date(`${config.projetosPrazoFinal[faseModalProjeto]}T00:00:00`).toLocaleDateString('pt-BR')}
                  </span>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    O prazo limite desta fase deve ser concluído antes ou até o prazo final da obra.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  1. Data de Início desta Fase: *
                </label>
                <input
                  type="date"
                  required
                  value={faseModalDataInicio}
                  onChange={(e) => setFaseModalDataInicio(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  2. Data Limite / Prazo desta Fase: *
                </label>
                <input
                  type="date"
                  required
                  value={faseModalPrazoLimite}
                  onChange={(e) => setFaseModalPrazoLimite(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFaseModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e293b]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingFaseConfig}
                onClick={handleSaveFaseConfig}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white flex items-center gap-2 shadow-md shadow-blue-900/20"
              >
                {savingFaseConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Salvar Prazo da Fase
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: REGISTRAR JUSTIFICATIVA RÁPIDA PELA TELA DO DIRETOR ── */}
      {justModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                  <CloudRain className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Registrar Justificativa Oficial
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {justProjeto}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setJustModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-[#1e293b] text-slate-500"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Fase Relacionada:
                </label>
                <select
                  value={justEtapa}
                  onChange={(e) => setJustEtapa(e.target.value as EtapaCampo)}
                  className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                >
                  {ETAPAS_OFICIAIS.map(et => (
                    <option key={et.key} value={et.key}>
                      {et.order}. {et.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Motivo:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    'Chuva no dia',
                    'Problema Técnico / Máquina',
                    'Aguardando Peças',
                    'Falta de Energia',
                    'Ajuste de Projeto',
                    'Outro Imprevisto',
                  ].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setJustMotivo(m)}
                      className={`p-2 rounded-lg border text-xs font-medium text-left transition-all ${
                        justMotivo === m
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-700 dark:text-amber-300 font-bold'
                          : 'bg-slate-50 dark:bg-[#070c18] border-slate-200 dark:border-[#1e293b] text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Detalhamento da Ocorrência: *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Descreva o que ocorreu (ex: Chuva forte impediu trabalho no setor 3...)"
                  value={justTexto}
                  onChange={(e) => setJustTexto(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setJustModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e293b]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingJust || !justTexto.trim()}
                onClick={handleSaveJustificativa}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white flex items-center gap-2 shadow-md shadow-amber-900/20"
              >
                {savingJust ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Salvar Justificativa
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
