"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { DashboardSkeleton } from '@/components/Skeleton';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { extractUsernameFromEmail } from '@/lib/auth-utils';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import BackButton from '@/components/BackButton';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Legend, Area, AreaChart,
} from 'recharts';
import {
  ChevronRight, Layers, AlertTriangle, CheckCircle2, Clock,
  Users, Activity, TrendingUp, BarChart2, RefreshCw, Briefcase,
  FileDown, Calendar, Info, Sparkles, X, Wrench, Eye, ArrowUpRight, CloudRain
} from 'lucide-react';

import { EtapaCampo } from '@/app/irrigacao/types';
import { extractProjectBaseName, getProjectVersion } from '@/app/irrigacao/execucao/page';

// ── Helper para extrair nome do usuário do email @terracafe.com ────────────────
function extractUserName(emailOrName: string | undefined): string {
  if (!emailOrName) return 'Não identificado';
  return extractUsernameFromEmail(emailOrName);
}

// ── Constantes e Definições de Campo ──────────────────────────────────────────

export const ETAPAS_CAMPO_ORDEM: { key: EtapaCampo; label: string; icon: string; desc: string; color: string }[] = [
  { key: 'Valetas',                     label: 'Valetas',                     icon: '⛏️', desc: 'Abertura e nivelamento de valas', color: '#f59e0b' },
  { key: 'montagem campo',              label: 'Montagem Campo',              icon: '🌱', desc: 'Tubulações, gotejadores e conexões', color: '#10b981' },
  { key: 'casa de bombas',              label: 'Casa de Bombas',              icon: '⚙️', desc: 'Bombas, filtros e cabeçal', color: '#3b82f6' },
  { key: 'elétrica',                    label: 'Elétrica',                    icon: '⚡', desc: 'Quadros, automação e cabeamento', color: '#a855f7' },
  { key: 'lavagem do sistema e testes',  label: 'Lavagem e Testes',            icon: '💧', desc: 'Limpeza, pressão e estanqueidade', color: '#06b6d4' },
  { key: 'entrega técnica',             label: 'Entrega Técnica',             icon: '📋', desc: 'Checklist final, treinamento e entrega', color: '#6366f1' },
];

// ── Interfaces ────────────────────────────────────────────────────────────────

interface EtapaConfig {
  dataInicio: string;
  metaDias: number;
}

interface DiarioLog {
  id: string;
  data: string;
  responsavel: string;
  atividade: string;
  status: string;
  observacoes: string;
  projetoCliente?: string;
  midiaUrl?: string;
  midiaTipo?: string;
}

function ChartInfoTooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex items-center">
      <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-help transition-colors" />
      <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover:block w-52 p-2 bg-slate-900 text-white text-[11px] rounded-md shadow-lg z-50 pointer-events-none leading-relaxed">
        {text}
      </div>
    </div>
  );
}

interface HistoricoItem {
  id: string;
  faseId: string;
  campo: string;
  valorAnterior: string;
  valorNovo: string;
  usuario: string;
  criadoEm: string;
}

interface ResponsavelItem {
  id: string;
  nome: string;
  cargo?: string;
}

interface FaseAcaoItem {
  id: string;
  gabarito: string;
  responsavel: string;
  prazoLimite: string;
  status: string;
  projetoCliente?: string;
  isDeleted: boolean;
}

interface ObraCampoResumo {
  nome: string;
  versao: string;
  dataStart: string;
  diaAtual: number;
  etapaAtual: EtapaCampo;
  statusRecente: string;
  diasDecorridosEtapa: number;
  metaDiasEtapa: number;
  diasRestantesEtapa: number;
  pctEtapa: number;
  isAtrasado: number; // 0 = ok, 1 = atrasado
  saude: 'excelente' | 'normal' | 'alerta' | 'chuva';
  totalLogs: number;
  responsaveis: string[];
  ultimoLog?: DiarioLog;
  historicoRendimento: { acima: number; dentro: number; abaixo: number; chuva: number };
}

// ── Componente Principal ──────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  // Extrai o nome do usuário logado do email @terracafe.com
  const currentUser = useMemo(() => {
    if (session?.user?.email) return extractUserName(session.user.email);
    if (session?.user?.name) return session.user.name;
    return 'Diretoria';
  }, [session]);

  // Dados brutos
  const [fases, setFases] = useState<FaseAcaoItem[]>([]);
  const [logs, setLogs] = useState<DiarioLog[]>([]);
  const [, setResponsaveis] = useState<ResponsavelItem[]>([]);
  const [projetosList, setProjetosList] = useState<string[]>([]);
  const [historicoAcoes, setHistoricoAcoes] = useState<HistoricoItem[]>([]);

  // Configurações salvas do Diário
  const [configEtapas, setConfigEtapas] = useState<Record<string, EtapaConfig>>({});
  const [projetoStartDates, setProjetoStartDates] = useState<Record<string, string>>({});
  const [responsaveisPorEtapa, setResponsaveisPorEtapa] = useState<Record<string, string[]>>({});
  const [projetosPrazoFinal, setProjetosPrazoFinal] = useState<Record<string, string>>({});
  const [usuariosRoles, setUsuariosRoles] = useState<Record<string, string>>({});

  // Controles de Visualização
  const [activeTab, setActiveTab] = useState<'campo' | 'cronograma'>('campo');
  const [selectedProjetoFilter, setSelectedProjetoFilter] = useState<string>('__todos__');
  const [periodoFilter, setPeriodoFilter] = useState<'7d' | '15d' | '30d' | 'tudo'>('30d');

  // Modal / Lightbox de Foto
  const [fotoModal, setFotoModal] = useState<DiarioLog | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'authenticated') router.push('/login');
  }, [status, router]);

  // Carrega dados das APIs e localStorage
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Ler localStorage
      try {
        const savedConfig = localStorage.getItem('diario_etapas_config_v1');
        if (savedConfig) setConfigEtapas(JSON.parse(savedConfig));

        const savedStarts = localStorage.getItem('diario_projeto_starts_v1');
        if (savedStarts) setProjetoStartDates(JSON.parse(savedStarts));

        const savedResp = localStorage.getItem('diario_responsaveis_por_etapa_v1');
        if (savedResp) setResponsaveisPorEtapa(JSON.parse(savedResp));

        const savedPrazos = localStorage.getItem('diario_projetos_prazo_final_v1');
        if (savedPrazos) setProjetosPrazoFinal(JSON.parse(savedPrazos));
      } catch (e) {
        console.error('[dashboard] Erro ao ler localStorage:', e);
      }

      const [fasesRes, respRes, logsRes, projRes, configRes, histRes, rolesRes] = await Promise.all([
        fetch('/api/fases'),
        fetch('/api/responsaveis'),
        fetch('/api/diario-logs'),
        fetch('/api/projetos'),
        fetch('/api/etapas-config'),
        fetch('/api/historico-fases'),
        fetch('/api/usuarios-roles'),
      ]);

      const fasesJson  = fasesRes.ok  ? await fasesRes.json()  : { fases: [] };
      const respJson   = respRes.ok   ? await respRes.json()   : { responsaveis: [] };
      const logsJson   = logsRes.ok   ? await logsRes.json()   : { logs: [] };
      const projJson   = projRes.ok   ? await projRes.json()   : { projetos: [] };
      const configJson = configRes.ok ? await configRes.json() : null;
      const histJson   = histRes.ok   ? await histRes.json()   : { historico: [] };
      const rolesJson  = rolesRes.ok  ? await rolesRes.json()  : { users: [] };

      if (configJson) {
        if (configJson.configEtapas) setConfigEtapas(configJson.configEtapas);
        if (configJson.projetoStartDates) setProjetoStartDates(configJson.projetoStartDates);
        if (configJson.responsaveisPorEtapa) setResponsaveisPorEtapa(configJson.responsaveisPorEtapa);
        if (configJson.projetosPrazoFinal) setProjetosPrazoFinal(configJson.projetosPrazoFinal);
      }

      setHistoricoAcoes(histJson.historico ?? []);

      // Mapeamento de cargos de usuários
      const roleMap: Record<string, string> = {};
      (rolesJson.users || []).forEach((u: { name?: string; email?: string; role?: string }) => {
        if (u.email) roleMap[u.email.toLowerCase().trim()] = u.role || 'Agricultor';
        if (u.name) roleMap[u.name.toLowerCase().trim()] = u.role || 'Agricultor';
      });
      setUsuariosRoles(roleMap);

      const allFases: FaseAcaoItem[] = fasesJson.fases ?? [];
      const allLogs: DiarioLog[] = logsJson.logs ?? [];
      const allResp: ResponsavelItem[] = respJson.responsaveis ?? [];
      const fromApiProj: string[] = projJson.projetos ?? [];

      // Monta lista única de projetos ativos
      const projetosFases = allFases
        .filter(f => !f.isDeleted && f.projetoCliente && f.projetoCliente.trim() !== '')
        .map(f => f.projetoCliente as string);

      const projetosAtivosSet = new Set(projetosFases);

      const deletados = new Set<string>(
        allFases
          .filter(f => f.isDeleted && f.projetoCliente && f.projetoCliente.trim() !== '')
          .map(f => f.projetoCliente as string)
          .filter(p => !projetosAtivosSet.has(p))
      );

      const projetosDiario = allLogs
        .filter(l => l.projetoCliente && l.projetoCliente.trim() !== '')
        .map(l => l.projetoCliente as string);

      const unicos = Array.from(
        new Set([...projetosFases, ...projetosDiario, ...fromApiProj].filter(p => !deletados.has(p)))
      ).sort();

      setFases(allFases.filter(f => !f.isDeleted));
      setLogs(allLogs);
      setResponsaveis(allResp);
      setProjetosList(unicos);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('[dashboard] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      const timer = setTimeout(() => {
        void loadData();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [status, loadData]);

  // ── Auto-refresh: polling 30s + recarga ao focar/visibilidade ─────────
  useEffect(() => {
    if (status !== 'authenticated') return;
    let timerId: ReturnType<typeof setInterval> | null = null;
    const REFRESH_MS = 30 * 1000;

    const startPolling = () => {
      if (timerId) return;
      timerId = setInterval(() => {
        if (!loading) loadData();
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
        if (!loading) loadData();
        startPolling();
      } else {
        stopPolling();
      }
    };

    const onFocus = () => {
      if (!loading) loadData();
    };

    startPolling();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [status, loadData, loading]);

  // ── Filtro por Período de Logs ──────────────────────────────────────────────
  const logsFiltradosPeriodo = useMemo(() => {
    if (periodoFilter === 'tudo') return logs;
    const dias = periodoFilter === '7d' ? 7 : periodoFilter === '15d' ? 15 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - dias);
    cutoff.setHours(0, 0, 0, 0);

    return logs.filter(l => {
      const d = new Date(`${l.data}T00:00:00`);
      return d >= cutoff;
    });
  }, [logs, periodoFilter]);

  // ── Construção do Mapa das Obras de Campo ────────────────────────────────────
  const obrasCampo = useMemo((): ObraCampoResumo[] => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    return projetosList.map(nomeProjeto => {
      const logsProjeto = logs.filter(l => (l.projetoCliente || '').trim() === nomeProjeto.trim());
      
      // Data de Start do Projeto
      let dataStart = projetoStartDates[nomeProjeto];
      if (!dataStart) {
        if (logsProjeto.length > 0) {
          const datas = logsProjeto.map(l => l.data).sort();
          dataStart = datas[0];
        } else {
          dataStart = hoje.toISOString().split('T')[0];
        }
      }

      // Dia Atual do Projeto
      const start = new Date(`${dataStart}T00:00:00`);
      start.setHours(0, 0, 0, 0);
      const diffMs = hoje.getTime() - start.getTime();
      const diaAtual = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);

      // Descobre a Etapa Atual do Projeto
      let etapaAtual: EtapaCampo = 'Valetas';
      let ultimoLogProjeto: DiarioLog | undefined = undefined;

      if (logsProjeto.length > 0) {
        // Ordena por data decrescente
        const sortedLogs = [...logsProjeto].sort((a, b) => b.data.localeCompare(a.data));
        ultimoLogProjeto = sortedLogs[0];

        // Encontra a etapa do log mais recente
        for (const log of sortedLogs) {
          const matchEtapa = ETAPAS_CAMPO_ORDEM.find(e => 
            log.atividade.toLowerCase().includes(e.key.toLowerCase()) ||
            e.key.toLowerCase().includes(log.atividade.toLowerCase())
          );
          if (matchEtapa) {
            etapaAtual = matchEtapa.key;
            break;
          }
        }
      }

      // Configuração e metas da etapa atual
      const configKey = `${nomeProjeto}::${etapaAtual}`;
      type EtapaConfigFull = { dataInicio: string; metaDias: number; prazoLimite?: string; hasStarted?: boolean };
      const confSalva = configEtapas[configKey] as EtapaConfigFull | undefined;
      const logsEtapaAtual = logsProjeto.filter(l =>
        l.atividade.toLowerCase().includes(etapaAtual.toLowerCase()) ||
        etapaAtual.toLowerCase().includes(l.atividade.toLowerCase())
      );
      const etapaFoiIniciada = confSalva?.hasStarted === true;

      // Se etapaFoiIniciada = true, confSalva GARANTIDAMENTE existe (pois hasStarted === true)
      const conf: EtapaConfigFull = etapaFoiIniciada && confSalva
        ? {
            dataInicio: confSalva.dataInicio || '',
            metaDias: confSalva.metaDias || 20,
            prazoLimite: confSalva.prazoLimite,
            hasStarted: true,
          }
        : {
            dataInicio: '',
            metaDias: confSalva?.metaDias || 20,
            prazoLimite: confSalva?.prazoLimite,
            hasStarted: false,
          };

      let diffEtapa = 0;
      let diasRestantes = conf.metaDias;
      let pctEtapa = 0;
      let isAtrasado = 0;

      if (etapaFoiIniciada && conf.dataInicio) {
        const inicioEtapa = new Date(`${conf.dataInicio}T00:00:00`);
        inicioEtapa.setHours(0, 0, 0, 0);
        diffEtapa = Math.max(0, Math.floor((hoje.getTime() - inicioEtapa.getTime()) / (1000 * 60 * 60 * 24)));
        diasRestantes = conf.metaDias - diffEtapa;
        pctEtapa = Math.min(100, Math.max(0, Math.round((diffEtapa / Math.max(1, conf.metaDias)) * 100)));
        isAtrasado = diasRestantes < 0 ? 1 : 0;
      }

      // Status Recente
      const statusRecente = ultimoLogProjeto?.status || 'Dentro do programado';

      // Histórico de Rendimento dos Logs do Projeto
      const rend = { acima: 0, dentro: 0, abaixo: 0, chuva: 0 };
      logsProjeto.forEach(l => {
        const s = (l.status || '').toLowerCase();
        if (s.includes('acima')) rend.acima++;
        else if (s.includes('abaixo') || s.includes('atras') || s.includes('problema')) rend.abaixo++;
        else if (s.includes('chuva')) rend.chuva++;
        else rend.dentro++;
      });

      // Cálculo de Saúde da Obra
      let saude: 'excelente' | 'normal' | 'alerta' | 'chuva' = 'normal';
      const sLower = statusRecente.toLowerCase();
      if (sLower.includes('chuva')) {
        saude = 'chuva';
      } else if (isAtrasado || sLower.includes('abaixo') || sLower.includes('problema')) {
        saude = 'alerta';
      } else if (sLower.includes('acima')) {
        saude = 'excelente';
      } else {
        saude = 'normal';
      }

      // Responsáveis: união de fases_acao (fonte de verdade contratual)
      // + responsaveisPorEtapa da etapa atual + responsaveisPorEtapa de TODAS as etapas do projeto
      const respFasesAcao = fases
        .filter(f =>
          !f.isDeleted &&
          (f.projetoCliente || '').trim() === nomeProjeto.trim() &&
          f.responsavel &&
          f.responsavel.trim() !== '' &&
          f.responsavel.trim() !== 'Não atribuído'
        )
        .map(f => f.responsavel.trim());

      const respOutrasEtapasDoProjeto = Object.entries(responsaveisPorEtapa)
        .filter(([k]) => k.startsWith(`${nomeProjeto}::`))
        .flatMap(([, v]) => v || []);

      const respTodos = Array.from(
        new Set([...respFasesAcao, ...(responsaveisPorEtapa[configKey] || []), ...respOutrasEtapasDoProjeto])
      )
        .filter(Boolean)
        .map(r => String(r).trim())
        .filter(r => r !== '' && r !== 'Não atribuído')
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));

      return {
        nome: nomeProjeto,
        versao: getProjectVersion(nomeProjeto),
        dataStart,
        diaAtual,
        etapaAtual,
        statusRecente,
        diasDecorridosEtapa: diffEtapa,
        metaDiasEtapa: conf.metaDias,
        diasRestantesEtapa: diasRestantes,
        pctEtapa,
        isAtrasado,
        saude,
        totalLogs: logsProjeto.length,
        responsaveis: respTodos,
        ultimoLog: ultimoLogProjeto,
        historicoRendimento: rend,
      };
    });
  }, [projetosList, logs, fases, projetoStartDates, configEtapas, responsaveisPorEtapa]);

  // Obra selecionada (se houver filtro específico)
  const obraSelecionada = useMemo(() => {
    if (selectedProjetoFilter === '__todos__') return null;
    return obrasCampo.find(o => o.nome === selectedProjetoFilter) || null;
  }, [selectedProjetoFilter, obrasCampo]);

  // Logs filtrados pelo projeto selecionado
  const logsVisiveis = useMemo(() => {
    if (selectedProjetoFilter === '__todos__') return logsFiltradosPeriodo;
    return logsFiltradosPeriodo.filter(l => (l.projetoCliente || '').trim() === selectedProjetoFilter.trim());
  }, [logsFiltradosPeriodo, selectedProjetoFilter]);

  // ── KPIs Globais do Diretor ─────────────────────────────────────────────────
  const kpisDiretor = useMemo(() => {
    const totalObras = obrasCampo.length;
    const obrasNoRitmo = obrasCampo.filter(o => o.saude === 'normal' || o.saude === 'excelente').length;
    const obrasAlerta = obrasCampo.filter(o => o.saude === 'alerta').length;
    const obrasChuva = obrasCampo.filter(o => o.saude === 'chuva').length;
    const indiceSaude = totalObras > 0 ? Math.round((obrasNoRitmo / totalObras) * 100) : 100;

    // Rendimento dos logs recentes
    let countAcima = 0;
    let countDentro = 0;
    let countAbaixo = 0;
    let countChuva = 0;

    logsVisiveis.forEach(l => {
      const s = (l.status || '').toLowerCase();
      if (s.includes('acima')) countAcima++;
      else if (s.includes('abaixo') || s.includes('problema')) countAbaixo++;
      else if (s.includes('chuva')) countChuva++;
      else countDentro++;
    });

    const totalLogsVisiveis = logsVisiveis.length;
    const taxaRendimentoBom = totalLogsVisiveis > 0 
      ? Math.round(((countAcima + countDentro) / totalLogsVisiveis) * 100) 
      : 100;

    const hojeStr = new Date().toISOString().split('T')[0];
    const logsHoje = logs.filter(l => l.data === hojeStr).length;

    return {
      totalObras,
      obrasNoRitmo,
      obrasAlerta,
      obrasChuva,
      indiceSaude,
      taxaRendimentoBom,
      countAcima,
      countDentro,
      countAbaixo,
      countChuva,
      logsHoje,
      totalLogsPeriodo: totalLogsVisiveis,
    };
  }, [obrasCampo, logsVisiveis, logs]);

  // ── Dados para os Gráficos de Campo ─────────────────────────────────────────

  // 1. Distribuição das Obras pelas 6 Etapas de Campo (Pipeline de Obras)
  const dadosPipelineEtapas = useMemo(() => {
    return ETAPAS_CAMPO_ORDEM.map(etapa => {
      const obrasNestaEtapa = obrasCampo.filter(o => o.etapaAtual === etapa.key);
      return {
        etapaKey: etapa.key,
        name: etapa.label,
        icon: etapa.icon,
        obrasCount: obrasNestaEtapa.length,
        obrasNomes: obrasNestaEtapa.map(o => o.nome),
        fill: etapa.color,
      };
    });
  }, [obrasCampo]);

  // 2. Gráfico Donut de Rendimento de Campo
  const dadosDonutRendimento = useMemo(() => {
    return [
      { name: 'Dentro do Programado', value: kpisDiretor.countDentro, fill: '#10b981' },
      { name: 'Acima (Acelerado)',     value: kpisDiretor.countAcima,  fill: '#3b82f6' },
      { name: 'Abaixo (Atraso/Risco)', value: kpisDiretor.countAbaixo, fill: '#f43f5e' },
      { name: 'Chuva / Paralisação',   value: kpisDiretor.countChuva,  fill: '#06b6d4' },
    ].filter(item => item.value > 0);
  }, [kpisDiretor]);

  // 3. Atividade Diária nos Últimos 14 Dias (Timeline de Registros)
  const dadosTimelineAtividade = useMemo(() => {
    const dias = 14;
    const resultado: { dia: string; dataCompleta: string; registros: number; acima: number; abaixo: number }[] = [];

    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = d.toISOString().split('T')[0];
      const logsDoDia = logsVisiveis.filter(l => l.data === dStr);

      const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      resultado.push({
        dia: label,
        dataCompleta: dStr,
        registros: logsDoDia.length,
        acima: logsDoDia.filter(l => (l.status || '').toLowerCase().includes('acima')).length,
        abaixo: logsDoDia.filter(l => (l.status || '').toLowerCase().includes('abaixo')).length,
      });
    }
    return resultado;
  }, [logsVisiveis]);

  // 4. Ranking de Atividade e Engajamento dos Usuários (@terracafe.com) - APENAS AGRICULTORES
  const dadosAtividadeUsuarios = useMemo(() => {
    const mapa: Record<string, {
      nome: string;
      email: string;
      total: number;
      relatos: number;
      alteracoes: number;
      hoje: number;
      ultimo: string;
    }> = {};

    const hojeStr = new Date().toISOString().split('T')[0];

    const normalizarPessoa = (raw: string) => {
      const trimmed = (raw || '').trim();
      if (!trimmed || trimmed.toLowerCase() === 'sistema') return null;
      let email = '';
      let nome = '';

      if (trimmed.includes('@')) {
        email = trimmed.toLowerCase();
        nome = extractUserName(email);
      } else {
        const clean = trimmed.toLowerCase().replace(/[^a-z0-9._-]/g, '');
        email = `${clean}@terracafe.com`;
        nome = extractUserName(trimmed);
      }
      return { nome, email };
    };

    const getRole = (p: { nome: string; email: string }): string => {
      const emailLower = (p.email || '').toLowerCase().trim();
      const nomeLower = (p.nome || '').toLowerCase().trim();
      if (emailLower && usuariosRoles[emailLower]) return usuariosRoles[emailLower];
      if (nomeLower && usuariosRoles[nomeLower]) return usuariosRoles[nomeLower];
      if (emailLower === 'joao2005souza@gmail.com') return 'Desenvolvedor';
      return 'Agricultor';
    };

    // 1. Apontamentos no Diário de Campo
    logsVisiveis.forEach(l => {
      const partes = (l.responsavel || '').split(',').map(p => p.trim()).filter(Boolean);
      partes.forEach(parte => {
        const p = normalizarPessoa(parte);
        if (!p) return;
        const cargo = getRole(p);
        // Exclusivo: apenas perfil Agricultor é contabilizado na atividade
        if (cargo !== 'Agricultor') return;

        const key = p.nome.toLowerCase();
        if (!mapa[key]) {
          mapa[key] = { nome: p.nome, email: p.email, total: 0, relatos: 0, alteracoes: 0, hoje: 0, ultimo: '' };
        }
        mapa[key].relatos++;
        mapa[key].total++;
        if (l.data === hojeStr) mapa[key].hoje++;
        if (!mapa[key].ultimo || l.data > mapa[key].ultimo) mapa[key].ultimo = l.data;
      });
    });

    // 2. Alterações de Cronograma & Fases no Sistema
    historicoAcoes.forEach(h => {
      const p = normalizarPessoa(h.usuario);
      if (!p) return;
      const cargo = getRole(p);
      // Exclusivo: apenas perfil Agricultor é contabilizado na atividade
      if (cargo !== 'Agricultor') return;

      const key = p.nome.toLowerCase();
      if (!mapa[key]) {
        mapa[key] = { nome: p.nome, email: p.email, total: 0, relatos: 0, alteracoes: 0, hoje: 0, ultimo: '' };
      }
      mapa[key].alteracoes++;
      mapa[key].total++;
      const dataHist = (h.criadoEm || '').split('T')[0];
      if (dataHist === hojeStr) mapa[key].hoje++;
      if (!mapa[key].ultimo || dataHist > mapa[key].ultimo) mapa[key].ultimo = dataHist;
    });

    return Object.values(mapa)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [logsVisiveis, historicoAcoes, usuariosRoles]);

  // ── Dados para a Aba de Cronograma & Prazos das 6 Fases ────────────────────
  const dadosCronogramaFases = useMemo(() => {
    const hojeMs = new Date().setHours(0, 0, 0, 0);

    // Estatísticas das 6 fases oficiais da irrigação
    const porFase = ETAPAS_CAMPO_ORDEM.map(etp => {
      let concluidas = 0;
      let atrasadas = 0;
      let noPrazo = 0;
      let naoIniciadas = 0;

      projetosList.forEach(projNome => {
        const chave = `${projNome}::${etp.key}`;
        const cfg = (configEtapas as any)[chave];
        const hasStarted = cfg?.hasStarted === true;
        
        const logsEtp = logs.filter(l => 
          (l.projetoCliente || '').trim() === projNome.trim() &&
          l.atividade.toLowerCase().includes(etp.key.toLowerCase())
        );
        const temConcluido = logsEtp.some(l => 
          (l.status || '').toLowerCase().includes('concluído') || 
          (l.status || '').toLowerCase().includes('concluido')
        );
        const isConc = temConcluido || cfg?.status === 'Concluída';

        if (isConc) {
          concluidas++;
        } else if (!hasStarted) {
          naoIniciadas++;
        } else if (cfg?.prazoLimite) {
          const dFim = new Date(`${cfg.prazoLimite}T00:00:00`).getTime();
          if (dFim < hojeMs) {
            atrasadas++;
          } else {
            noPrazo++;
          }
        } else {
          noPrazo++;
        }
      });

      return {
        name: etp.label,
        key: etp.key,
        icon: etp.icon,
        color: etp.color,
        concluidas,
        ativas: noPrazo,
        atrasadas,
        naoIniciadas,
        total: projetosList.length,
      };
    });

    // Visão consolidada por obra
    const obrasDetalhadas = projetosList.map(projNome => {
      const prazoTotal = projetosPrazoFinal[projNome];
      let diasRestantesTotal = 0;
      let atrasadoTotal = false;
      let prazoTotalFormatado = 'Não definido';

      if (prazoTotal) {
        const dPrazo = new Date(`${prazoTotal}T00:00:00`);
        prazoTotalFormatado = dPrazo.toLocaleDateString('pt-BR');
        dPrazo.setHours(0, 0, 0, 0);
        diasRestantesTotal = Math.ceil((dPrazo.getTime() - hojeMs) / (1000 * 60 * 60 * 24));
        atrasadoTotal = diasRestantesTotal < 0;
      }

      let fasesConcluidasCount = 0;
      let fasesAtrasadasCount = 0;

      const statusFases = ETAPAS_CAMPO_ORDEM.map(etp => {
        const chave = `${projNome}::${etp.key}`;
        const cfg = (configEtapas as any)[chave];
        const hasStarted = cfg?.hasStarted === true;
        const logsEtp = logs.filter(l => 
          (l.projetoCliente || '').trim() === projNome.trim() &&
          l.atividade.toLowerCase().includes(etp.key.toLowerCase())
        );
        const temConcluido = logsEtp.some(l => 
          (l.status || '').toLowerCase().includes('concluído') || 
          (l.status || '').toLowerCase().includes('concluido')
        );
        const isConc = temConcluido || cfg?.status === 'Concluída';

        let atrasoDias = 0;
        let diasRest = 0;
        let atrasada = false;

        if (isConc) {
          fasesConcluidasCount++;
        } else if (hasStarted && cfg?.prazoLimite) {
          const dFim = new Date(`${cfg.prazoLimite}T00:00:00`);
          dFim.setHours(0, 0, 0, 0);
          diasRest = Math.ceil((dFim.getTime() - hojeMs) / (1000 * 60 * 60 * 24));
          if (diasRest < 0) {
            atrasada = true;
            atrasoDias = Math.abs(diasRest);
            fasesAtrasadasCount++;
          }
        }

        return {
          key: etp.key,
          label: etp.label,
          icon: etp.icon,
          isConcluida: isConc,
          hasStarted,
          isAtrasada: atrasada,
          atrasoDias,
          diasRestantes: diasRest,
          prazoLimite: cfg?.prazoLimite,
        };
      });

      const pctGeral = Math.round((fasesConcluidasCount / 6) * 100);

      return {
        nome: projNome,
        baseName: extractProjectBaseName(projNome),
        versao: getProjectVersion(projNome),
        prazoTotalFormatado,
        diasRestantesTotal,
        atrasadoTotal,
        fasesConcluidasCount,
        fasesAtrasadasCount,
        pctGeral,
        statusFases,
      };
    });

    const totalFasesGeral = projetosList.length * 6;
    const totalConcluidasGeral = obrasDetalhadas.reduce((acc, o) => acc + o.fasesConcluidasCount, 0);
    const taxaGeral = totalFasesGeral > 0 ? Math.round((totalConcluidasGeral / totalFasesGeral) * 100) : 0;
    const obrasComAtraso = obrasDetalhadas.filter(o => o.atrasadoTotal || o.fasesAtrasadasCount > 0).length;

    return {
      porFase,
      obrasDetalhadas,
      taxaGeral,
      obrasComAtraso,
      totalObras: projetosList.length,
      totalConcluidas: totalConcluidasGeral,
      totalFases: totalFasesGeral,
    };
  }, [projetosList, configEtapas, logs, projetosPrazoFinal]);

  if (status === 'loading' || loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070c18] text-slate-700 dark:text-slate-300 p-4 md:p-6 lg:p-8 font-sans transition-colors">

      {/* ── HEADER EXECUTIVO ──────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6 gap-4 border-b border-slate-200 dark:border-[#1e293b] pb-6">
        <div>
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mb-2">
            <BackButton />
            <span>TerraCafé Irrigação</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-slate-900 dark:text-white font-medium">Painel Executivo</span>
          </nav>
          
<div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 shrink-0">
               <BarChart2 className="w-5 h-5" />
             </div>
             <div>
               <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2 flex-wrap">
                 Visão do Diretor · Irrigação e Obras
                 <span className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider rounded-full bg-blue-500/10 text-blue-500 dark:text-blue-400 border border-blue-500/20">
                   Ao Vivo
                 </span>
                 <span className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                   Somente Leitura
                 </span>
               </h1>
               <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                 {lastUpdate && (
                   <span>Última sincronização às {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                 )}
                 <span>·</span>
                 <span>{obrasCampo.length} fazendas ativas no sistema</span>
                 <span>·</span>
                 <span className="text-slate-400 dark:text-slate-300 font-semibold">
                   Usuário: {currentUser}
                 </span>
               </p>
             </div>
           </div>
        </div>

        {/* Barra de Ações Rápidas */}
        <div className="flex flex-wrap items-center gap-2.5">
          <ThemeToggle />
          <LogoutButton />

          <button
            onClick={loadData}
            title="Atualizar dados do servidor"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1e293b] text-xs font-semibold shadow-sm transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            Atualizar
          </button>

          <Link
            href="/irrigacao/diario-campo"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-md shadow-amber-500/20 transition-all"
          >
            <Calendar className="w-3.5 h-3.5" />
            Diário de Campo
          </Link>

          <Link
            href="/irrigacao/execucao"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all"
          >
            <Layers className="w-3.5 h-3.5" />
            Cronograma
          </Link>

          <button
            onClick={() => {
              const param = selectedProjetoFilter === '__todos__' ? '__todos__' : encodeURIComponent(selectedProjetoFilter);
              window.open(`/relatorio?projeto=${param}`, '_blank');
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-lg shadow-blue-600/25 transition-all"
          >
            <FileDown className="w-4 h-4" />
            Relatório PDF
          </button>
        </div>
      </div>

      {/* ── FILTROS E SELETOR DE CONTEXTO DO DIRETOR ──────────────────────────── */}
      <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-4 mb-6 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        
        {/* Seletor de Fazenda / Projeto */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 dark:text-blue-400 shrink-0">
            <Briefcase className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
              Filtrar por Obra / Fazenda:
            </label>
            <div className="relative max-w-md">
              <select
                value={selectedProjetoFilter}
                onChange={(e) => setSelectedProjetoFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="__todos__">🏢 Todas as Obras (Visão Consolidada da Diretoria)</option>
                {projetosList.map(proj => (
                  <option key={proj} value={proj}>🚜 {proj}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Controles de Período e Abas */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Período */}
          <div className="flex items-center bg-slate-100 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-1 text-xs">
            <span className="text-slate-400 px-2 text-[10px] uppercase font-bold">Período:</span>
            {(['7d', '15d', '30d', 'tudo'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriodoFilter(p)}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  periodoFilter === p
                    ? 'bg-white dark:bg-[#1e293b] text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {p === 'tudo' ? 'Tudo' : `${p.replace('d', '')} dias`}
              </button>
            ))}
          </div>

          {/* Alternância de Abas */}
          <div className="flex items-center bg-slate-100 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-1 text-xs">
            <button
              onClick={() => setActiveTab('campo')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
                activeTab === 'campo'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              Operação de Campo & Irrigação
            </button>
            <button
              onClick={() => setActiveTab('cronograma')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
                activeTab === 'cronograma'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Cronograma & Prazos das 6 Fases
            </button>
          </div>
        </div>
      </div>

      {/* ── PLACAR DE KPIS DO DIRETOR (Cards de Destaque) ────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 mb-6">
        
        {/* KPI 1: Obras Ativas */}
        <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Obras em Campo</span>
            <Briefcase className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {kpisDiretor.totalObras}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {selectedProjetoFilter === '__todos__' ? 'Em execução' : 'Fazenda filtrada'}
          </p>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500" />
        </div>

        {/* KPI 2: Índice de Saúde do Portfólio */}
        <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Saúde das Obras</span>
            <Sparkles className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-500 tracking-tight">
            {kpisDiretor.indiceSaude}%
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {kpisDiretor.obrasNoRitmo} de {kpisDiretor.totalObras} no ritmo ideal
          </p>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />
        </div>

        {/* KPI 3: Ritmo Operacional */}
        <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ritmo de Campo</span>
            <TrendingUp className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-blue-500 dark:text-blue-400 tracking-tight">
            {kpisDiretor.taxaRendimentoBom}%
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {kpisDiretor.countAcima + kpisDiretor.countDentro} dias normais/acima
          </p>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-400" />
        </div>

        {/* KPI 4: Obras em Alerta / Atrasadas */}
        <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Em Alerta / Risco</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <p className={`text-2xl font-bold tracking-tight ${kpisDiretor.obrasAlerta > 0 ? 'text-rose-500' : 'text-slate-900 dark:text-white'}`}>
            {kpisDiretor.obrasAlerta}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {kpisDiretor.obrasAlerta > 0 ? 'Exigem intervenção' : 'Nenhuma em atraso'}
          </p>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-rose-500" />
        </div>

        {/* KPI 5: Dias Parados por Chuva */}
        <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Paradas Clima</span>
            <CloudRain className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-bold text-cyan-500 dark:text-cyan-400 tracking-tight">
            {kpisDiretor.countChuva}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            apontamentos de chuva
          </p>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-cyan-400" />
        </div>

        {/* KPI 6: Apontamentos Hoje / Assiduidade */}
        <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Diário Hoje</span>
            <Activity className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {kpisDiretor.logsHoje}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {kpisDiretor.totalLogsPeriodo} no período ({periodoFilter})
          </p>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500" />
        </div>
      </div>

      {/* ── CONTEÚDO DA ABA 1: OPERAÇÕES DE CAMPO & IRRIGAÇÃO ────────────────── */}
      {activeTab === 'campo' && (
        <div className="space-y-6">

          {/* SEÇÃO 1: PIPELINE / RADAR DAS 5 ETAPAS DE CAMPO */}
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-blue-500" />
                  Radar das 6 Etapas de Campo da Irrigação
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Distribuição atual das frentes de trabalho das fazendas pelo ciclo técnico de implantação
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#1e293b] text-slate-600 dark:text-slate-300 self-start sm:self-auto">
                Ciclo Técnico TerraCafé
              </span>
            </div>

            {/* Pipeline Visual das 6 Etapas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {dadosPipelineEtapas.map((etp, idx) => {
                const isActiveFilter = selectedProjetoFilter !== '__todos__' && obraSelecionada?.etapaAtual === etp.etapaKey;
                return (
                  <div
                    key={etp.etapaKey}
                    className={`rounded-xl border p-4 transition-all duration-200 relative overflow-hidden ${
                      isActiveFilter
                        ? 'border-blue-500 bg-blue-500/5 shadow-md ring-2 ring-blue-500/20'
                        : etp.obrasCount > 0
                        ? 'border-slate-200 dark:border-[#1e293b] bg-slate-50/70 dark:bg-[#070c18]/60 hover:border-slate-300 dark:hover:border-slate-700'
                        : 'border-slate-100 dark:border-slate-800/60 bg-transparent opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl">{etp.icon}</span>
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm"
                        style={{ backgroundColor: etp.fill }}
                      >
                        {etp.obrasCount}
                      </span>
                    </div>

                    <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                      {idx + 1}. {etp.name}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 line-clamp-1 mt-0.5">
                      {ETAPAS_CAMPO_ORDEM[idx]?.desc}
                    </p>

                    {/* Obras presentes nesta etapa */}
                    <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800/80">
                      {etp.obrasCount > 0 ? (
                        <div className="space-y-1">
                          {etp.obrasNomes.slice(0, 3).map(nomeObra => (
                            <button
                              key={nomeObra}
                              onClick={() => setSelectedProjetoFilter(nomeObra)}
                              className="w-full text-left text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-blue-500 dark:hover:text-blue-400 truncate flex items-center gap-1 transition-colors"
                            >
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: etp.fill }} />
                              <span className="truncate">{nomeObra}</span>
                            </button>
                          ))}
                          {etp.obrasNomes.length > 3 && (
                            <span className="text-[10px] text-slate-400 block mt-1">
                              +{etp.obrasNomes.length - 3} outra(s) obra(s)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Nenhuma obra ativa</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SEÇÃO 2: GRÁFICOS DE MONITORAMENTO DE CAMPO */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Gráfico 1: Termômetro de Rendimento Operacional (Donut) */}
            <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-5 shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  Rendimento Operacional
                </h3>
                <ChartInfoTooltip text="Proporção de dias com rendimento Acima, Dentro do programado, com Atraso ou Paralisados por Chuva nos relatórios de campo." />
              </div>
              <p className="text-xs text-slate-400 mb-4">
                {kpisDiretor.totalLogsPeriodo} apontamentos analisados ({periodoFilter})
              </p>

              {dadosDonutRendimento.length > 0 ? (
                <>
                  <div className="relative h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dadosDonutRendimento}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={75}
                          paddingAngle={3}
                          dataKey="value"
                          nameKey="name"
                        >
                          {dadosDonutRendimento.map(entry => (
                            <Cell key={entry.name} fill={entry.fill} stroke="#ffffff" strokeWidth={1.5} />
                          ))}
                        </Pie>
                        <RTooltip
                          contentStyle={{ background: '#0d1527', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
                          labelStyle={{ color: '#fff' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl font-black text-slate-900 dark:text-white">{kpisDiretor.taxaRendimentoBom}%</span>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Eficiência</span>
                    </div>
                  </div>

                  {/* Legenda Dinâmica */}
                  <div className="space-y-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-[#1e293b]">
                    {dadosDonutRendimento.map(item => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                          <span className="text-slate-600 dark:text-slate-300 truncate">{item.name}</span>
                        </div>
                        <span className="font-bold text-slate-900 dark:text-white shrink-0 ml-2">
                          {item.value} ({Math.round((item.value / kpisDiretor.totalLogsPeriodo) * 100)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                  Nenhum apontamento no período selecionado.
                </div>
              )}
            </div>

            {/* Gráfico 2: Timeline de Atividade e Estabilidade (Area Chart) */}
            <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-5 shadow-sm lg:col-span-2 flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  Ritmo Diário de Apontamentos de Campo
                </h3>
                <ChartInfoTooltip text="Mede o volume de registros preenchidos pelas equipes no diário nos últimos 14 dias para garantir a assiduidade do acompanhamento." />
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Assiduidade das equipes nos últimos 14 dias · pico diário e regularidade
              </p>

              <div className="flex-1 min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dadosTimelineAtividade} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradAtividade" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.5} />
                    <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <RTooltip
                      contentStyle={{ background: '#0d1527', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: '#fff' }}
                      formatter={(v) => [`${Number(v)} registro(s)`, 'Diário de Campo']}
                    />
                    <Area
                      type="monotone"
                      dataKey="registros"
                      name="Registros"
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      fill="url(#gradAtividade)"
                      dot={{ fill: '#3b82f6', r: 3, strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: '#60a5fa' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100 dark:border-[#1e293b] mt-2">
                <span>Total de registros nos últimos 14 dias: <strong className="text-slate-900 dark:text-white">{dadosTimelineAtividade.reduce((acc, d) => acc + d.registros, 0)}</strong></span>
                <span className="text-emerald-500 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Campo em operação contínua
                </span>
              </div>
            </div>
          </div>

          {/* SEÇÃO 3: CARDS DAS OBRAS (VISITA VIRTUAL DO DIRETOR) */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-blue-500" />
                  Raio-X das Fazendas e Obras de Irrigação
                  <span className="text-xs font-normal text-slate-400">
                    ({obrasCampo.length} fazenda{obrasCampo.length !== 1 ? 's' : ''})
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Acompanhamento de dias decorridos, meta, etapa técnica atual e última foto enviada pelo time
                </p>
              </div>

              {selectedProjetoFilter !== '__todos__' && (
                <button
                  onClick={() => setSelectedProjetoFilter('__todos__')}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 text-xs font-semibold self-start sm:self-auto"
                >
                  <X className="w-3.5 h-3.5" />
                  Limpar filtro de obra
                </button>
              )}
            </div>

            {/* Grid de Cards das Obras */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {(selectedProjetoFilter === '__todos__' ? obrasCampo : obrasCampo.filter(o => o.nome === selectedProjetoFilter)).map(obra => {
                const etapaObj = ETAPAS_CAMPO_ORDEM.find(e => e.key === obra.etapaAtual) || ETAPAS_CAMPO_ORDEM[0];
                const temFoto = !!obra.ultimoLog?.midiaUrl;

                return (
                  <div
                    key={obra.nome}
                    className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col"
                  >
                    {/* Linha superior com status e versão */}
                    <div className="p-4 border-b border-slate-100 dark:border-[#1e293b] flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-[#1e293b] text-slate-700 dark:text-slate-300">
                            {obra.versao}
                          </span>

                          {/* Badge de Saúde */}
                          {obra.saude === 'excelente' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                              <TrendingUp className="w-3 h-3" /> Acelerada
                            </span>
                          )}
                          {obra.saude === 'normal' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> No Ritmo
                            </span>
                          )}
                          {obra.saude === 'alerta' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 animate-pulse">
                              <AlertTriangle className="w-3 h-3" /> Alerta de Atraso
                            </span>
                          )}
                          {obra.saude === 'chuva' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
                              <CloudRain className="w-3 h-3" /> Chuva / Parada
                            </span>
                          )}
                        </div>

                        <h3 className="font-bold text-slate-900 dark:text-white text-base truncate" title={obra.nome}>
                          {extractProjectBaseName(obra.nome)}
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Início da obra: {new Date(`${obra.dataStart}T00:00:00`).toLocaleDateString('pt-BR')} · <strong>Dia {obra.diaAtual}</strong>
                        </p>
                      </div>

                      {/* Botão de abrir diário */}
                      <Link
                        href={`/irrigacao/diario-campo?projeto=${encodeURIComponent(obra.nome)}`}
                        className="p-2 rounded-lg bg-slate-100 dark:bg-[#1e293b] text-slate-600 dark:text-slate-300 hover:bg-blue-600 hover:text-white transition-all shrink-0"
                        title="Abrir Diário desta obra"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </Link>
                    </div>

                    {/* Corpo do Card */}
                    <div className="p-4 space-y-3.5 flex-1 flex flex-col justify-between">
                      
                      {/* Etapa Atual & Medidor de Meta */}
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <span>{etapaObj.icon}</span>
                            <span>{etapaObj.label}</span>
                          </span>
                          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            {obra.diasDecorridosEtapa} / {obra.metaDiasEtapa} dias ({obra.pctEtapa}%)
                          </span>
                        </div>

                        {/* Barra de Progresso do Prazo */}
                        <div className="h-2.5 w-full bg-slate-100 dark:bg-[#1e293b] rounded-full overflow-hidden relative">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, obra.pctEtapa)}%`,
                              backgroundColor: obra.isAtrasado ? '#f43f5e' : etapaObj.color,
                            }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                          <span>
                            {obra.isAtrasado ? (
                              <strong className="text-rose-500 font-bold">
                                ⚠️ {Math.abs(obra.diasRestantesEtapa)} dia(s) acima da meta
                              </strong>
                            ) : (
                              <span>Restam {obra.diasRestantesEtapa} dias de meta</span>
                            )}
                          </span>
                          <span>{obra.totalLogs} relatos registrados</span>
                        </div>
                      </div>

                      {/* Miniatura do Último Registro & Foto de Campo */}
                      {obra.ultimoLog ? (
                        <div className="rounded-lg p-2.5 bg-slate-50 dark:bg-[#070c18] border border-slate-100 dark:border-[#1e293b] flex items-start gap-3">
                          {temFoto ? (
                            <button
                              type="button"
                              onClick={() => setFotoModal(obra.ultimoLog || null)}
                              className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 group cursor-pointer"
                              title="Clique para ampliar foto de campo"
                            >
                              <img
                                src={obra.ultimoLog?.midiaUrl}
                                alt="Foto de Campo"
                                className="w-full h-full object-cover transition-transform group-hover:scale-110"
                              />
                              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Eye className="w-4 h-4 text-white" />
                              </div>
                            </button>
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0 text-xs">
                              {etapaObj.icon}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">
                                {obra.ultimoLog.responsavel}
                              </span>
                              <span className="text-[10px] text-slate-400 shrink-0">
                                {new Date(`${obra.ultimoLog.data}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 italic">
                              &ldquo;{obra.ultimoLog.observacoes || obra.ultimoLog.atividade || 'Atividades de rotina em andamento'}&rdquo;
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-2 text-xs text-slate-400 italic">
                          Aguardando primeiro apontamento de diário.
                        </div>
                      )}

                      {/* Rodapé do Card com Ações */}
                      <div className="pt-2 border-t border-slate-100 dark:border-[#1e293b] flex items-center justify-between text-xs">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          Equipe: <strong>{obra.responsaveis.length > 0 ? obra.responsaveis.slice(0, 2).join(', ') + (obra.responsaveis.length > 2 ? ` +${obra.responsaveis.length - 2}` : '') : 'Não atribuída'}</strong>
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => window.open(`/relatorio?projeto=${encodeURIComponent(obra.nome)}`, '_blank')}
                            className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-[#1e293b] text-slate-600 dark:text-slate-300 hover:text-blue-500 transition-colors"
                          >
                            PDF
                          </button>
                          <Link
                            href={`/irrigacao/diario-campo?projeto=${encodeURIComponent(obra.nome)}`}
                            className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                          >
                            Ver Diário
                          </Link>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SEÇÃO 4: ENGAJAMENTO & ATIVIDADE DOS AGRICULTORES (@terracafe) */}
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-emerald-500" />
                  Engajamento & Atividade dos Agricultores (@terracafe)
                </h3>
                <p className="text-xs text-slate-400">
                  Colaboradores com perfil Agricultor mais atuantes no diário de campo ({periodoFilter})
                </p>
              </div>
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 font-medium self-start sm:self-auto">
                🌱 Apenas perfil Agricultor contabilizado
              </span>
            </div>

            {dadosAtividadeUsuarios.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 italic bg-slate-50 dark:bg-[#070c18] rounded-lg border border-slate-100 dark:border-[#1e293b]">
                Nenhuma atividade de agricultor registrada no período selecionado.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {dadosAtividadeUsuarios.map(colab => {
                  const iniciais = (colab.nome || 'US')
                    .split(' ')
                    .filter(Boolean)
                    .map(p => p.charAt(0))
                    .slice(0, 2)
                    .join('')
                    .toUpperCase() || 'US';

                  return (
                    <div
                      key={colab.nome}
                      className="flex items-center justify-between p-3.5 rounded-lg bg-slate-50 dark:bg-[#070c18] border border-slate-100 dark:border-[#1e293b] hover:border-indigo-500/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-black text-xs flex items-center justify-center shrink-0 border border-indigo-500/20">
                          {iniciais}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {colab.nome}
                          </p>
                          {colab.email && (
                            <p className="text-[10px] text-slate-400 truncate">
                              {colab.email}
                            </p>
                          )}
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {colab.hoje > 0 ? (
                              <strong className="text-emerald-500 font-bold">✓ Atuou hoje ({colab.hoje})</strong>
                            ) : (
                              `Último: ${colab.ultimo ? new Date(`${colab.ultimo}T00:00:00`).toLocaleDateString('pt-BR') : '—'}`
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0 pl-3 border-l border-slate-200/60 dark:border-slate-800">
                        <span className="text-base font-black text-slate-900 dark:text-white">
                          {colab.total}
                        </span>
                        <span className="text-[10px] text-slate-400 block -mt-0.5">
                          {colab.total === 1 ? 'ação' : 'ações'}
                        </span>
                        <div className="text-[9px] text-slate-400 mt-1 space-y-0.5">
                          {colab.relatos > 0 && <div>{colab.relatos} {colab.relatos === 1 ? 'relato' : 'relatos'}</div>}
                          {colab.alteracoes > 0 && <div>{colab.alteracoes} {colab.alteracoes === 1 ? 'alteração' : 'alterações'}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ── CONTEÚDO DA ABA 2: CRONOGRAMA & PRAZOS DAS 6 FASES ───────────────── */}
      {activeTab === 'cronograma' && (
        <div className="space-y-6">

          {/* Cards de Resumo Global do Cronograma */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Conclusão de Fases</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {dadosCronogramaFases.taxaGeral}%
                </span>
                <span className="text-xs text-slate-400">
                  {dadosCronogramaFases.totalConcluidas} de {dadosCronogramaFases.totalFases} etapas
                </span>
              </div>
              <div className="h-3 w-full bg-slate-100 dark:bg-[#1e293b] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500"
                  style={{ width: `${dadosCronogramaFases.taxaGeral}%` }}
                />
              </div>
            </div>

            <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Atenção & Prazos</span>
                <AlertTriangle className={`w-4 h-4 ${dadosCronogramaFases.obrasComAtraso > 0 ? 'text-rose-500 animate-pulse' : 'text-slate-400'}`} />
              </div>
              <div className="flex items-baseline justify-between">
                <span className={`text-2xl font-black ${dadosCronogramaFases.obrasComAtraso > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                  {dadosCronogramaFases.obrasComAtraso}
                </span>
                <span className="text-xs text-slate-400">
                  de {dadosCronogramaFases.totalObras} obra(s) com atraso
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                {dadosCronogramaFases.obrasComAtraso > 0
                  ? '⚠️ Existem fases estouradas que exigem alinhamento'
                  : '✅ Todas as frentes ativas estão dentro da meta'}
              </p>
            </div>

            <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-5 shadow-sm sm:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ciclo Técnico</span>
                <Layers className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">
                6 Etapas Oficiais
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Valetas • Montagem Campo • Casa de Bombas • Elétrica • Testes • Entrega
              </p>
            </div>
          </div>

          {/* Gráfico de Barras por Fase Oficial da Irrigação */}
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                  Status de Execução das 6 Fases Oficiais
                </h3>
                <p className="text-xs text-slate-400">
                  Acompanhamento de progresso e gargalos técnicos em todas as fazendas
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#1e293b] text-slate-600 dark:text-slate-300 self-start sm:self-auto">
                {dadosCronogramaFases.totalObras} Obra(s) Cadastrada(s)
              </span>
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosCronogramaFases.porFase} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.5} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <RTooltip
                    contentStyle={{ background: '#0d1527', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="concluidas" name="Concluídas" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="ativas"     name="No Prazo"   fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="atrasadas"  name="Atrasadas"  fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Matriz Executiva de Prazos por Obra */}
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 md:p-5 border-b border-slate-100 dark:border-[#1e293b] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Matriz de Prazos e Fases por Obra
                </h3>
                <p className="text-xs text-slate-400">
                  Visão consolidada das 6 fases e do prazo final de cada fazenda
                </p>
              </div>
              <span className="text-xs text-slate-400">
                {dadosCronogramaFases.obrasDetalhadas.length} fazenda(s) monitorada(s)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-[#0a1020]/60 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-[#1e293b]">
                    <th className="py-2.5 px-4">Obra / Fazenda</th>
                    <th className="py-2.5 px-3">Prazo Final da Obra</th>
                    <th className="py-2.5 px-3 text-center">Progresso</th>
                    {ETAPAS_CAMPO_ORDEM.map(e => (
                      <th key={e.key} className="py-2.5 px-2 text-center" title={e.desc}>
                        {e.icon} {e.label}
                      </th>
                    ))}
                    <th className="py-2.5 px-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1e293b]">
                  {dadosCronogramaFases.obrasDetalhadas.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-8 text-slate-400 italic">
                        Nenhuma obra ativa encontrada.
                      </td>
                    </tr>
                  ) : (
                    dadosCronogramaFases.obrasDetalhadas.map(obra => (
                      <tr key={obra.nome} className="hover:bg-slate-50/50 dark:hover:bg-[#111a30]/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            {obra.versao !== 'V0' && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-slate-100 dark:bg-[#16203a] text-slate-600 dark:text-slate-400 shrink-0">
                                {obra.versao}
                              </span>
                            )}
                            <strong className="text-slate-900 dark:text-white font-bold truncate max-w-[180px] block">
                              {obra.baseName}
                            </strong>
                          </div>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {obra.prazoTotalFormatado}
                            </span>
                            {obra.prazoTotalFormatado !== 'Não definido' && (
                              <span className={`block text-[10px] font-bold ${obra.atrasadoTotal ? 'text-rose-500' : 'text-slate-400'}`}>
                                {obra.atrasadoTotal
                                  ? `🚨 +${Math.abs(obra.diasRestantesTotal)}d vencido`
                                  : `Restam ${obra.diasRestantesTotal}d`}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full font-black text-[10px] bg-slate-100 dark:bg-[#16203a] text-slate-700 dark:text-slate-300">
                            {obra.pctGeral}% ({obra.fasesConcluidasCount}/6)
                          </span>
                        </td>

                        {obra.statusFases.map(fase => (
                          <td key={fase.key} className="py-3 px-2 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              fase.isConcluida
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                : fase.isAtrasada
                                ? 'bg-rose-600 text-white shadow-sm'
                                : fase.hasStarted
                                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                                : 'bg-slate-100 dark:bg-slate-800/80 text-slate-400'
                            }`}>
                              {fase.isConcluida ? '✓ OK' : fase.isAtrasada ? `+${fase.atrasoDias}d` : fase.hasStarted ? `${fase.diasRestantes}d` : '—'}
                            </span>
                          </td>
                        ))}

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <Link
                            href={`/irrigacao/diario-campo?projeto=${encodeURIComponent(obra.nome)}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white transition-all font-semibold text-[11px]"
                            title="Abrir Diário de Campo desta obra"
                          >
                            <span>Diário</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ── MODAL / LIGHTBOX DE FOTO DE CAMPO ─────────────────────────────────── */}
      {fotoModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setFotoModal(null)}
        >
          <div
            className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 dark:border-[#1e293b] flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                  Registro de Campo · {fotoModal.projetoCliente}
                </h4>
                <p className="text-xs text-slate-400">
                  {new Date(`${fotoModal.data}T00:00:00`).toLocaleDateString('pt-BR')} · Técnico: {fotoModal.responsavel}
                </p>
              </div>
              <button
                onClick={() => setFotoModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1e293b]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative max-h-[70vh] bg-black flex items-center justify-center overflow-hidden">
              <img
                src={fotoModal.midiaUrl}
                alt="Foto de Campo"
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>

            <div className="p-4 bg-slate-50 dark:bg-[#070c18]">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-500">
                  {fotoModal.atividade}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  Status: {fotoModal.status}
                </span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300">
                {fotoModal.observacoes || 'Sem observações adicionais.'}
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
