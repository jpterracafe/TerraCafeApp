"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { DashboardSkeleton } from '@/components/Skeleton';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { extractUsernameFromEmail } from '@/lib/auth-utils';
import { isMasterDevSession } from '@/lib/client-roles';
import Image from 'next/image';
import BackButton from '@/components/BackButton';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Legend, Area, AreaChart, ComposedChart, Line, ReferenceLine,
} from 'recharts';
import {
  ChevronRight, Layers, AlertTriangle, CheckCircle2,
  Users, Activity, TrendingUp, BarChart2, RefreshCw, Briefcase,
  FileDown, Calendar, Info, Sparkles, X, Wrench, Eye, ArrowUpRight, CloudRain, Clock,
  Search, Copy, Check, Filter, Zap, ArrowRight, ChevronDown, SlidersHorizontal, CheckCircle,
  Timer, Gauge
} from 'lucide-react';
import { ADMIN_MASTER_EMAIL } from '@/lib/client-roles';
import { hojeSP } from '@/lib/validators';
import { useLoja } from '@/contexts/LojaContext';
import LojaSelector from '@/components/LojaSelector';
import { offlineFetch } from '@/lib/offline';
import InstallAppButton from '@/components/InstallPWA';
import { useToast } from '@/components/Toast';

import { EtapaCampo } from '@/app/irrigacao/types';
import { extractProjectBaseName, getProjectVersion } from '@/app/irrigacao/execucao/page';
import {
  parseResponsavelEmails,
  isResponsavelVazio,
  normalizeName,
  TERMOS_GENERICOS_RESPONSAVEL as TERMOS_GENERICOS_RESP,
} from '@/lib/responsaveis';

const CACHE_KEY_DASHBOARD = "admin_dashboard_cache_v1";

interface DashboardCacheData {
  fases: FaseAcaoItem[];
  logs: DiarioLog[];
  projetosList: string[];
  configEtapas: Record<string, EtapaConfig>;
  projetoStartDates: Record<string, string>;
  responsaveisPorEtapa: Record<string, string[]>;
  projetosPrazoFinal: Record<string, string>;
  usuariosRoles: Record<string, string>;
  usuariosSistema: { nome: string; email: string; role: string }[];
  projetosCriadores: Record<string, { email: string; nome?: string; id?: string }>;
  ts: number;
}

// ── Helper para extrair nome do usuário do email @terracafe.com ────────────────
function extractUserName(emailOrName: string | undefined): string {
  if (!emailOrName) return 'Não identificado';
  return extractUsernameFromEmail(emailOrName);
}

// ── Constantes e Definições de Campo ──────────────────────────────────────────

export const ETAPAS_CAMPO_ORDEM: { key: EtapaCampo; label: string; icon: string; desc: string; color: string; order: number }[] = [
  { key: 'Valetas',                     label: 'Valetas',                     icon: '⛏️', desc: 'Abertura e nivelamento de valas', color: '#f59e0b', order: 1 },
  { key: 'montagem campo',              label: 'Montagem Campo',              icon: '🌱', desc: 'Tubulações, gotejadores e conexões', color: '#10b981', order: 2 },
  { key: 'casa de bombas',              label: 'Casa de Bombas',              icon: '⚙️', desc: 'Bombas, filtros e cabeçal', color: '#3b82f6', order: 3 },
  { key: 'elétrica',                    label: 'Elétrica',                    icon: '⚡', desc: 'Quadros, automação e cabeamento', color: '#a855f7', order: 4 },
  { key: 'lavagem do sistema e testes',  label: 'Lavagem e Testes',            icon: '💧', desc: 'Limpeza, pressão e estanqueidade', color: '#06b6d4', order: 5 },
  { key: 'entrega técnica',             label: 'Entrega Técnica',             icon: '📋', desc: 'Checklist final, treinamento e entrega', color: '#6366f1', order: 6 },
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
  is_deleted?: boolean;
}

function ChartInfoTooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex items-center">
      <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-help transition-colors" />
      <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover:block w-56 p-2.5 bg-slate-900/95 backdrop-blur-md text-white text-[11px] rounded-lg shadow-xl border border-slate-800 z-50 pointer-events-none leading-relaxed">
        {text}
      </div>
    </div>
  );
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

interface EtapaStatusNode {
  key: EtapaCampo;
  label: string;
  icon: string;
  order: number;
  status: 'concluida' | 'atual' | 'pendente';
  color: string;
}

interface ObraCampoResumo {
  nome: string;
  versao: string;
  dataStart: string;
  diaAtual: number;
  etapaAtual: EtapaCampo;
  etapaAtualOrder: number;
  fasesStatusList: EtapaStatusNode[];
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
  prazoFinal?: string | null;
  prazoFinalFormatado?: string;
  diasRestantesPrazoFinal?: number | null;
  prazoFinalEstourado?: boolean;
}

// ── Componente Principal ──────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { success, error: toastError } = useToast();

  // Carrega cache de sessão síncrono para eliminar piscadas (0ms first paint)
  const [cachedData] = useState<DashboardCacheData | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(CACHE_KEY_DASHBOARD);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState<boolean>(() => !cachedData);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(() => (cachedData ? new Date(cachedData.ts) : null));
  
  // Extrai o nome do usuário logado do email @terracafe.com
  const currentUser = useMemo(() => {
    if (session?.user?.email) return extractUserName(session.user.email);
    if (session?.user?.name) return session.user.name;
    return 'Diretoria';
  }, [session]);

  // Dados brutos
  const [fases, setFases] = useState<FaseAcaoItem[]>(() => cachedData?.fases || []);
  const [logs, setLogs] = useState<DiarioLog[]>(() => cachedData?.logs || []);
  const [projetosList, setProjetosList] = useState<string[]>(() => cachedData?.projetosList || []);

  // Configurações salvas do Diário
  const [configEtapas, setConfigEtapas] = useState<Record<string, EtapaConfig>>(() => cachedData?.configEtapas || {});
  const [projetoStartDates, setProjetoStartDates] = useState<Record<string, string>>(() => cachedData?.projetoStartDates || {});
  const [responsaveisPorEtapa, setResponsaveisPorEtapa] = useState<Record<string, string[]>>(() => cachedData?.responsaveisPorEtapa || {});
  const [projetosPrazoFinal, setProjetosPrazoFinal] = useState<Record<string, string>>(() => cachedData?.projetosPrazoFinal || {});
  const [usuariosRoles, setUsuariosRoles] = useState<Record<string, string>>(() => cachedData?.usuariosRoles || {});
  const [usuariosSistema, setUsuariosSistema] = useState<{ nome: string; email: string; role: string }[]>(() => cachedData?.usuariosSistema || []);
  const [projetosCriadores, setProjetosCriadores] = useState<Record<string, { email: string; nome?: string; id?: string }>>(() => cachedData?.projetosCriadores || {});

  // Controles de Visualização & Filtros Inteligentes
  const [activeTab, setActiveTab] = useState<'campo' | 'cronograma'>('campo');
  const [selectedProjetoFilter, setSelectedProjetoFilter] = useState<string>('__todos__');
  const [periodoFilter, setPeriodoFilter] = useState<'7d' | '15d' | '30d' | 'tudo'>('30d');
  
  // Filtros rápidos diferenciados
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'alerta' | 'excelente' | 'normal' | 'chuva'>('todos');
  const [etapaFilter, setEtapaFilter] = useState<EtapaCampo | null>(null);
  const [ordemCronograma, setOrdemCronograma] = useState<'criticos' | 'progresso' | 'nome'>('criticos');

  // Modal / Lightbox de Foto
  const [fotoModal, setFotoModal] = useState<DiarioLog | null>(null);
  const [copiandoBriefing, setCopiandoBriefing] = useState<boolean>(false);

  // Acesso restrito: só logins de Admin, Diretor ou Desenvolvedor/master.
  const podeVerDiretor = useMemo(() => {
    if (!session?.user) return false;
    const role = (session.user as { role?: string }).role;
    if (role === 'Admin' || role === 'Diretor' || role === 'Desenvolvedor') return true;
    return isMasterDevSession(session);
  }, [session]);

  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'authenticated') router.push('/login');
    else if (!podeVerDiretor) router.push('/irrigacao/diario-campo');
  }, [status, router, podeVerDiretor]);

  // Carrega dados das APIs com offlineFetch e salva em sessionStorage
  const loadData = useCallback(async (silent = false) => {
    if (!silent && !cachedData) setLoading(true);
    try {
      let nextConfigEtapas: Record<string, EtapaConfig> = {};
      let nextProjetoStartDates: Record<string, string> = {};
      let nextResponsaveisPorEtapa: Record<string, string[]> = {};
      let nextProjetosPrazoFinal: Record<string, string> = {};

      try {
        const savedConfig = localStorage.getItem('diario_etapas_config_v1');
        if (savedConfig) nextConfigEtapas = JSON.parse(savedConfig);

        const savedStarts = localStorage.getItem('diario_projeto_starts_v1');
        if (savedStarts) nextProjetoStartDates = JSON.parse(savedStarts);

        const savedResp = localStorage.getItem('diario_responsaveis_por_etapa_v1');
        if (savedResp) nextResponsaveisPorEtapa = JSON.parse(savedResp);

        const savedPrazos = localStorage.getItem('diario_projetos_prazo_final_v1');
        if (savedPrazos) nextProjetosPrazoFinal = JSON.parse(savedPrazos);
      } catch (e) {
        console.error('[dashboard] Erro ao ler localStorage:', e);
      }

      const [fasesRes, logsRes, projRes, configRes, rolesRes] = await Promise.all([
        offlineFetch('/api/fases'),
        offlineFetch('/api/diario-logs'),
        offlineFetch('/api/projetos'),
        offlineFetch('/api/etapas-config'),
        offlineFetch('/api/usuarios-roles'),
      ]);

      const fasesJson  = fasesRes.ok  ? await fasesRes.json()  : { fases: [] };
      const logsJson   = logsRes.ok   ? await logsRes.json()   : { logs: [] };
      const projJson   = projRes.ok   ? await projRes.json()   : { projetos: [] };
      const configJson = configRes.ok ? await configRes.json() : null;
      const rolesJson  = rolesRes.ok  ? await rolesRes.json()  : { users: [] };

      if (configJson) {
        if (configJson.configEtapas) nextConfigEtapas = configJson.configEtapas;
        if (configJson.projetoStartDates) nextProjetoStartDates = configJson.projetoStartDates;
        if (configJson.responsaveisPorEtapa) nextResponsaveisPorEtapa = configJson.responsaveisPorEtapa;
        if (configJson.projetosPrazoFinal) nextProjetosPrazoFinal = configJson.projetosPrazoFinal;
      }

      setConfigEtapas(nextConfigEtapas);
      setProjetoStartDates(nextProjetoStartDates);
      setResponsaveisPorEtapa(nextResponsaveisPorEtapa);
      setProjetosPrazoFinal(nextProjetosPrazoFinal);

      const nextCriadores = projJson.criadores || {};
      if (projJson.criadores) {
        setProjetosCriadores(projJson.criadores);
      }

      const roleMap: Record<string, string> = {};
      const ativos: { nome: string; email: string; role: string }[] = [];
      (rolesJson.users || []).forEach((u: { name?: string; email?: string; role?: string }) => {
        const role = u.role || 'Agricultor';
        if (u.email) roleMap[u.email.toLowerCase().trim()] = role;
        if (u.name) roleMap[u.name.toLowerCase().trim()] = role;
        ativos.push({ nome: (u.name || '').trim(), email: (u.email || '').toLowerCase().trim(), role });
      });
      setUsuariosRoles(roleMap);
      setUsuariosSistema(ativos);

      const allFases: FaseAcaoItem[] = fasesJson.fases ?? [];
      const allLogs: DiarioLog[] = logsJson.logs ?? [];
      const fromApiProj: string[] = projJson.projetos ?? [];

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
        .filter(l => !l.is_deleted && l.projetoCliente && l.projetoCliente.trim() !== '')
        .map(l => l.projetoCliente as string);

      const unicos = Array.from(
        new Set([...projetosFases, ...projetosDiario, ...fromApiProj].filter(p => !deletados.has(p)))
      ).sort();

      const filteredFases = allFases.filter(f => !f.isDeleted);
      setFases(filteredFases);
      setLogs(allLogs.filter(l => !l.is_deleted));
      setProjetosList(unicos);
      const agora = new Date();
      setLastUpdate(agora);

      try {
        const toCache: DashboardCacheData = {
          fases: filteredFases,
          logs: allLogs,
          projetosList: unicos,
          configEtapas: nextConfigEtapas,
          projetoStartDates: nextProjetoStartDates,
          responsaveisPorEtapa: nextResponsaveisPorEtapa,
          projetosPrazoFinal: nextProjetosPrazoFinal,
          usuariosRoles: roleMap,
          usuariosSistema: ativos,
          projetosCriadores: nextCriadores,
          ts: agora.getTime(),
        };
        sessionStorage.setItem(CACHE_KEY_DASHBOARD, JSON.stringify(toCache));
      } catch {}
    } catch (err) {
      console.error('[dashboard] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }, [cachedData]);

  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (status === 'authenticated' && !initialLoadDone.current) {
      initialLoadDone.current = true;
      void loadData(Boolean(cachedData));
    }
  }, [status, loadData, cachedData]);

  // Auto-refresh: polling 30s + recarga ao focar/visibilidade
  const loadingRef = useRef(loading);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const REFRESH_MS = 30 * 1000;

    const timerId = setInterval(() => {
      if (!loadingRef.current) void loadData(true);
    }, REFRESH_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !loadingRef.current) {
        void loadData(true);
      }
    };

    const onFocus = () => {
      if (!loadingRef.current) void loadData(true);
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timerId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [status, loadData]);

  const { selectedLoja, isProjectInSelectedLoja } = useLoja();

  // ── Filtro por Loja / Filial ───────────────────────────────────────────────
  const projetosListFiltrados = useMemo(() => {
    if (selectedLoja === 'TODAS') return projetosList;
    return projetosList.filter((nome) => {
      const criadorEmail = projetosCriadores[nome]?.email;
      return isProjectInSelectedLoja(nome, criadorEmail);
    });
  }, [projetosList, selectedLoja, isProjectInSelectedLoja, projetosCriadores]);

  useEffect(() => {
    if (selectedProjetoFilter !== '__todos__' && !projetosListFiltrados.includes(selectedProjetoFilter)) {
      setSelectedProjetoFilter('__todos__');
    }
  }, [projetosListFiltrados, selectedProjetoFilter]);

  const logsFiltradosLoja = useMemo(() => {
    if (selectedLoja === 'TODAS') return logs;
    const permitidos = new Set(projetosListFiltrados.map(n => n.trim().toLowerCase()));
    return logs.filter((l) => l.projetoCliente && permitidos.has(l.projetoCliente.trim().toLowerCase()));
  }, [logs, selectedLoja, projetosListFiltrados]);

  // ── Filtro por Período de Logs ──────────────────────────────────────────────
  const logsFiltradosPeriodo = useMemo(() => {
    if (periodoFilter === 'tudo') return logsFiltradosLoja;
    const dias = periodoFilter === '7d' ? 7 : periodoFilter === '15d' ? 15 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - dias);
    cutoff.setHours(0, 0, 0, 0);

    return logsFiltradosLoja.filter(l => {
      const d = new Date(`${l.data}T00:00:00`);
      return d >= cutoff;
    });
  }, [logsFiltradosLoja, periodoFilter]);

  // ── Construção do Mapa das Obras de Campo ────────────────────────────────────
  const obrasCampo = useMemo((): ObraCampoResumo[] => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    return projetosListFiltrados.map(nomeProjeto => {
      const pNomeLc = nomeProjeto.trim().toLowerCase();
      const logsProjeto = logs.filter(l => (l.projetoCliente || '').trim().toLowerCase() === pNomeLc);
      
      // Data de Start do Projeto
      let dataStart = projetoStartDates[nomeProjeto];
      if (!dataStart) {
        if (logsProjeto.length > 0) {
          const datas = logsProjeto.map(l => l.data).sort();
          dataStart = datas[0];
        } else {
          dataStart = hojeSP();
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
        const sortedLogs = [...logsProjeto].sort((a, b) => b.data.localeCompare(a.data));
        ultimoLogProjeto = sortedLogs[0];

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

      const etapaAtualOrder = ETAPAS_CAMPO_ORDEM.find(e => e.key === etapaAtual)?.order || 1;

      // Monta mini-pipeline dos 6 estágios para esta fazenda
      const fasesStatusList: EtapaStatusNode[] = ETAPAS_CAMPO_ORDEM.map(e => {
        let nodeStatus: 'concluida' | 'atual' | 'pendente' = 'pendente';
        if (e.order < etapaAtualOrder) {
          nodeStatus = 'concluida';
        } else if (e.order === etapaAtualOrder) {
          nodeStatus = 'atual';
        } else {
          nodeStatus = 'pendente';
        }
        return {
          key: e.key,
          label: e.label,
          icon: e.icon,
          order: e.order,
          color: e.color,
          status: nodeStatus,
        };
      });

      // Configuração e metas da etapa atual
      const configKey = `${nomeProjeto}::${etapaAtual}`;
      type EtapaConfigFull = { dataInicio: string; metaDias: number; prazoLimite?: string; hasStarted?: boolean };
      const confSalva = configEtapas[configKey] as EtapaConfigFull | undefined;
      const etapaFoiIniciada = confSalva?.hasStarted === true;

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

      // Responsáveis
      const respFasesAcao = fases
        .filter(f =>
          !f.isDeleted &&
          (f.projetoCliente || '').trim().toLowerCase() === pNomeLc &&
          f.responsavel &&
          !isResponsavelVazio(f.responsavel)
        )
        .flatMap(f => parseResponsavelEmails(f.responsavel).filter(Boolean));

      const respOutrasEtapasDoProjeto = Object.entries(responsaveisPorEtapa)
        .filter(([k]) => k.trim().toLowerCase().startsWith(`${pNomeLc}::`))
        .flatMap(([, v]) => v || []);

      const respTodosBruto = Array.from(
        new Set([...respFasesAcao, ...(responsaveisPorEtapa[configKey] || []), ...respOutrasEtapasDoProjeto])
      )
        .filter(Boolean)
        .map(r => String(r).trim());

      const respReais = respTodosBruto.filter(r => !TERMOS_GENERICOS_RESP.has(normalizeName(r)));
      const respTodos = (respReais.length > 0 ? respReais : [])
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));

      const prazoFinalProj =
        projetosPrazoFinal[nomeProjeto] ||
        Object.entries(projetosPrazoFinal).find(([k]) => k.trim().toLowerCase() === pNomeLc)?.[1] ||
        null;

      let prazoFinalFormatado: string | undefined = undefined;
      let diasRestantesPrazoFinal: number | null = null;
      let prazoFinalEstourado = false;

      if (prazoFinalProj) {
        const dPrazo = new Date(`${prazoFinalProj.slice(0, 10)}T00:00:00`);
        if (!isNaN(dPrazo.getTime())) {
          prazoFinalFormatado = dPrazo.toLocaleDateString('pt-BR');
          diasRestantesPrazoFinal = Math.ceil((dPrazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          prazoFinalEstourado = diasRestantesPrazoFinal < 0;
        }
      }

      return {
        nome: nomeProjeto,
        versao: getProjectVersion(nomeProjeto),
        dataStart,
        diaAtual,
        etapaAtual,
        etapaAtualOrder,
        fasesStatusList,
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
        prazoFinal: prazoFinalProj,
        prazoFinalFormatado,
        diasRestantesPrazoFinal,
        prazoFinalEstourado,
      };
    });
  }, [projetosListFiltrados, logs, fases, projetoStartDates, configEtapas, responsaveisPorEtapa, projetosPrazoFinal]);

  // Obra selecionada (se houver filtro específico de dropdown)
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
    const obrasNoRitmo = obrasCampo.filter(o => o.saude === 'normal').length;
    const obrasAceleradas = obrasCampo.filter(o => o.saude === 'excelente').length;
    const obrasAlerta = obrasCampo.filter(o => o.saude === 'alerta').length;
    const obrasChuva = obrasCampo.filter(o => o.saude === 'chuva').length;
    const indiceSaude = totalObras > 0 ? Math.round(((obrasNoRitmo + obrasAceleradas) / totalObras) * 100) : null;

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
      : null;

    const hojeStr = hojeSP();
    const logsHoje = logs.filter(l => l.data === hojeStr).length;

    // Obras com prazo estourado ou vencendo nos próximos 7 dias
    const obrasPrazoCritico = obrasCampo.filter(o => 
      o.prazoFinalEstourado || (o.diasRestantesPrazoFinal !== null && o.diasRestantesPrazoFinal !== undefined && o.diasRestantesPrazoFinal <= 7)
    );

    return {
      totalObras,
      obrasNoRitmo,
      obrasAceleradas,
      obrasAlerta,
      obrasChuva,
      obrasPrazoCriticoCount: obrasPrazoCritico.length,
      obrasPrazoCritico,
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

  // ── Radar de Inteligência Executiva (Highlights do Diretor) ───────────────────
  const radarInsights = useMemo(() => {
    // 1. Gargalo Técnico: etapa com maior número de obras
    const countsPorEtapa = ETAPAS_CAMPO_ORDEM.map(e => ({
      etapa: e,
      count: obrasCampo.filter(o => o.etapaAtual === e.key).length,
    })).sort((a, b) => b.count - a.count);

    const principalGargalo = countsPorEtapa[0] || null;

    // 2. Obras que necessitam de intervenção direta
    const obrasComRisco = obrasCampo.filter(o => o.saude === 'alerta' || o.prazoFinalEstourado);

    // 3. Dias parados por clima
    const totalParadasChuva = kpisDiretor.countChuva;

    return {
      principalGargalo,
      obrasComRisco,
      totalParadasChuva,
      taxaEficiencia: kpisDiretor.taxaRendimentoBom,
    };
  }, [obrasCampo, kpisDiretor]);

  // ── Obras Filtradas para Apresentação em Cards (Com busca e filtros rápidos) ───
  const obrasExibidas = useMemo(() => {
    return obrasCampo.filter(obra => {
      // 1. Filtro de dropdown único
      if (selectedProjetoFilter !== '__todos__' && obra.nome !== selectedProjetoFilter) {
        return false;
      }

      // 2. Filtro de Etapa Técnica Clicada no Radar
      if (etapaFilter && obra.etapaAtual !== etapaFilter) {
        return false;
      }

      // 3. Filtro rápido de Saúde/Status
      if (statusFilter !== 'todos' && obra.saude !== statusFilter) {
        return false;
      }

      // 4. Busca por texto (nome da obra ou responsável)
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        const nomeMatch = obra.nome.toLowerCase().includes(q);
        const respMatch = obra.responsaveis.some(r => r.toLowerCase().includes(q));
        const etapaMatch = obra.etapaAtual.toLowerCase().includes(q);
        if (!nomeMatch && !respMatch && !etapaMatch) return false;
      }

      return true;
    });
  }, [obrasCampo, selectedProjetoFilter, etapaFilter, statusFilter, searchQuery]);

  // ── Dados para os Gráficos de Campo ─────────────────────────────────────────

  // 1. Distribuição das Obras pelas 6 Etapas de Campo (Pipeline)
  const dadosPipelineEtapas = useMemo(() => {
    const totalObras = obrasCampo.length;
    return ETAPAS_CAMPO_ORDEM.map(etapa => {
      const obrasNestaEtapa = obrasCampo.filter(o => o.etapaAtual === etapa.key);
      const pct = totalObras > 0 ? Math.round((obrasNestaEtapa.length / totalObras) * 100) : 0;
      return {
        etapaKey: etapa.key,
        name: etapa.label,
        icon: etapa.icon,
        obrasCount: obrasNestaEtapa.length,
        obrasNomes: obrasNestaEtapa.map(o => o.nome),
        fill: etapa.color,
        pct,
        order: etapa.order,
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
    ];
  }, [kpisDiretor]);

  // 3. Atividade Diária nos Últimos 14 Dias (Produtividade, Chuva e Desvios)
  const dadosTimelineAtividade = useMemo(() => {
    const dias = 14;
    const resultado: {
      dia: string;
      dataCompleta: string;
      registros: number;
      noRitmo: number;
      abaixo: number;
      chuva: number;
      eficienciaPct: number | null;
    }[] = [];
    const fmtSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = fmtSP.format(d);
      const logsDoDia = logsVisiveis.filter(l => l.data === dStr);

      const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
      const total = logsDoDia.length;
      const chuva = logsDoDia.filter(l => (l.status || '').toLowerCase().includes('chuva')).length;
      const abaixo = logsDoDia.filter(l => {
        const s = (l.status || '').toLowerCase();
        return s.includes('abaixo') || s.includes('problema') || s.includes('atras');
      }).length;
      const noRitmo = Math.max(0, total - abaixo - chuva);
      const eficienciaPct = total > 0 ? Math.round((noRitmo / total) * 100) : null;

      resultado.push({
        dia: label,
        dataCompleta: dStr,
        registros: total,
        noRitmo,
        abaixo,
        chuva,
        eficienciaPct,
      });
    }
    return resultado;
  }, [logsVisiveis]);

  // 4. Termômetro de Ritmo: Avanço Físico Real (%) vs. Consumo do Prazo (%)
  const dadosProgressoVsTempo = useMemo(() => {
    return obrasCampo.slice(0, 7).map(obra => {
      let metaTotalDias = 0;
      ETAPAS_CAMPO_ORDEM.forEach(etp => {
        const cfg = configEtapas[`${obra.nome}::${etp.key}`];
        metaTotalDias += cfg?.metaDias || 20;
      });
      if (metaTotalDias <= 0) metaTotalDias = 90;

      // % de consumo do prazo da obra
      const pctTempo = Math.min(100, Math.max(0, Math.round((obra.diaAtual / metaTotalDias) * 100)));

      // % de avanço físico ponderado pelo ciclo técnico
      const etapasCompletas = obra.fasesStatusList.filter(f => f.status === 'concluida').length;
      const fracaoAtual = (obra.pctEtapa / 100) * (100 / 6);
      const pctAvanco = Math.min(100, Math.max(0, Math.round((etapasCompletas / 6) * 100 + fracaoAtual)));

      const diferenca = pctAvanco - pctTempo;
      const statusRitmo = diferenca >= 0 ? 'No Ritmo / Adiantada' : 'Atrasada em Ritmo';

      return {
        nome: extractProjectBaseName(obra.nome),
        nomeCompleto: obra.nome,
        avanco: pctAvanco,
        tempoConsumido: pctTempo,
        diferenca,
        statusRitmo,
        diaAtual: obra.diaAtual,
        metaTotalDias,
        etapaAtual: obra.etapaAtual,
        saude: obra.saude,
      };
    });
  }, [obrasCampo, configEtapas]);

  // 5. Diagnóstico de Gargalos: Duração Média Real vs. Meta por Etapa Técnica (Lead Time)
  const dadosLeadTimeEtapas = useMemo(() => {
    return ETAPAS_CAMPO_ORDEM.map(etp => {
      let totalDiasGastos = 0;
      let countObras = 0;
      let totalMeta = 0;

      obrasCampo.forEach(obra => {
        const cfg = configEtapas[`${obra.nome}::${etp.key}`];
        const meta = cfg?.metaDias || 20;
        totalMeta += meta;

        if (obra.etapaAtualOrder === etp.order) {
          totalDiasGastos += obra.diasDecorridosEtapa;
          countObras++;
        } else if (obra.etapaAtualOrder > etp.order) {
          totalDiasGastos += meta;
          countObras++;
        }
      });

      const mediaDiasReal = countObras > 0 ? Math.round(totalDiasGastos / countObras) : 0;
      const mediaMeta = obrasCampo.length > 0 ? Math.round(totalMeta / obrasCampo.length) : 20;
      const desvio = mediaDiasReal - mediaMeta;

      return {
        etapa: etp.label,
        key: etp.key,
        icon: etp.icon,
        diasReal: mediaDiasReal,
        diasMeta: mediaMeta,
        desvio,
        color: etp.color,
        isGargalo: desvio > 0,
      };
    });
  }, [obrasCampo, configEtapas]);

  // ── Projetos por Agricultor ─────────────────────────────────────────────────
  const projetosPorAgricultor = useMemo(() => {
    const mapa: Record<string, {
      nome: string;
      projetos: string[];
      totalProjetos: number;
      comoCriador: number;
      comoResponsavel: number;
    }> = {};

    const norm = (s: string) =>
      (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

    const emailsAtivos = new Set(usuariosSistema.map(u => u.email).filter(Boolean));
    const nomesAtivos = new Set(usuariosSistema.map(u => u.nome.toLowerCase()).filter(Boolean));
    const normAtivos = new Set<string>();
    usuariosSistema.forEach(u => {
      if (u.email) {
        normAtivos.add(norm(u.email));
        normAtivos.add(norm(u.email.split('@')[0]));
      }
      if (u.nome) normAtivos.add(norm(u.nome));
    });

    const normalizarPessoa = (raw: string) => {
      const trimmed = (raw || '').trim();
      if (!trimmed || trimmed.toLowerCase() === 'sistema') return null;
      let email = '';
      let nome = '';

      if (trimmed.includes('@')) {
        email = trimmed.toLowerCase();
        nome = extractUserName(email);
      } else {
        const clean = trimmed.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9._-]/g, '');
        email = `${clean}@terracafe.com`;
        nome = extractUserName(trimmed);
      }
      return { nome, email };
    };

    const getRoleAtivo = (p: { nome: string; email: string }): string | null => {
      const emailLower = (p.email || '').toLowerCase().trim();
      const nomeLower = (p.nome || '').toLowerCase().trim();
      if (emailLower === ADMIN_MASTER_EMAIL.toLowerCase()) return 'Desenvolvedor';
      if (emailLower && emailsAtivos.has(emailLower)) return usuariosRoles[emailLower] || 'Agricultor';
      if (nomeLower && nomesAtivos.has(nomeLower)) return usuariosRoles[nomeLower] || 'Agricultor';
      if (normAtivos.has(norm(emailLower)) || normAtivos.has(norm(nomeLower))) {
        return usuariosRoles[emailLower] || usuariosRoles[nomeLower] || 'Agricultor';
      }
      return null;
    };

    const registrar = (p: { nome: string }, projNome: string, como: 'criador' | 'responsavel') => {
      const key = p.nome.toLowerCase();
      if (!mapa[key]) {
        mapa[key] = { nome: p.nome, projetos: [], totalProjetos: 0, comoCriador: 0, comoResponsavel: 0 };
      }
      if (!mapa[key].projetos.includes(projNome)) {
        mapa[key].projetos.push(projNome);
        mapa[key].totalProjetos++;
      }
      if (como === 'criador') mapa[key].comoCriador++;
      else mapa[key].comoResponsavel++;
    };

    Object.entries(projetosCriadores).forEach(([projNome, criador]) => {
      if (!criador?.email) return;
      const p = normalizarPessoa(criador.email);
      if (!p) return;
      if (getRoleAtivo(p) !== 'Agricultor') return;
      registrar(p, projNome, 'criador');
    });

    fases.forEach(f => {
      if (f.isDeleted || !f.projetoCliente || !f.responsavel) return;
      parseResponsavelEmails(f.responsavel).forEach(parte => {
        const p = normalizarPessoa(parte);
        if (!p) return;
        if (getRoleAtivo(p) !== 'Agricultor') return;
        registrar(p, f.projetoCliente!, 'responsavel');
      });
    });

    Object.entries(responsaveisPorEtapa).forEach(([chave, respList]) => {
      const [projNome] = chave.split('::');
      if (!projNome) return;
      (respList || []).forEach(parte => {
        const p = normalizarPessoa(parte);
        if (!p) return;
        if (getRoleAtivo(p) !== 'Agricultor') return;
        registrar(p, projNome, 'responsavel');
      });
    });

    return Object.values(mapa)
      .filter(a => a.totalProjetos > 0)
      .sort((a, b) => b.totalProjetos - a.totalProjetos);
  }, [projetosCriadores, fases, responsaveisPorEtapa, usuariosRoles, usuariosSistema]);

  // ── Dados para a Aba de Cronograma & Prazos das 6 Fases ────────────────────
  const dadosCronogramaFases = useMemo(() => {
    const hojeMs = new Date().setHours(0, 0, 0, 0);

    const porFase = ETAPAS_CAMPO_ORDEM.map(etp => {
      let concluidas = 0;
      let atrasadas = 0;
      let noPrazo = 0;
      let naoIniciadas = 0;

      projetosListFiltrados.forEach(projNome => {
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
        const isConc = temConcluido || (cfg?.status || '').toLowerCase().includes('concluíd') || (cfg?.status || '').toLowerCase().includes('concluid');

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
        total: projetosListFiltrados.length,
      };
    });

    // Visão consolidada por obra
    let obrasDetalhadas = projetosListFiltrados.map(projNome => {
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
        const isConc = temConcluido || (cfg?.status || '').toLowerCase().includes('concluíd') || (cfg?.status || '').toLowerCase().includes('concluid');

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

    // Ordenação dinâmica da tabela de cronograma
    if (ordemCronograma === 'criticos') {
      obrasDetalhadas.sort((a, b) => {
        if (a.atrasadoTotal !== b.atrasadoTotal) return a.atrasadoTotal ? -1 : 1;
        if (a.fasesAtrasadasCount !== b.fasesAtrasadasCount) return b.fasesAtrasadasCount - a.fasesAtrasadasCount;
        return a.diasRestantesTotal - b.diasRestantesTotal;
      });
    } else if (ordemCronograma === 'progresso') {
      obrasDetalhadas.sort((a, b) => b.pctGeral - a.pctGeral);
    } else {
      obrasDetalhadas.sort((a, b) => a.baseName.localeCompare(b.baseName, 'pt-BR'));
    }

    const totalFasesGeral = projetosListFiltrados.length * 6;
    const totalConcluidasGeral = obrasDetalhadas.reduce((acc, o) => acc + o.fasesConcluidasCount, 0);
    const taxaGeral = totalFasesGeral > 0 ? Math.round((totalConcluidasGeral / totalFasesGeral) * 100) : 0;
    const obrasComAtraso = obrasDetalhadas.filter(o => o.atrasadoTotal || o.fasesAtrasadasCount > 0).length;

    return {
      porFase,
      obrasDetalhadas,
      taxaGeral,
      obrasComAtraso,
      totalObras: projetosListFiltrados.length,
      totalConcluidas: totalConcluidasGeral,
      totalFases: totalFasesGeral,
    };
  }, [projetosListFiltrados, configEtapas, logs, projetosPrazoFinal, ordemCronograma]);

  // ── Copiar Briefing Executivo para Área de Transferência ──────────────────────
  const handleCopiarBriefing = useCallback(() => {
    setCopiandoBriefing(true);
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const filialStr = selectedLoja === 'TODAS' ? 'Todas as Filiais' : `Filial ${selectedLoja}`;
    
    const texto = [
      `🌾 *TERRACAFÉ - BRIEFING EXECUTIVO DA DIRETORIA*`,
      `📅 *Data:* ${dataHoje} | *Escopo:* ${filialStr}`,
      `👤 *Diretor/Gestor:* ${currentUser}`,
      ``,
      `📊 *INDICADORES-CHAVE:*`,
      `• Total de Obras: ${kpisDiretor.totalObras} frentes ativas`,
      `• Índice de Saúde: ${kpisDiretor.indiceSaude ?? '—'}% no ritmo ideal`,
      `• Eficiência de Campo: ${kpisDiretor.taxaRendimentoBom ?? '—'}% de apontamentos regulares/acima`,
      `• Obras em Risco/Alerta: ${kpisDiretor.obrasAlerta} obra(s)`,
      `• Paradas por Chuva: ${kpisDiretor.countChuva} registro(s)`,
      `• Apontamentos Hoje: ${kpisDiretor.logsHoje} no Diário`,
      ``,
      radarInsights.principalGargalo?.count ? `⚙️ *Gargalo Técnico:* ${radarInsights.principalGargalo.etapa.label} com ${radarInsights.principalGargalo.count} obra(s)` : '',
      radarInsights.obrasComRisco.length > 0 ? `🚨 *Atenção Crítica:* ${radarInsights.obrasComRisco.map(o => extractProjectBaseName(o.nome)).join(', ')}` : '✅ Nenhuma obra com atraso crítico no momento.',
      ``,
      `_Gerado automaticamente pelo Sistema TerraCafé Irrigação_`
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(texto).then(() => {
      success('Briefing executivo copiado para a área de transferência!');
      setTimeout(() => setCopiandoBriefing(false), 2000);
    }).catch(() => {
      toastError('Não foi possível copiar o briefing.');
      setCopiandoBriefing(false);
    });
  }, [selectedLoja, currentUser, kpisDiretor, radarInsights, success, toastError]);

  if ((status === 'loading' || loading) && !cachedData) {
    return <DashboardSkeleton />;
  }

  if (status === 'authenticated' && !podeVerDiretor) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-[#070c18] text-slate-500">
        <p className="text-sm font-semibold">Acesso restrito à Diretoria e Administradores.</p>
      </div>
    );
  }

  const temFiltroAtivo = selectedProjetoFilter !== '__todos__' || etapaFilter !== null || statusFilter !== 'todos' || searchQuery.trim() !== '';

  const limparTodosFiltros = () => {
    setSelectedProjetoFilter('__todos__');
    setEtapaFilter(null);
    setStatusFilter('todos');
    setSearchQuery('');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070c18] text-slate-700 dark:text-slate-300 p-3 sm:p-5 md:p-6 lg:p-8 font-sans transition-colors">
      <div className="max-w-[1600px] mx-auto w-full">

        {/* ── HEADER EXECUTIVO COM DESIGN GLASSMORPHIC PREMIUM ────────────────── */}
        <div className="relative mb-6 rounded-2xl bg-white/90 dark:bg-[#0d1527]/90 border border-slate-200/80 dark:border-[#1e293b] p-4 sm:p-6 shadow-sm backdrop-blur-md overflow-hidden">
          {/* Luz ambiente de destaque no topo */}
          <div className="absolute -top-24 -left-24 w-72 h-72 bg-blue-500/10 dark:bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-emerald-500/10 dark:bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mb-2">
                <BackButton />
                <img src="/logo-terra-cafe.png" alt="TerraCafé" className="h-4.5 w-auto object-contain dark:hidden" />
                <img src="/logo-terra-cafe-white.png" alt="TerraCafé" className="h-4.5 w-auto object-contain hidden dark:block" />
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-slate-900 dark:text-white font-semibold">Painel Executivo da Diretoria</span>
              </nav>

              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/25 shrink-0 ring-2 ring-blue-500/20">
                  <BarChart2 className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2 flex-wrap">
                    Visão do Diretor
                    <span className="text-base font-normal text-slate-400 dark:text-slate-500">|</span>
                    <span className="text-base sm:text-lg font-medium text-slate-600 dark:text-slate-300">
                      Irrigação & Obras de Campo
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Ao Vivo
                    </span>
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-1 flex-wrap">
                    {lastUpdate && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        Sincronizado às {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    <span>•</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {obrasCampo.length} fazendas ativas
                    </span>
                    <span>•</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      Gestor: <strong className="text-slate-800 dark:text-white">{currentUser}</strong>
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Barra de Ações Rápidas Executivas */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <InstallAppButton />

              <button
                onClick={handleCopiarBriefing}
                title="Copiar resumo executivo formatado para WhatsApp ou E-mail"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-[#1e293b] hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 shadow-sm transition-all"
              >
                {copiandoBriefing ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                <span>Copiar Briefing</span>
              </button>

              <button
                onClick={() => void loadData()}
                title="Recarregar dados do servidor agora"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-[#111c33] border border-slate-200 dark:border-[#1e293b] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1e293b] text-xs font-semibold shadow-sm transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                Atualizar
              </button>

              <Link
                href="/irrigacao/diario-campo"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-md shadow-amber-500/20 transition-all"
              >
                <Calendar className="w-3.5 h-3.5" />
                Diário de Campo
              </Link>

              <button
                onClick={() => {
                  const param = selectedProjetoFilter === '__todos__' ? '__todos__' : encodeURIComponent(selectedProjetoFilter);
                  window.open(`/relatorio?projeto=${param}`, '_blank');
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-lg shadow-blue-600/25 transition-all"
              >
                <FileDown className="w-4 h-4" />
                Relatório PDF
              </button>
            </div>
          </div>
        </div>

        {/* ── RADAR DE INTELIGÊNCIA EXECUTIVA (STRIP DE INSIGHTS RÁPIDOS) ───────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {/* Card 1: Gargalo Atual */}
          <div 
            onClick={() => {
              if (radarInsights.principalGargalo) {
                setEtapaFilter(radarInsights.principalGargalo.etapa.key);
                setActiveTab('campo');
              }
            }}
            className="cursor-pointer group p-3.5 rounded-2xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] hover:border-blue-500/40 shadow-sm transition-all flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 text-base">
              {radarInsights.principalGargalo?.etapa.icon || '⚙️'}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Frente Mais Concentrada
              </span>
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {radarInsights.principalGargalo?.etapa.label || 'Sem obras ativas'}
              </p>
              <p className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                {radarInsights.principalGargalo?.count || 0} fazenda(s) nesta etapa • Ver
              </p>
            </div>
          </div>

          {/* Card 2: Prazos Críticos */}
          <div 
            onClick={() => {
              setStatusFilter('alerta');
              setActiveTab('campo');
            }}
            className="cursor-pointer group p-3.5 rounded-2xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] hover:border-rose-500/40 shadow-sm transition-all flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Prazos & Atenção
              </span>
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {kpisDiretor.obrasPrazoCriticoCount > 0 ? `${kpisDiretor.obrasPrazoCriticoCount} obra(s) críticas` : 'Sem estouro de prazo'}
              </p>
              <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                {kpisDiretor.obrasPrazoCriticoCount > 0 ? 'Exigem alinhamento imediato' : 'Tudo dentro do prazo oficial'}
              </p>
            </div>
          </div>

          {/* Card 3: Clima & Paralisações */}
          <div 
            onClick={() => {
              setStatusFilter('chuva');
              setActiveTab('campo');
            }}
            className="cursor-pointer group p-3.5 rounded-2xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] hover:border-cyan-500/40 shadow-sm transition-all flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center shrink-0">
              <CloudRain className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Impacto de Chuvas
              </span>
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {kpisDiretor.countChuva} registros de chuva
              </p>
              <p className="text-[11px] text-cyan-600 dark:text-cyan-400 font-medium">
                {kpisDiretor.obrasChuva > 0 ? `${kpisDiretor.obrasChuva} obra(s) paradas hoje` : 'Tempo firme nas frentes'}
              </p>
            </div>
          </div>

          {/* Card 4: Assiduidade & Hoje */}
          <div 
            onClick={() => {
              setActiveTab('campo');
            }}
            className="p-3.5 rounded-2xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] shadow-sm flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Assiduidade Hoje
              </span>
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {kpisDiretor.logsHoje} apontamento(s) hoje
              </p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                {kpisDiretor.totalLogsPeriodo} relatos no ciclo ({periodoFilter})
              </p>
            </div>
          </div>
        </div>

        {/* ── BARRA DE CONTROLE, FILTROS INTELIGENTES E ABAS ───────────────────── */}
        <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-4 mb-6 shadow-sm space-y-3.5">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            
            {/* Lado Esquerdo: Filial, Busca e Select de Obra */}
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
              {/* Filial */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] shrink-0">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Filial:</span>
                <LojaSelector />
              </div>

              {/* Busca Rápida por Nome da Fazenda ou Responsável */}
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar fazenda, técnico ou etapa..."
                  className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Select de Fazenda Específica */}
              <div className="relative min-w-[190px]">
                <select
                  value={selectedProjetoFilter}
                  onChange={(e) => setSelectedProjetoFilter(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 cursor-pointer truncate"
                >
                  <option value="__todos__">🏢 Todas as Fazendas</option>
                  {projetosListFiltrados.map(proj => (
                    <option key={proj} value={proj}>🚜 {proj}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Lado Direito: Filtro de Período e Seleção de Abas */}
            <div className="flex flex-wrap items-center gap-2 justify-between lg:justify-end shrink-0">
              {/* Seletor de Período */}
              <div className="flex items-center bg-slate-100 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl p-1 text-xs">
                <span className="text-slate-400 px-1.5 text-[10px] uppercase font-bold shrink-0">Período:</span>
                {(['7d', '15d', '30d', 'tudo'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriodoFilter(p)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                      periodoFilter === p
                        ? 'bg-white dark:bg-[#1e293b] text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {p === 'tudo' ? 'Tudo' : `${p.replace('d', '')}d`}
                  </button>
                ))}
              </div>

              {/* Alternância de Abas */}
              <div className="flex items-center bg-slate-100 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl p-1 text-xs">
                <button
                  onClick={() => setActiveTab('campo')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                    activeTab === 'campo'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Operação de Campo</span>
                </button>
                <button
                  onClick={() => setActiveTab('cronograma')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                    activeTab === 'cronograma'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Cronograma & Prazos</span>
                </button>
              </div>
            </div>

          </div>

          {/* Linha 2: Filtros Rápidos por Status (Pills com Contadores) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-[#1e293b]/70">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] font-bold text-slate-400 mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Status:
              </span>
              
              <button
                onClick={() => setStatusFilter('todos')}
                className={`px-2.5 py-1 rounded-lg font-semibold text-xs transition-all ${
                  statusFilter === 'todos'
                    ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-sm'
                    : 'bg-slate-100 dark:bg-[#070c18] text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                Todas ({obrasCampo.length})
              </button>

              <button
                onClick={() => setStatusFilter('alerta')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold text-xs transition-all ${
                  statusFilter === 'alerta'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                Em Risco / Atraso ({kpisDiretor.obrasAlerta})
              </button>

              <button
                onClick={() => setStatusFilter('normal')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold text-xs transition-all ${
                  statusFilter === 'normal'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                No Ritmo ({kpisDiretor.obrasNoRitmo})
              </button>

              <button
                onClick={() => setStatusFilter('excelente')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold text-xs transition-all ${
                  statusFilter === 'excelente'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100'
                }`}
              >
                <TrendingUp className="w-3 h-3" />
                Aceleradas ({kpisDiretor.obrasAceleradas})
              </button>

              <button
                onClick={() => setStatusFilter('chuva')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold text-xs transition-all ${
                  statusFilter === 'chuva'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'bg-cyan-50 dark:bg-cyan-950/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-100'
                }`}
              >
                <CloudRain className="w-3 h-3" />
                Chuva ({kpisDiretor.obrasChuva})
              </button>
            </div>

            {/* Chips de Filtro Ativo e Botão de Limpar */}
            {temFiltroAtivo && (
              <div className="flex items-center gap-1.5">
                {etapaFilter && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                    Etapa: {etapaFilter}
                    <button onClick={() => setEtapaFilter(null)} className="hover:text-blue-900 dark:hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                <button
                  onClick={limparTodosFiltros}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all"
                >
                  <X className="w-3 h-3" /> Limpar filtros
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── PLACAR DE KPIS DO DIRETOR (SCORECARD EXECUTIVO) ──────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-6">
          
          {/* KPI 1: Obras Ativas */}
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-4 shadow-sm relative overflow-hidden group hover:border-blue-500/40 transition-all">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Obras Ativas</span>
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <Briefcase className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {kpisDiretor.totalObras}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {selectedProjetoFilter === '__todos__' ? 'Fazendas monitoradas' : 'Fazenda isolada'}
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-indigo-600" />
          </div>

          {/* KPI 2: Índice de Saúde do Portfólio */}
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-4 shadow-sm relative overflow-hidden group hover:border-emerald-500/40 transition-all">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Saúde Geral</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
              {kpisDiretor.indiceSaude === null ? '—' : `${kpisDiretor.indiceSaude}%`}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {kpisDiretor.totalObras > 0
                ? `${kpisDiretor.obrasNoRitmo + kpisDiretor.obrasAceleradas} de ${kpisDiretor.totalObras} no ritmo ideal`
                : 'Sem obras no escopo'}
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
          </div>

          {/* KPI 3: Ritmo Operacional */}
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-4 shadow-sm relative overflow-hidden group hover:border-blue-400/40 transition-all">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Eficiência</span>
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 tracking-tight">
              {kpisDiretor.taxaRendimentoBom === null ? '—' : `${kpisDiretor.taxaRendimentoBom}%`}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {kpisDiretor.totalLogsPeriodo > 0
                ? `${kpisDiretor.countAcima + kpisDiretor.countDentro} relatos normais/acima`
                : 'Sem relatos no período'}
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-500" />
          </div>

          {/* KPI 4: Obras em Alerta / Atrasadas */}
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-4 shadow-sm relative overflow-hidden group hover:border-rose-500/40 transition-all">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Risco & Alerta</span>
              <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className={`text-2xl sm:text-3xl font-black tracking-tight ${kpisDiretor.obrasAlerta > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
              {kpisDiretor.obrasAlerta}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {kpisDiretor.obrasAlerta > 0 ? 'Exigem ação imediata' : 'Nenhuma em atraso'}
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-red-600" />
          </div>

          {/* KPI 5: Dias Parados por Chuva */}
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-4 shadow-sm relative overflow-hidden group hover:border-cyan-400/40 transition-all">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Paradas Clima</span>
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
                <CloudRain className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-cyan-600 dark:text-cyan-400 tracking-tight">
              {kpisDiretor.countChuva}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              relatos com chuva
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 to-blue-500" />
          </div>

          {/* KPI 6: Apontamentos Hoje / Assiduidade */}
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-4 shadow-sm relative overflow-hidden group hover:border-amber-500/40 transition-all">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Diário Hoje</span>
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <Activity className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {kpisDiretor.logsHoje}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {kpisDiretor.totalLogsPeriodo} no ciclo ({periodoFilter})
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
          </div>
        </div>

        {/* ── CONTEÚDO DA ABA 1: OPERAÇÕES DE CAMPO & IRRIGAÇÃO ────────────────── */}
        {activeTab === 'campo' && (
          <div className="space-y-6">

            {/* SEÇÃO 1: PIPELINE / RADAR INTERATIVO DAS 6 ETAPAS DE CAMPO */}
            <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-5 sm:p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-blue-500" />
                    Radar das 6 Etapas Técnicas de Implantação
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Clique em qualquer etapa para filtrar instantaneamente as fazendas em andamento nessa fase
                  </p>
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 self-start sm:self-auto">
                  Funil Operacional TerraCafé
                </span>
              </div>

              {/* Grid Interativo das 6 Etapas com Conexão Visual */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                {dadosPipelineEtapas.map((etp, idx) => {
                  const isSelected = etapaFilter === etp.etapaKey;
                  return (
                    <div
                      key={etp.etapaKey}
                      onClick={() => setEtapaFilter(isSelected ? null : etp.etapaKey)}
                      className={`cursor-pointer rounded-2xl border p-4 transition-all duration-200 relative overflow-hidden group ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 ring-2 ring-blue-500 shadow-md'
                          : etp.obrasCount > 0
                          ? 'border-slate-200 dark:border-[#1e293b] bg-slate-50/60 dark:bg-[#070c18]/60 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm'
                          : 'border-slate-100 dark:border-slate-800/40 bg-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl transform group-hover:scale-110 transition-transform">{etp.icon}</span>
                        <span
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shadow-sm"
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

                      {/* Barra de porcentagem da etapa no portfólio */}
                      <div className="mt-2.5 mb-2">
                        <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${etp.pct}%`, backgroundColor: etp.fill }}
                          />
                        </div>
                        <span className="text-[9px] font-semibold text-slate-400 mt-0.5 block text-right">
                          {etp.pct}% das obras
                        </span>
                      </div>

                      {/* Lista rápida de obras */}
                      <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/80">
                        {etp.obrasCount > 0 ? (
                          <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                            {etp.obrasNomes.map(nomeObra => (
                              <button
                                key={nomeObra}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProjetoFilter(nomeObra);
                                }}
                                className="w-full text-left text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-blue-500 truncate flex items-center gap-1.5 transition-colors"
                              >
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: etp.fill }} />
                                <span className="truncate">{extractProjectBaseName(nomeObra)}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Nenhuma obra</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SEÇÃO 2: GRÁFICOS DE MONITORAMENTO EXECUTIVO */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Gráfico 1: Termômetro de Rendimento Operacional (Donut) */}
              <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    Rendimento de Campo
                  </h3>
                  <ChartInfoTooltip text="Proporção de apontamentos com rendimento Acima, Dentro do programado, com Atraso ou Paralisados por Chuva nas frentes de trabalho." />
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  {kpisDiretor.totalLogsPeriodo} apontamentos analisados ({periodoFilter})
                </p>

                {kpisDiretor.totalLogsPeriodo > 0 ? (
                  <>
                    <div className="relative h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={dadosDonutRendimento}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={4}
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
                        <span className="text-2xl font-black text-slate-900 dark:text-white">
                          {kpisDiretor.taxaRendimentoBom === null ? '—' : `${kpisDiretor.taxaRendimentoBom}%`}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Eficiência</span>
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
                            {item.value} ({kpisDiretor.totalLogsPeriodo > 0 ? Math.round((item.value / kpisDiretor.totalLogsPeriodo) * 100) : 0}%)
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

              {/* Gráfico 2: Balanço Diário e Eficiência Operacional (Composed Chart) */}
              <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-5 sm:p-6 shadow-sm lg:col-span-2 flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1 gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-500" />
                    Balanço Diário: Produtividade vs. Impedimentos
                  </h3>
                  <div className="flex items-center gap-3 text-[11px] font-semibold flex-wrap">
                    <span className="flex items-center gap-1.5 text-emerald-500">
                      <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> No Ritmo
                    </span>
                    <span className="flex items-center gap-1.5 text-cyan-500">
                      <span className="w-2.5 h-2.5 rounded-xs bg-cyan-500" /> Chuva
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-500">
                      <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" /> Desvio
                    </span>
                    <span className="flex items-center gap-1.5 text-amber-500">
                      <span className="w-3 h-0.5 bg-amber-400" /> Eficiência (%)
                    </span>
                    <ChartInfoTooltip text="Mede o volume diário de apontamentos regulares, paradas por chuva e relatos de atraso nos últimos 14 dias, acompanhado pela linha de taxa de eficiência." />
                  </div>
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Volume diário de frentes de trabalho ativas e taxa de rendimento geral
                </p>

                <div className="flex-1 min-h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dadosTimelineAtividade} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.5} />
                      <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 9, fill: '#f59e0b' }} unit="%" axisLine={false} tickLine={false} />
                      <RTooltip
                        contentStyle={{ background: '#0d1527', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
                        labelStyle={{ color: '#fff' }}
                      />
                      <Bar yAxisId="left" dataKey="noRitmo" name="No Ritmo / Acima" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                      <Bar yAxisId="left" dataKey="chuva" name="Parada por Chuva" stackId="a" fill="#06b6d4" radius={[0, 0, 0, 0]} />
                      <Bar yAxisId="left" dataKey="abaixo" name="Abaixo / Desvios" stackId="a" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="eficienciaPct"
                        name="Eficiência (%)"
                        stroke="#f59e0b"
                        strokeWidth={2.5}
                        dot={{ fill: '#f59e0b', r: 3 }}
                        activeDot={{ r: 5, fill: '#fbbf24' }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100 dark:border-[#1e293b] mt-2">
                  <span>Total de relatos no ciclo: <strong className="text-slate-900 dark:text-white">{dadosTimelineAtividade.reduce((acc, d) => acc + d.registros, 0)}</strong></span>
                  <span className="text-emerald-500 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Frentes ativas em campo
                  </span>
                </div>
              </div>
            </div>

            {/* SEÇÃO 2.1: OS 2 NOVOS GRÁFICOS ESTRATÉGICOS DA DIRETORIA */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* NOVO GRÁFICO 1: CURVA DE RITMO (AVANÇO REAL % VS CONSUMO DO PRAZO %) */}
              <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1 gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Timer className="w-4 h-4 text-indigo-500" />
                    Curva de Ritmo: Avanço Físico vs. Consumo do Prazo
                  </h3>
                  <ChartInfoTooltip text="Compara o % de avanço físico concluído no ciclo das 6 fases contra o % de tempo já consumido do prazo total estimado. Se o tempo consumido for maior que o avanço, a obra está consumindo mais dias do que entregando etapas." />
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Diagnóstico de velocidade: a obra avança mais rápido do que o tempo decorrido?
                </p>

                {dadosProgressoVsTempo.length > 0 ? (
                  <>
                    <div className="flex-1 min-h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={dadosProgressoVsTempo}
                          layout="vertical"
                          margin={{ top: 10, right: 30, left: 20, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} opacity={0.4} />
                          <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis dataKey="nome" type="category" width={110} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                          <RTooltip
                            contentStyle={{ background: '#0d1527', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
                            labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                            formatter={(value, name) => [
                              `${value}%`,
                              name === 'avanco' ? 'Avanço do Ciclo (%)' : 'Tempo Consumido (%)'
                            ]}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="avanco" name="Avanço do Ciclo (%)" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={9} />
                          <Bar dataKey="tempoConsumido" name="Tempo Consumido (%)" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={9} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-100 dark:border-[#1e293b] mt-2">
                      <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {dadosProgressoVsTempo.filter(d => d.diferenca >= 0).length} fazenda(s) no ritmo ideal
                      </span>
                      <span className="flex items-center gap-1.5 text-rose-500 font-bold">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {dadosProgressoVsTempo.filter(d => d.diferenca < 0).length} com consumo de tempo acelerado
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                    Nenhuma obra ativa no filtro atual.
                  </div>
                )}
              </div>

              {/* NOVO GRÁFICO 2: DIAGNÓSTICO DE GARGALOS POR ETAPA (LEAD TIME REAL VS META) */}
              <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1 gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-cyan-500" />
                    Diagnóstico de Gargalos: Dias Reais vs. Meta por Etapa
                  </h3>
                  <ChartInfoTooltip text="Média de dias reais despendidos pelas equipes em cada uma das 6 fases em relação à meta contratual planejada. Permite identificar cirurgicamente qual etapa técnica está gerando maior retenção de cronograma." />
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Lead time das 6 fases • onde a operação gasta mais tempo do que o planejado
                </p>

                <div className="flex-1 min-h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dadosLeadTimeEtapas}
                      margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.4} />
                      <XAxis
                        dataKey="etapa"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                      />
                      <YAxis unit="d" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <RTooltip
                        contentStyle={{ background: '#0d1527', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
                        labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                        formatter={(val, name) => [`${val} dias`, name === 'diasReal' ? 'Média Real' : 'Meta Planejada']}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="diasReal" name="Média Real (Dias)" fill="#06b6d4" radius={[4, 4, 0, 0]} barSize={16}>
                        {dadosLeadTimeEtapas.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.isGargalo ? '#f43f5e' : entry.color} />
                        ))}
                      </Bar>
                      <Bar dataKey="diasMeta" name="Meta Planejada (Dias)" fill="#64748b" radius={[4, 4, 0, 0]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-100 dark:border-[#1e293b] mt-2">
                  {(() => {
                    const maiorGargalo = [...dadosLeadTimeEtapas].sort((a, b) => b.desvio - a.desvio)[0];
                    if (maiorGargalo && maiorGargalo.desvio > 0) {
                      return (
                        <span className="text-rose-500 font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Maior Gargalo: {maiorGargalo.icon} {maiorGargalo.etapa} (+{maiorGargalo.desvio}d acima da meta)
                        </span>
                      );
                    }
                    return (
                      <span className="text-emerald-500 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Todas as etapas dentro ou abaixo do prazo de meta
                      </span>
                    );
                  })()}
                  <span className="text-slate-400">Referência: Ciclo Técnico 6 Fases</span>
                </div>
              </div>

            </div>

            {/* SEÇÃO 3: RAIO-X DAS FAZENDAS (CARDS COM MINI STEPPER DAS 6 ETAPAS) */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-blue-500" />
                    Raio-X das Fazendas e Obras de Irrigação
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#1e293b] text-slate-600 dark:text-slate-400">
                      {obrasExibidas.length} exibida{obrasExibidas.length !== 1 ? 's' : ''} de {obrasCampo.length}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Acompanhamento visual de cada frente com mini-esteira técnica das 6 etapas, metas e fotos
                  </p>
                </div>

                {temFiltroAtivo && (
                  <button
                    onClick={limparTodosFiltros}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#1e293b] text-slate-700 dark:text-slate-300 hover:text-blue-500 text-xs font-bold transition-all self-start sm:self-auto"
                  >
                    <X className="w-3.5 h-3.5" />
                    Limpar Filtros
                  </button>
                )}
              </div>

              {/* Grid de Cards das Fazendas */}
              {obrasExibidas.length === 0 ? (
                <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
                    <Search className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">Nenhuma fazenda encontrada com os filtros atuais</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Tente ajustar a busca por texto ou os filtros de etapa e status.
                  </p>
                  <button
                    onClick={limparTodosFiltros}
                    className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
                  >
                    Ver Todas as Fazendas
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {obrasExibidas.map(obra => {
                    const etapaObj = ETAPAS_CAMPO_ORDEM.find(e => e.key === obra.etapaAtual) || ETAPAS_CAMPO_ORDEM[0];
                    const temFoto = !!obra.ultimoLog?.midiaUrl;

                    return (
                      <div
                        key={obra.nome}
                        className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] hover:border-blue-500/50 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col"
                      >
                        {/* Linha superior com status e versão */}
                        <div className="p-4 border-b border-slate-100 dark:border-[#1e293b] flex items-start justify-between gap-3 bg-slate-50/50 dark:bg-[#0a1020]/40">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-200 dark:bg-[#1e293b] text-slate-800 dark:text-slate-200">
                                {obra.versao}
                              </span>

                              {/* Badge de Saúde com micro-ícone */}
                              {obra.saude === 'excelente' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                                  <TrendingUp className="w-3 h-3" /> Acelerada
                                </span>
                              )}
                              {obra.saude === 'normal' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                  <CheckCircle2 className="w-3 h-3" /> No Ritmo
                                </span>
                              )}
                              {obra.saude === 'alerta' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse">
                                  <AlertTriangle className="w-3 h-3" /> Alerta de Atraso
                                </span>
                              )}
                              {obra.saude === 'chuva' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                                  <CloudRain className="w-3 h-3" /> Chuva / Parada
                                </span>
                              )}

                              {/* Alerta Preventivo de Prazo Final */}
                              {obra.prazoFinalFormatado && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  obra.prazoFinalEstourado
                                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                                    : typeof obra.diasRestantesPrazoFinal === 'number' && obra.diasRestantesPrazoFinal <= 7
                                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                }`}>
                                  <Clock className="w-3 h-3" />
                                  {obra.prazoFinalEstourado
                                    ? `Estourado (+${Math.abs(obra.diasRestantesPrazoFinal ?? 0)}d)`
                                    : typeof obra.diasRestantesPrazoFinal === 'number' && obra.diasRestantesPrazoFinal <= 7
                                    ? `Vence em ${obra.diasRestantesPrazoFinal}d`
                                    : `Prazo: ${obra.prazoFinalFormatado}`}
                                </span>
                              )}
                            </div>

                            <h3 className="font-black text-slate-900 dark:text-white text-base truncate" title={obra.nome}>
                              {extractProjectBaseName(obra.nome)}
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Início: {new Date(`${obra.dataStart}T00:00:00`).toLocaleDateString('pt-BR')} • <strong>Dia {obra.diaAtual}</strong> de execução
                            </p>
                          </div>

                          {/* Botão de abrir diário */}
                          <Link
                            href={`/irrigacao/diario-campo?projeto=${encodeURIComponent(obra.nome)}`}
                            className="p-2 rounded-xl bg-white dark:bg-[#1e293b] text-slate-600 dark:text-slate-300 hover:bg-blue-600 hover:text-white border border-slate-200 dark:border-slate-700 transition-all shrink-0 shadow-xs"
                            title="Abrir Diário de Campo desta obra"
                          >
                            <ArrowUpRight className="w-4 h-4" />
                          </Link>
                        </div>

                        {/* Corpo do Card */}
                        <div className="p-4 space-y-4 flex-1 flex flex-col justify-between">
                          
                          {/* ── NOVO: MINI ESTEIRA DAS 6 ETAPAS TÉCNICAS (VISÃO DO CICLO COMPLETO) ── */}
                          <div>
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                              <span>Ciclo Técnico (Etapa {obra.etapaAtualOrder} de 6)</span>
                              <span className="text-slate-900 dark:text-white font-bold">{etapaObj.label}</span>
                            </div>

                            <div className="grid grid-cols-6 gap-1 bg-slate-100/70 dark:bg-[#070c18] p-1.5 rounded-xl border border-slate-200/60 dark:border-[#1e293b]">
                              {obra.fasesStatusList.map((st) => (
                                <div
                                  key={st.key}
                                  title={`${st.order}. ${st.label}: ${st.status === 'concluida' ? 'Concluída' : st.status === 'atual' ? 'Fase Atual' : 'Pendente'}`}
                                  className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-center transition-all ${
                                    st.status === 'concluida'
                                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                      : st.status === 'atual'
                                      ? 'bg-blue-600 text-white font-bold shadow-xs ring-2 ring-blue-500/30'
                                      : 'text-slate-400 dark:text-slate-600'
                                  }`}
                                >
                                  <span className="text-xs">{st.icon}</span>
                                  <span className="text-[9px] font-black leading-none mt-0.5">
                                    {st.status === 'concluida' ? '✓' : st.order}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Medidor de Meta da Etapa Atual */}
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
                            <div className="h-2 w-full bg-slate-100 dark:bg-[#1e293b] rounded-full overflow-hidden relative">
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
                                  <span>Restam {obra.diasRestantesEtapa} dias de meta da etapa</span>
                                )}
                              </span>
                              <span>{obra.totalLogs} relatos</span>
                            </div>
                          </div>

                          {/* Miniatura do Último Registro & Foto de Campo */}
                          {obra.ultimoLog ? (
                            <div className="rounded-xl p-2.5 bg-slate-50 dark:bg-[#070c18] border border-slate-100 dark:border-[#1e293b] flex items-start gap-3">
                              {temFoto ? (
                                <button
                                  type="button"
                                  onClick={() => setFotoModal(obra.ultimoLog || null)}
                                  className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 group cursor-pointer shadow-xs"
                                  title="Clique para ampliar foto de campo"
                                >
                                  <Image
                                    src={obra.ultimoLog?.midiaUrl || ''}
                                    alt="Foto de Campo"
                                    fill
                                    sizes="56px"
                                    loading="lazy"
                                    className="object-cover transition-transform group-hover:scale-110"
                                  />
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Eye className="w-4 h-4 text-white" />
                                  </div>
                                </button>
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0 text-sm">
                                  {etapaObj.icon}
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                  <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate">
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
                            <div className="text-center py-2.5 text-xs text-slate-400 italic bg-slate-50 dark:bg-[#070c18] rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                              Aguardando primeiro apontamento de diário.
                            </div>
                          )}

                          {/* Rodapé do Card com Ações */}
                          <div className="pt-2 border-t border-slate-100 dark:border-[#1e293b] flex items-center justify-between text-xs">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[170px]" title={obra.responsaveis.join(', ')}>
                              Equipe: <strong>{obra.responsaveis.length > 0 ? obra.responsaveis.slice(0, 2).join(', ') + (obra.responsaveis.length > 2 ? ` +${obra.responsaveis.length - 2}` : '') : 'Não atribuída'}</strong>
                            </span>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => window.open(`/relatorio?projeto=${encodeURIComponent(obra.nome)}`, '_blank')}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-[#1e293b] text-slate-700 dark:text-slate-300 hover:text-blue-500 hover:bg-slate-200 transition-colors"
                              >
                                PDF
                              </button>
                              <Link
                                href={`/irrigacao/diario-campo?projeto=${encodeURIComponent(obra.nome)}`}
                                className="px-3 py-1 rounded-lg text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-xs"
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
              )}
            </div>

            {/* SEÇÃO 4: PROJETOS POR AGRICULTOR */}
            <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-5 sm:p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-emerald-500" />
                    Projetos em Atividades por Agricultor
                  </h3>
                  <p className="text-xs text-slate-400">
                    Obras vinculadas a cada agricultor com login ativo (como criador ou responsável de campo)
                  </p>
                </div>
                <span className="text-[11px] px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 font-bold self-start sm:self-auto">
                  🌱 Logins Ativos
                </span>
              </div>

              {projetosPorAgricultor.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 italic bg-slate-50 dark:bg-[#070c18] rounded-xl border border-slate-100 dark:border-[#1e293b]">
                  Nenhum projeto vinculado a agricultores no momento.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {projetosPorAgricultor.map(colab => {
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
                        className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-[#070c18] border border-slate-100 dark:border-[#1e293b] hover:border-indigo-500/30 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-black text-xs flex items-center justify-center shrink-0 border border-emerald-500/20">
                            {iniciais}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {colab.nome}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {colab.comoCriador > 0 && colab.comoResponsavel > 0 ? (
                                <span className="text-emerald-500 font-medium">Criador + Responsável</span>
                              ) : colab.comoCriador > 0 ? (
                                <span className="text-blue-500 font-medium">Criador ({colab.comoCriador})</span>
                              ) : (
                                <span className="text-indigo-500 font-medium">Responsável ({colab.comoResponsavel})</span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0 pl-3 border-l border-slate-200/60 dark:border-slate-800">
                          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                            {colab.totalProjetos}
                          </span>
                          <span className="text-[10px] text-slate-400 block -mt-1">
                            {colab.totalProjetos === 1 ? 'projeto' : 'projetos'}
                          </span>
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
              <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Conclusão de Fases</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    {dadosCronogramaFases.taxaGeral}%
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">
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

              <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Atenção & Prazos</span>
                  <AlertTriangle className={`w-4 h-4 ${dadosCronogramaFases.obrasComAtraso > 0 ? 'text-rose-500 animate-pulse' : 'text-slate-400'}`} />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className={`text-2xl sm:text-3xl font-black ${dadosCronogramaFases.obrasComAtraso > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                    {dadosCronogramaFases.obrasComAtraso}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">
                    de {dadosCronogramaFases.totalObras} obra(s) com atraso
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  {dadosCronogramaFases.obrasComAtraso > 0
                    ? '⚠️ Existem fases estouradas que exigem alinhamento'
                    : '✅ Todas as frentes ativas estão dentro da meta'}
                </p>
              </div>

              <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-5 shadow-sm sm:col-span-2 lg:col-span-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ciclo Técnico</span>
                  <Layers className="w-4 h-4 text-blue-500" />
                </div>
                <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                  6 Fases Oficiais
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Valetas • Montagem Campo • Casa de Bombas • Elétrica • Testes • Entrega
                </p>
              </div>
            </div>

            {/* Gráfico de Barras por Fase Oficial da Irrigação */}
            <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-5 sm:p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mb-1">
                    Status de Execução das 6 Fases Oficiais
                  </h3>
                  <p className="text-xs text-slate-400">
                    Acompanhamento consolidado de conclusão e gargalos técnicos em todas as fazendas
                  </p>
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 dark:bg-[#1e293b] text-slate-600 dark:text-slate-300 self-start sm:self-auto">
                  {dadosCronogramaFases.totalObras} Obra(s) Cadastrada(s)
                </span>
              </div>

              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosCronogramaFases.porFase} margin={{ top: 10, right: 20, left: -20, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.5} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <RTooltip
                      contentStyle={{ background: '#0d1527', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="concluidas" name="Concluídas"   fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="ativas"     name="No Prazo"     fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="atrasadas"  name="Atrasadas"    fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="naoIniciadas" name="Não iniciadas" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Matriz Executiva de Prazos por Obra com Ordenação Interativa */}
            <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 md:p-5 border-b border-slate-100 dark:border-[#1e293b] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-[#0a1020]/40">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Matriz de Prazos e Fases por Fazenda
                  </h3>
                  <p className="text-xs text-slate-400">
                    Visão consolidada das 6 fases técnicas e do prazo final de cada fazenda
                  </p>
                </div>

                {/* Controles de ordenação */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ordenar:</span>
                  <div className="flex items-center bg-slate-100 dark:bg-[#111c33] rounded-xl p-1 text-xs">
                    <button
                      onClick={() => setOrdemCronograma('criticos')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                        ordemCronograma === 'criticos' ? 'bg-white dark:bg-[#1e293b] text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500'
                      }`}
                    >
                      Mais Críticos
                    </button>
                    <button
                      onClick={() => setOrdemCronograma('progresso')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                        ordemCronograma === 'progresso' ? 'bg-white dark:bg-[#1e293b] text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500'
                      }`}
                    >
                      Progresso
                    </button>
                    <button
                      onClick={() => setOrdemCronograma('nome')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                        ordemCronograma === 'nome' ? 'bg-white dark:bg-[#1e293b] text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500'
                      }`}
                    >
                      Nome
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 dark:bg-[#0a1020]/60 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-[#1e293b]">
                      <th className="py-3 px-4">Obra / Fazenda</th>
                      <th className="py-3 px-3">Prazo Final da Obra</th>
                      <th className="py-3 px-3 text-center">Progresso</th>
                      {ETAPAS_CAMPO_ORDEM.map(e => (
                        <th key={e.key} className="py-3 px-2 text-center" title={e.desc}>
                          {e.icon} {e.label}
                        </th>
                      ))}
                      <th className="py-3 px-4 text-right">Ação</th>
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
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-slate-100 dark:bg-[#16203a] text-slate-600 dark:text-slate-400 shrink-0">
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
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white transition-all font-bold text-[11px]"
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
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in-50"
            onClick={() => setFotoModal(null)}
          >
            <div
              className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl animate-in zoom-in-95"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-slate-100 dark:border-[#1e293b] flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                    Registro Fotográfico • {fotoModal.projetoCliente}
                  </h4>
                  <p className="text-xs text-slate-400">
                    {new Date(`${fotoModal.data}T00:00:00`).toLocaleDateString('pt-BR')} • Técnico: {fotoModal.responsavel}
                  </p>
                </div>
                <button
                  onClick={() => setFotoModal(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1e293b] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="relative max-h-[70vh] bg-black flex items-center justify-center overflow-hidden">
                <img
                  src={fotoModal.midiaUrl}
                  alt="Foto de Campo"
                  loading="lazy"
                  decoding="async"
                  className="max-h-[70vh] w-auto object-contain"
                />
              </div>

              <div className="p-4 bg-slate-50 dark:bg-[#070c18]">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                    {fotoModal.atividade}
                  </span>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Status: {fotoModal.status}
                  </span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 italic">
                  &ldquo;{fotoModal.observacoes || 'Sem observações adicionais gravadas.'}&rdquo;
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
