"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import { useToast } from '@/components/Toast';
import { 
  ChevronRight, 
  Calendar, 
  Plus, 
  Filter, 
  Search,
  X,
  User,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  Edit2,
  Trash2,
  Briefcase,
  History,
  BarChart3,
  Layers,
  CheckCircle2,
  Activity,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import { FaseAcao, StatusType, ActionType } from './mockFases';

// ── Helpers para controle de versões de projetos (V0, V1, V2, V3...) ────────
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

// Ordem dos status como etapas de progresso
const STATUS_ORDEM: StatusType[] = [
  'Dentro do programado',
  'Comercial/Ajustes',
  'Aguardando material',
  'Problema técnico',
  'Concluído',
];

// Abreviações para caber na barra
const STATUS_LABEL: Record<StatusType, string> = {
  'Dentro do programado': 'Programado',
  'Comercial/Ajustes':    'Comercial',
  'Problema técnico':     'Problema',
  'Aguardando material':  'Aguardando',
  'Concluído':            'Concluído',
};

// Cores por status — hex para não ser purgado pelo Tailwind
const STATUS_COLOR: Record<StatusType, { hex: string; label: string }> = {
  'Dentro do programado': { hex: '#10b981', label: 'text-emerald-400' },
  'Comercial/Ajustes':    { hex: '#f59e0b', label: 'text-amber-400'   },
  'Problema técnico':     { hex: '#f43f5e', label: 'text-rose-400'    },
  'Aguardando material':  { hex: '#eab308', label: 'text-yellow-400'  },
  'Concluído':            { hex: '#3b82f6', label: 'text-blue-400'    },
};

// Ordem das fases como pipeline
const FASES_ORDEM_BARRA = [
  '01 - Estudo preliminar',
  '02 - Aprovação do cliente ou retorno',
  '03 - Projeto executivo',
  '04 - Compra',
  '05 - Execução',
];

const FASES_COR = [
  '#6366f1', // 01 indigo
  '#f59e0b', // 02 amber
  '#06b6d4', // 03 cyan
  '#3b82f6', // 04 blue
  '#10b981', // 05 emerald
];

const FASES_LABEL: Record<string, string> = {
  '01 - Estudo preliminar':             'Estudo',
  '02 - Aprovação do cliente ou retorno': 'Aprovação',
  '03 - Projeto executivo':             'Projeto',
  '04 - Compra':                        'Compra',
  '05 - Execução':                      'Execução',
};

function FasePipelineBar({ gabarito }: { gabarito: string }) {
  let currentIdx = FASES_ORDEM_BARRA.indexOf(gabarito);
  if (currentIdx === -1) {
    const l = (gabarito || '').toLowerCase();
    if (l.includes('estudo')) currentIdx = 0;
    else if (l.includes('aprova') || l.includes('retorno') || l.includes('comercial') || l.includes('análise')) currentIdx = 1;
    else if (l.includes('executivo') || l.includes('projeto')) currentIdx = 2;
    else if (l.includes('compra')) currentIdx = 3;
    else if (l.includes('execu') || l.includes('campo') || l.includes('instala')) currentIdx = 4;
  }

  return (
    <div className="mb-2.5 w-full">
      {/* Segmentos das fases - MAIOR em destaque */}
      <div className="flex items-center gap-1.5 mb-1.5">
        {FASES_ORDEM_BARRA.map((fase, idx) => {
          const isCurrent = idx === currentIdx;
          const cor = FASES_COR[idx];
          return (
            <div
              key={fase}
              title={fase}
              className="relative flex-1 rounded-full transition-all duration-300"
              style={{
                height: isCurrent ? '12px' : '8px',
                backgroundColor: isCurrent ? cor : 'rgba(148,163,184,0.18)',
                boxShadow: isCurrent ? `0 0 10px ${cor}88` : 'none',
              }}
            >
              {isCurrent && (
                <span
                  className="absolute -top-[3.5px] left-1/2 -translate-x-1/2 w-4.5 h-4.5 rounded-full border-2 border-white dark:border-[#0d1527] shadow"
                  style={{ backgroundColor: cor, boxShadow: `0 0 0 3px ${cor}44` }}
                />
              )}
            </div>
          );
        })}
      </div>
      {/* Nomes das fases */}
      <div className="flex gap-1">
        {FASES_ORDEM_BARRA.map((fase, idx) => {
          const isCurrent = idx === currentIdx;
          return (
            <div key={fase} className="flex-1 text-center" title={fase}>
              <span
                className={`text-[9.5px] leading-tight block truncate ${
                  isCurrent ? 'font-bold' : 'text-slate-400 dark:text-slate-500'
                }`}
                style={{ color: isCurrent ? FASES_COR[idx] : undefined }}
              >
                {FASES_LABEL[fase]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FaseProgressBar({ status }: { status: StatusType }) {
  const currentIdx = STATUS_ORDEM.indexOf(status);
  const corData = STATUS_COLOR[status] ?? STATUS_COLOR['Dentro do programado'];
  const { hex } = corData;

  return (
    <div className="w-full">
      {/* Segmentos de status - MAIS COMPACTO / MENOR que o de fase */}
      <div className="flex items-center gap-1 mb-1">
        {STATUS_ORDEM.map((s, idx) => {
          const isCurrent = idx === currentIdx;
          const corStatus = STATUS_COLOR[s]?.hex ?? hex;
          return (
            <div
              key={s}
              title={s}
              className="relative flex-1 rounded-full transition-all duration-300"
              style={{
                height: isCurrent ? '7px' : '4px',
                backgroundColor: isCurrent ? corStatus : 'rgba(148,163,184,0.14)',
                boxShadow: isCurrent ? `0 0 6px ${corStatus}66` : 'none',
              }}
            >
              {isCurrent && (
                <span
                  className="absolute -top-[2.5px] left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white dark:border-[#0d1527] shadow"
                  style={{ backgroundColor: corStatus, boxShadow: `0 0 0 2px ${corStatus}33` }}
                />
              )}
            </div>
          );
        })}
      </div>
      {/* Nomes dos status */}
      <div className="flex gap-1">
        {STATUS_ORDEM.map((s, idx) => {
          const isCurrent = idx === currentIdx;
          const corStatus = STATUS_COLOR[s]?.hex ?? hex;
          return (
            <div key={s} className="flex-1 text-center" title={s}>
              <span
                className={`text-[8.5px] leading-tight block truncate transition-all ${
                  isCurrent ? 'font-semibold' : 'text-slate-400/80 dark:text-slate-500/80'
                }`}
                style={{ color: isCurrent ? corStatus : undefined }}
              >
                {STATUS_LABEL[s]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, icon, color, alert }: {
  label: string; value: number | string; sub: string; icon: React.ReactNode; color: string; alert?: boolean;
}) {
  return (
    <div className={`bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-4 md:p-5 border-l-4 ${color} shadow-md shadow-black/5 transition-all duration-300 hover:-translate-y-0.5`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        {icon}
      </div>
      <p className={`text-2xl md:text-3xl font-bold ${alert ? 'text-rose-500 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  );
}

const calculateDaysDifference = (targetDateStr: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(`${targetDateStr}T00:00:00Z`);
  const diffTime = targetDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export default function ExecucaoProjetosPage() {
  const { success, error: toastError } = useToast();
  const [fases, setFases] = useState<FaseAcao[]>([]);
  const [todosResponsaveis, setTodosResponsaveis] = useState<string[]>([]);
  const [totalLogsHoje, setTotalLogsHoje] = useState(0);
  const [loading, setLoading] = useState(true);

  // ── Carrega fases, responsáveis e logs do banco ───────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fasesRes, respRes, logsRes] = await Promise.all([
        fetch('/api/fases'),
        fetch('/api/responsaveis'),
        fetch('/api/diario-logs'),
      ]);
      if (fasesRes.ok) {
        const d = await fasesRes.json();
        setFases(d.fases ?? []);
      }
      if (respRes.ok) {
        const d = await respRes.json();
        setTodosResponsaveis((d.responsaveis ?? []).map((r: any) => r.nome));
      }
      if (logsRes.ok) {
        const d = await logsRes.json();
        const hojeLocal = new Date().toISOString().split('T')[0];
        const countHoje = (d.logs ?? []).filter((l: any) => l.data === hojeLocal).length;
        setTotalLogsHoje(countHoje);
      }
    } catch (e) {
      console.error('[execucao] Erro ao carregar dados:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Auto-refresh: polling 30s + recarga ao focar/visibilidade ─────────
  useEffect(() => {
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
  }, [loadData, loading]);

  // ── KPIs calculados ────────────────────────────────────────────────────────
  const kpiData = useMemo(() => {
    const naoDeleted = fases.filter(f => !f.isDeleted);
    const ativas = naoDeleted.filter(f => f.status !== 'Concluído');
    const concluidas = naoDeleted.filter(f => f.status === 'Concluído');
    const atrasadas = ativas.filter(f =>
      new Date(`${f.prazoLimite}T00:00:00Z`).getTime() < new Date().setHours(0, 0, 0, 0)
    );
    return {
      ativas: ativas.length,
      atrasadas: atrasadas.length,
      concluidas: concluidas.length,
    };
  }, [fases]);

  // ── Modais / state ────────────────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [novoGabarito, setNovoGabarito] = useState<string>('01 - Estudo preliminar');
  const [novoProjetoCliente, setNovoProjetoCliente] = useState('');
  const [novoResponsavel, setNovoResponsavel] = useState('');
  const [novaAcao, setNovaAcao] = useState<ActionType>('Cotar');
  const [novoPrazo, setNovoPrazo] = useState('');
  const [novoStatus, setNovoStatus] = useState<StatusType>('Dentro do programado');
  const [novaObservacao, setNovaObservacao] = useState('');
  const [faseToDelete, setFaseToDelete] = useState<FaseAcao | null>(null);
  // Ao abrir o modal de deletar, calcula todas as fases do mesmo projeto
  const fasesDoProjetoParaDeletar = useMemo(() => {
    if (!faseToDelete) return [];
    const proj = faseToDelete.projetoCliente?.trim() || '';
    if (!proj) return [faseToDelete]; // sem projeto: só essa fase
    return fases.filter(f => !f.isDeleted && (f.projetoCliente?.trim() || '') === proj);
  }, [faseToDelete, fases]);
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [filterBusca, setFilterBusca] = useState<string>('');
  const [filterProjeto, setFilterProjeto] = useState<string>('Todos');
  const [activeTab, setActiveTab] = useState<'Em Andamento' | 'Concluído'>('Em Andamento');
  const [savingNovo, setSavingNovo] = useState(false);

  // Edit state
  const [editingFase, setEditingFase] = useState<FaseAcao | null>(null);
  const [editGabarito, setEditGabarito] = useState('');
  const [editProjetoCliente, setEditProjetoCliente] = useState('');
  const [editResponsavel, setEditResponsavel] = useState('');
  const [editPrazoLimite, setEditPrazoLimite] = useState('');
  const [editStatus, setEditStatus] = useState<string>('Dentro do programado');
  const [savingEdit, setSavingEdit] = useState(false);
  const [historico, setHistorico] = useState<{id:string;campo:string;valorNovo:string;usuario:string;criadoEm:string}[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  const openEditModal = (fase: FaseAcao) => {
    setEditingFase(fase);
    setEditGabarito(fase.gabarito);
    setEditProjetoCliente(fase.projetoCliente ?? '');
    setEditResponsavel(fase.responsavel);
    setEditPrazoLimite(fase.prazoLimite);
    setEditStatus(fase.status);
    // Carrega histórico
    setHistorico([]);
    setLoadingHistorico(true);
    fetch(`/api/historico-fases?faseId=${fase.id}`)
      .then(r => r.ok ? r.json() : { historico: [] })
      .then(d => setHistorico(d.historico ?? []))
      .catch(() => setHistorico([]))
      .finally(() => setLoadingHistorico(false));
  };

  // ── Salvar edição ──────────────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    if (!editingFase) return;
    setSavingEdit(true);
    try {
      // Verifica se houve retorno da Fase 2 (Aprovação / Retorno) para Fase 1 (Estudo)
      const eraFase2 = editingFase.gabarito.includes('02') || 
        editingFase.gabarito.toLowerCase().includes('aprova') || 
        editingFase.gabarito.toLowerCase().includes('retorno');
      const vaiPraFase1 = editGabarito.includes('01') || 
        editGabarito.toLowerCase().includes('estudo');
      const isRetornoRollback = eraFase2 && vaiPraFase1;

      let projetoClienteFinal = editProjetoCliente;
      if (isRetornoRollback) {
        projetoClienteFinal = incrementProjectVersion(editProjetoCliente || '');
      }

      // Auto-registra responsável novo
      if (editResponsavel && editResponsavel !== 'Não atribuído' && !todosResponsaveis.includes(editResponsavel)) {
        const r = await fetch('/api/responsaveis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: editResponsavel, cargo: 'Atribuição Automática', origem: 'MANUAL' }),
        });
        if (r.ok) {
          setTodosResponsaveis(prev => [...prev, editResponsavel]);
        }
      }

      const res = await fetch('/api/fases', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingFase.id,
          gabarito: editGabarito,
          projetoCliente: projetoClienteFinal,
          responsavel: editResponsavel,
          prazoLimite: editPrazoLimite,
          status: isRetornoRollback ? 'Comercial/Ajustes' : editStatus,
          acao: isRetornoRollback ? 'Revisar' : undefined,
          observacoes: isRetornoRollback 
            ? (editingFase.observacoes ? `${editingFase.observacoes} (Retorno -> ${getProjectVersion(projetoClienteFinal)})` : `Retorno do cliente -> ${getProjectVersion(projetoClienteFinal)}`)
            : undefined,
        }),
      });
      if (res.ok) {
        const { fase } = await res.json();
        setFases(prev => prev.map(f => f.id === fase.id ? fase : f));
        if (isRetornoRollback) {
          success(`Retorno registrado! Projeto avançou para ${getProjectVersion(projetoClienteFinal)}.`);
        } else {
          success('Fase atualizada com sucesso!');
        }
      } else {
        toastError('Erro ao salvar as alterações.');
      }
    } catch (e) {
      console.error('[execucao] Erro ao salvar edição:', e);
      toastError('Erro ao salvar as alterações.');
    } finally {
      setSavingEdit(false);
      setEditingFase(null);
    }
  };

  // ── Salvar nova fase ───────────────────────────────────────────────────────
  const handleSaveNovo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoPrazo) return;
    setSavingNovo(true);
    try {
      const res = await fetch('/api/fases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gabarito: novoGabarito,
          projetoCliente: novoProjetoCliente,
          responsavel: novoResponsavel || 'Não atribuído',
          acao: novaAcao,
          prazoLimite: novoPrazo,
          status: novoStatus,
          observacoes: novaObservacao,
        }),
      });
      if (res.ok) {
        const { fase } = await res.json();
        setFases(prev => [fase, ...prev]);
        success('Nova ação criada com sucesso!');
      } else {
        toastError('Erro ao criar a ação.');
      }
    } catch (e) {
      console.error('[execucao] Erro ao criar fase:', e);
      toastError('Erro ao criar a ação.');
    } finally {
      setSavingNovo(false);
      setNovoGabarito('01 - Estudo preliminar');
      setNovoProjetoCliente('');
      setNovoResponsavel('');
      setNovaAcao('Cotar');
      setNovoPrazo('');
      setNovoStatus('Dentro do programado');
      setNovaObservacao('');
      setIsModalOpen(false);
    }
  };

  // ── Mover projeto inteiro para lixeira (soft delete em todas as fases) ──────
  const handleTrashFase = async () => {
    if (!faseToDelete || fasesDoProjetoParaDeletar.length === 0) return;
    try {
      const resultados = await Promise.all(
        fasesDoProjetoParaDeletar.map(f =>
          fetch('/api/fases', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: f.id, isDeleted: true }),
          })
        )
      );
      const todasOk = resultados.every(r => r.ok);
      if (todasOk) {
        const ids = fasesDoProjetoParaDeletar.map(f => f.id);
        setFases(prev => prev.map(f => ids.includes(f.id) ? { ...f, isDeleted: true } : f));
        const nomeProjeto = faseToDelete.projetoCliente?.trim() || '';
        success(nomeProjeto
          ? `Projeto "${nomeProjeto}" movido para a lixeira.`
          : 'Ação movida para a lixeira.'
        );
      } else {
        toastError('Erro ao mover para a lixeira.');
      }
    } catch (e) {
      console.error('[execucao] Erro ao mover para lixeira:', e);
      toastError('Erro ao mover para a lixeira.');
    } finally {
      setFaseToDelete(null);
    }
  };

  const filteredFases = useMemo(() => fases.filter(f => {
    const matchTab     = activeTab === 'Em Andamento' ? (f.status !== 'Concluído' && !f.isDeleted) : (f.status === 'Concluído' && !f.isDeleted);
    const matchStatus  = filterStatus === 'Todos' || f.status === filterStatus;
    const matchBusca   = filterBusca === '' || 
      (f.projetoCliente ?? '').toLowerCase().includes(filterBusca.toLowerCase()) ||
      f.gabarito.toLowerCase().includes(filterBusca.toLowerCase()) ||
      f.acao.toLowerCase().includes(filterBusca.toLowerCase());
    const matchProjeto = filterProjeto === 'Todos' || (f.projetoCliente ?? '') === filterProjeto;
    return matchTab && matchStatus && matchBusca && matchProjeto;
  }), [fases, activeTab, filterStatus, filterBusca, filterProjeto]);

  // Lista única de projetos para o select de filtro
  const projetosUnicos = useMemo(() => {
    const set = new Set(fases.filter(f => !f.isDeleted && f.projetoCliente && f.projetoCliente.trim() !== '').map(f => f.projetoCliente as string));
    return Array.from(set).sort();
  }, [fases]);

  // ── Paginação ──────────────────────────────────────────────────────────────
  const PAGE_SIZE = 15;
  const [currentPage, setCurrentPage] = useState(1);

  // Reset para página 1 quando filtros mudam
  const prevFilters = React.useRef({ activeTab, filterStatus, filterBusca, filterProjeto });
  useEffect(() => {
    const f = prevFilters.current;
    if (f.activeTab !== activeTab || f.filterStatus !== filterStatus || f.filterBusca !== filterBusca || f.filterProjeto !== filterProjeto) {
      setCurrentPage(1);
      prevFilters.current = { activeTab, filterStatus, filterBusca, filterProjeto };
    }
  }, [activeTab, filterStatus, filterBusca, filterProjeto]);

  const totalPages   = Math.max(1, Math.ceil(filteredFases.length / PAGE_SIZE));
  const pagedFases   = useMemo(() => filteredFases.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [filteredFases, currentPage]);

  const getStatusColor = (status: StatusType) => {
    switch(status) {
      case 'Dentro do programado': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Problema técnico':     return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'Aguardando material':  return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'Comercial/Ajustes':    return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'Concluído':            return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default:                     return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const getActionBadge = (acao: ActionType) => (
    <span className="px-2 py-1 text-xs font-medium bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded border border-slate-300 dark:border-slate-700">
      {acao}
    </span>
  );

  const renderDaysDiffBadge = (prazo: string, status: StatusType) => {
    if (status === 'Concluído') return <span className="text-slate-500 text-sm">-</span>;
    const diff = calculateDaysDifference(prazo);
    return diff >= 0 ? (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <Clock className="w-3.5 h-3.5" />+{diff} dias no prazo
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
        <AlertTriangle className="w-3.5 h-3.5" />{Math.abs(diff)} dias negativos (Atrasado)
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070c18] text-slate-600 dark:text-slate-300 p-4 md:p-6 lg:p-8 font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400 mb-2">
            <span>Portal</span>
            <ChevronRight className="w-4 h-4" />
            <span>Irrigação</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-blue-600 dark:text-blue-400 font-medium">Execução de Projetos</span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Painel Operacional</h1>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <LogoutButton />
          <Link href="/irrigacao/lixeira" className="p-3 rounded-full border bg-white dark:bg-[#0d1527] border-slate-200 dark:border-[#1e293b] text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors shadow-sm" title="Lixeira">
            <Trash2 className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3 bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] p-2 rounded-lg">
            <Calendar className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            <span className="text-sm font-medium">Projeto Ativo: Terra Café</span>
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Ações Ativas"    value={kpiData.ativas}     sub="em andamento"       icon={<Layers        className="w-5 h-5 text-blue-400"    />} color="border-l-blue-500" />
        <KpiCard label="Atrasadas"       value={kpiData.atrasadas}  sub="fora do prazo"      icon={<AlertTriangle className="w-5 h-5 text-rose-400"    />} color="border-l-rose-500" alert={kpiData.atrasadas > 0} />
        <KpiCard label="Concluídas"      value={kpiData.concluidas} sub="finalizadas"        icon={<CheckCircle2  className="w-5 h-5 text-emerald-400" />} color="border-l-emerald-500" />
        <KpiCard label="Registros Hoje"  value={totalLogsHoje}      sub="no diário de campo" icon={<Activity      className="w-5 h-5 text-amber-400"   />} color="border-l-amber-500" />
      </div>

      {/* TABS */}
      <div className="flex items-center gap-2 mb-4 bg-white dark:bg-[#0d1527] p-1.5 rounded-lg border border-slate-200 dark:border-[#1e293b] w-fit">
        <button onClick={() => setActiveTab('Em Andamento')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'Em Andamento' ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#111a30]'}`}>
          Em Andamento
        </button>
        <button onClick={() => setActiveTab('Concluído')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'Concluído' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#111a30]'}`}>
          Concluídos
        </button>
      </div>

      {/* FILTERS & ACTIONS */}
      <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-t-xl p-4 flex items-center justify-between gap-3 overflow-x-auto">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="relative w-48">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input type="text" placeholder="Buscar projeto ou fase..." value={filterBusca} onChange={(e) => setFilterBusca(e.target.value)} className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors" />
          </div>
          <div className="relative">
            <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg pl-9 pr-8 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 appearance-none transition-colors cursor-pointer whitespace-nowrap">
              <option value="Todos">Todos os Status</option>
              <option value="Dentro do programado">Dentro do programado</option>
              <option value="Comercial/Ajustes">Comercial/Ajustes</option>
              <option value="Aguardando material">Aguardando material</option>
              <option value="Problema técnico">Problema técnico</option>
              <option value="Concluído">Concluído</option>
            </select>
          </div>
          {projetosUnicos.length > 0 && (
            <div className="relative">
              <Briefcase className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <select value={filterProjeto} onChange={(e) => setFilterProjeto(e.target.value)} className="bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg pl-9 pr-8 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 appearance-none transition-colors cursor-pointer whitespace-nowrap">
                <option value="Todos">Todos os Projetos</option>
                {projetosUnicos.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/admin/dashboard" className="flex items-center justify-center gap-1.5 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap">
            <BarChart3 className="w-4 h-4" />Dashboards
          </Link>
          <Link href="/irrigacao/responsaveis" className="flex items-center justify-center gap-1.5 bg-slate-100 dark:bg-[#111a30] hover:bg-slate-200 dark:hover:bg-[#1e293b] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#1e293b] px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap">
            <User className="w-4 h-4" />Responsáveis
          </Link>
          <Link href="/irrigacao/diario-campo" className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-sm font-medium transition-all shadow-lg shadow-blue-900/20 whitespace-nowrap">
            <FileText className="w-4 h-4" />Diário de Campo
          </Link>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] border-t-0 rounded-b-xl overflow-x-auto shadow-xl shadow-black/30">
        <table className="w-full min-w-[1000px] text-sm text-left">
          <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-[#0b1329] border-b border-slate-200 dark:border-[#1e293b]">
            <tr>
              <th className="px-6 py-4 font-medium">Gabarito / Fase</th>
              <th className="px-6 py-4 font-medium">Projeto / Cliente</th>
              {/* <th className="px-6 py-4 font-medium">Ação</th> */}
              <th className="px-6 py-4 font-medium">Prazo Limite</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium">Contagem (Dias)</th>
              <th className="px-6 py-4 font-medium text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-[#1e293b]">
            {loading && (
              <>
                {[...Array(6)].map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-5">
                      <div className="space-y-2">
                        <div className="animate-pulse h-2 bg-slate-200 dark:bg-[#1e293b] rounded w-32" />
                        <div className="animate-pulse h-1.5 bg-slate-200 dark:bg-[#1e293b] rounded w-40 mt-3" />
                        <div className="animate-pulse h-1 bg-slate-200 dark:bg-[#1e293b] rounded w-40" />
                      </div>
                    </td>
                    <td className="px-6 py-5"><div className="animate-pulse h-3 bg-slate-200 dark:bg-[#1e293b] rounded w-28" /></td>
                    {/* <td className="px-6 py-5"><div className="animate-pulse h-3 bg-slate-200 dark:bg-[#1e293b] rounded w-20" /></td> */}
                    <td className="px-6 py-5"><div className="animate-pulse h-6 bg-slate-200 dark:bg-[#1e293b] rounded-full w-24" /></td>
                    <td className="px-6 py-5"><div className="animate-pulse h-6 bg-slate-200 dark:bg-[#1e293b] rounded-full w-28" /></td>
                    <td className="px-6 py-5"><div className="animate-pulse h-6 bg-slate-200 dark:bg-[#1e293b] rounded-full w-20" /></td>
                    <td className="px-6 py-5">
                      <div className="flex gap-1 justify-center">
                        <div className="animate-pulse h-8 w-8 bg-slate-200 dark:bg-[#1e293b] rounded-lg" />
                        <div className="animate-pulse h-8 w-8 bg-slate-200 dark:bg-[#1e293b] rounded-lg" />
                      </div>
                    </td>
                  </tr>
                ))}
              </>
            )}
            {!loading && pagedFases.map((fase) => (
              <tr key={fase.id} className="hover:bg-slate-100 dark:hover:bg-[#111a30] transition-colors">
                <td className="px-6 py-4 font-medium text-slate-900 dark:text-white min-w-[260px] max-w-[290px]" title={fase.gabarito}>
                  <FasePipelineBar gabarito={fase.gabarito} />
                  <FaseProgressBar status={fase.status} />
                  {fase.observacoes && <div className="text-xs text-slate-500 mt-1 font-normal truncate" title={fase.observacoes}>Obs: {fase.observacoes}</div>}
                </td>
                <td className="px-6 py-4 text-slate-600 dark:text-slate-300 max-w-[200px]">
                  {fase.projetoCliente ? (
                    <div className="flex items-center gap-1.5">
                      <span className="truncate block font-medium" title={fase.projetoCliente}>
                        {extractProjectBaseName(fase.projetoCliente)}
                      </span>
                      <span 
                        title={`Versão: ${getProjectVersion(fase.projetoCliente)}`}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${
                          getProjectVersion(fase.projetoCliente) === 'V0'
                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {getProjectVersion(fase.projetoCliente)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-400 italic text-xs">—</span>
                  )}
                </td>
                {/* <td className="px-6 py-4">{getActionBadge(fase.acao)}</td> */}
                <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                  {new Date(`${fase.prazoLimite}T00:00:00Z`).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(fase.status)}`}>
                    {fase.status}
                  </span>
                </td>
                <td className="px-6 py-4">{renderDaysDiffBadge(fase.prazoLimite, fase.status)}</td>
                <td className="px-6 py-4 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => openEditModal(fase)} className="p-3 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#1e293b] transition-colors" title="Editar">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setFaseToDelete(fase)} className="p-3 rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors" title={fase.projetoCliente?.trim() ? 'Mover Projeto para Lixeira' : 'Mover para Lixeira'}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filteredFases.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">Nenhuma ação encontrada para os filtros aplicados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINAÇÃO */}
      {filteredFases.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 px-1">
          <span className="text-xs text-slate-400">
            Mostrando {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredFases.length)}–{Math.min(currentPage * PAGE_SIZE, filteredFases.length)} de {filteredFases.length} ações
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-2 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#111a30] border border-slate-200 dark:border-[#1e293b] text-slate-500 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-[#1e293b] transition-all"
            >«</button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#111a30] border border-slate-200 dark:border-[#1e293b] text-slate-500 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-[#1e293b] transition-all"
            >Anterior</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .reduce<(number | '...')[]>((acc, p, i, arr) => {
                if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === '...'
                  ? <span key={`e${i}`} className="px-2 text-slate-400 text-xs">…</span>
                  : <button
                      key={p}
                      onClick={() => setCurrentPage(p as number)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${currentPage === p ? 'bg-blue-600 border-blue-600 text-white shadow' : 'bg-slate-100 dark:bg-[#111a30] border-slate-200 dark:border-[#1e293b] text-slate-500 hover:bg-slate-200 dark:hover:bg-[#1e293b]'}`}
                    >{p}</button>
              )}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#111a30] border border-slate-200 dark:border-[#1e293b] text-slate-500 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-[#1e293b] transition-all"
            >Próxima</button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-2 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-[#111a30] border border-slate-200 dark:border-[#1e293b] text-slate-500 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-[#1e293b] transition-all"
            >»</button>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingFase && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329]">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Editar Fase</h3>
              <button onClick={() => setEditingFase(null)} className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-[#1e293b] text-slate-500 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Fase (Gabarito)</label>
                <select value={editGabarito} onChange={(e) => setEditGabarito(e.target.value)} className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors">
                  <option value="01 - Estudo preliminar">01 - Estudo preliminar</option>
                  <option value="02 - Aprovação do cliente ou retorno">02 - Aprovação do cliente ou retorno</option>
                  <option value="03 - Projeto executivo">03 - Projeto executivo</option>
                  <option value="04 - Compra">04 - Compra</option>
                  <option value="05 - Execução">05 - Execução</option>
                </select>
              </div>

              {/* Aviso de Retorno do Cliente (V0 -> V1 -> V2...) */}
              {editingFase && (
                editingFase.gabarito.includes('02') || 
                editingFase.gabarito.toLowerCase().includes('aprova') || 
                editingFase.gabarito.toLowerCase().includes('retorno')
              ) && (
                editGabarito.includes('01') || 
                editGabarito.toLowerCase().includes('estudo')
              ) && (
                <div className="p-3.5 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200 animate-in fade-in duration-200">
                  <RotateCcw className="w-4 h-4 text-amber-500 shrink-0 mt-0.5 animate-spin" style={{ animationIterationCount: 1 }} />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold">Retorno do Cliente Detectado:</span>
                      <span className="px-1.5 py-0.5 rounded bg-blue-500 text-white font-extrabold text-[10px]">
                        {getProjectVersion(editingFase.projetoCliente || '')}
                      </span>
                      <span>➔</span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white font-extrabold text-[10px]">
                        {getProjectVersion(incrementProjectVersion(editingFase.projetoCliente || ''))}
                      </span>
                    </div>
                    <p className="text-[11px] opacity-90 mt-1">
                      Como a fase está retornando de Aprovação para Estudo preliminar, o projeto passará automaticamente para <strong>{getProjectVersion(incrementProjectVersion(editingFase.projetoCliente || ''))}</strong> e o status para <strong>Comercial/Ajustes</strong>.
                    </p>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Projeto / Cliente</label>
                <input type="text" value={editProjetoCliente} onChange={(e) => setEditProjetoCliente(e.target.value)} placeholder="Ex: Fazenda São João, Cliente: Marcos" className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Novo Prazo Limite</label>
                  <input type="date" value={editPrazoLimite} onChange={(e) => setEditPrazoLimite(e.target.value)} className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors" style={{ colorScheme: 'dark' }} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Status</label>
                  <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors">
                    <option value="Dentro do programado">Dentro do programado</option>
                    <option value="Comercial/Ajustes">Comercial/Ajustes</option>
                    <option value="Aguardando material">Aguardando material</option>
                    <option value="Problema técnico">Problema técnico</option>
                    <option value="Concluído">Concluído</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329] flex justify-end gap-3">
              <button onClick={() => setEditingFase(null)} className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e293b] transition-colors">Cancelar</button>
              <button onClick={handleSaveEdit} disabled={savingEdit} className="px-5 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20 transition-all disabled:opacity-70 flex items-center gap-2">
                {savingEdit && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Salvar Alterações
              </button>
            </div>

            {/* HISTÓRICO */}
            <div className="border-t border-slate-200 dark:border-[#1e293b] mt-2 pt-4 px-6 pb-4">
              <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-2">
                <History className="w-3.5 h-3.5" />Histórico de Alterações
              </h4>
              {loadingHistorico && <p className="text-xs text-slate-500 italic">Carregando...</p>}
              {!loadingHistorico && historico.length === 0 && (
                <p className="text-xs text-slate-500 italic">Nenhuma alteração registrada ainda.</p>
              )}
              {!loadingHistorico && historico.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {historico.map(h => (
                    <div key={h.id} className="flex items-start gap-2 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-slate-700 dark:text-slate-200 font-medium">{h.campo}</span>
                        <span className="text-slate-400"> → </span>
                        <span className="text-slate-600 dark:text-slate-300 break-words">{h.valorNovo || '—'}</span>
                        <div className="text-slate-400 text-[10px] mt-0.5">
                          {h.usuario} · {new Date(h.criadoEm).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DRAWER - NOVA AÇÃO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white/95 dark:bg-[#0d1527]/95 backdrop-blur-2xl h-full border-l border-slate-200 dark:border-[#1e293b] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329]">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Cadastrar Nova Ação</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-[#1e293b] text-slate-500 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <form id="nova-acao-form" onSubmit={handleSaveNovo} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Fase (Gabarito)</label>
                  <select value={novoGabarito} onChange={(e) => setNovoGabarito(e.target.value)} className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors">
                    <option value="01 - Estudo preliminar">01 - Estudo preliminar</option>
                    <option value="02 - Aprovação do cliente ou retorno">02 - Aprovação do cliente ou retorno</option>
                    <option value="03 - Projeto executivo">03 - Projeto executivo</option>
                    <option value="04 - Compra">04 - Compra</option>
                    <option value="05 - Execução">05 - Execução</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Projeto / Cliente</label>
                  <input type="text" value={novoProjetoCliente} onChange={(e) => setNovoProjetoCliente(e.target.value)} placeholder="Ex: Fazenda São João, Cliente: Marcos" className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
                {/* Campo Ação oculto temporariamente conforme solicitado (mantido para fácil reativação) */}
                {/* <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Ação</label>
                    <select value={novaAcao} onChange={(e) => setNovaAcao(e.target.value as ActionType)} className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors">
                      <option value="Cotar">Cotar</option>
                      <option value="Comprar">Comprar</option>
                      <option value="Instalar">Instalar</option>
                      <option value="Vistoriar">Vistoriar</option>
                      <option value="Aprovar">Aprovar</option>
                      <option value="Revisar">Revisar</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Prazo Limite</label>
                    <input type="date" required value={novoPrazo} onChange={(e) => setNovoPrazo(e.target.value)} className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors" style={{ colorScheme: 'dark' }} />
                  </div>
                </div> */}
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Prazo Limite</label>
                  <input type="date" required value={novoPrazo} onChange={(e) => setNovoPrazo(e.target.value)} className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors" style={{ colorScheme: 'dark' }} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Status Inicial</label>
                  <select value={novoStatus} onChange={(e) => setNovoStatus(e.target.value as StatusType)} className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors">
                    <option value="Dentro do programado">Dentro do programado</option>
                    <option value="Comercial/Ajustes">Comercial/Ajustes</option>
                    <option value="Aguardando material">Aguardando material</option>
                    <option value="Problema técnico">Problema técnico</option>
                    <option value="Concluído">Concluído</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Observações Técnicas</label>
                  <textarea rows={4} value={novaObservacao} onChange={(e) => setNovaObservacao(e.target.value)} placeholder="Adicione detalhes, justificativas de atraso, etc." className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors resize-none" />
                </div>
              </form>
            </div>
            <div className="p-6 border-t border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329] flex justify-end gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e293b] transition-colors">Cancelar</button>
              <button type="submit" form="nova-acao-form" disabled={savingNovo} className="px-5 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20 transition-all disabled:opacity-70 flex items-center gap-2">
                {savingNovo && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Salvar Ação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {faseToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mb-4 border border-rose-500/20">
                <AlertTriangle className="w-8 h-8 text-rose-500" />
              </div>
              {faseToDelete.projetoCliente?.trim() ? (
                <>
                  <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">Mover Projeto para a Lixeira</h3>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-500 border border-rose-500/20">
                      {fasesDoProjetoParaDeletar.length} fase{fasesDoProjetoParaDeletar.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-3">
                    O projeto <strong className="inline-flex items-center gap-1.5 text-slate-900 dark:text-white bg-slate-100 dark:bg-[#1e293b] px-2 py-0.5 rounded-md">{faseToDelete.projetoCliente}</strong> será movido para a lixeira com todas as suas fases abaixo. Esta ação pode ser desfeita depois na Lixeira.
                  </p>
                  <div className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 mb-5 text-left space-y-1 max-h-40 overflow-y-auto">
                    {fasesDoProjetoParaDeletar.map(f => (
                      <div key={f.id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                        <span className="font-medium">{f.gabarito}</span>
                        <span className="text-slate-400 ml-auto">{f.responsavel}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Mover para a Lixeira</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-6">
                    Você tem certeza de que deseja enviar a fase <strong className="text-slate-900 dark:text-white">{faseToDelete.gabarito}</strong> para a lixeira?
                  </p>
                </>
              )}
              <div className="flex items-center gap-3 w-full">
                <button onClick={() => setFaseToDelete(null)} className="flex-1 px-4 py-3 rounded-lg text-sm font-medium bg-slate-100 dark:bg-[#111a30] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e293b] transition-colors border border-slate-200 dark:border-[#1e293b]">Cancelar</button>
                <button onClick={handleTrashFase} className="flex-1 px-4 py-3 rounded-lg text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-900/20 transition-all">
                  {faseToDelete.projetoCliente?.trim() ? `Mover Projeto (${fasesDoProjetoParaDeletar.length})` : 'Sim, Mover'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
