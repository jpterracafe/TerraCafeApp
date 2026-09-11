"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Image from 'next/image';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import BackButton from '@/components/BackButton';
import { useToast } from '@/components/Toast';
import { 
  ChevronRight, Calendar, Plus, User, Clock, Briefcase,
  CheckCircle2, AlertCircle, CloudRain, Wrench, Search, Trash2, Filter,
  Paperclip, X, Video, Loader2, TrendingUp, TrendingDown, Settings2,
  Users, Check, Droplets, Layers, ChevronDown, PlayCircle, Flag,
  FileText, Printer, Copy, CheckSquare, Square, Share2
} from 'lucide-react';
import { RegistroDiarioCampo, StatusDiario, EtapaCampo } from '../types';
import { extractProjectBaseName, getProjectVersion } from '../execucao/page';

interface DiarioUser { 
  id: string; 
  name: string; 
  role: string; 
  avatar: string; 
}

interface EtapaConfig {
  dataInicio: string; // YYYY-MM-DD
  metaDias: number;   // ex: 20 dias
  prazoLimite?: string; // YYYY-MM-DD da fase específica
  hasStarted?: boolean;
}

// Ordem exata solicitada pelo cliente
const ETAPAS_CAMPO: { key: EtapaCampo; label: string; icon: string; desc: string }[] = [
  { key: 'Valetas',                     label: 'Valetas',                     icon: '⛏️', desc: 'Abertura, alinhamento e nivelamento de valas' },
  { key: 'montagem campo',              label: 'Montagem Campo',              icon: '🌱', desc: 'Dispersão de tubulações, gotejadores e conexões' },
  { key: 'casa de bombas',              label: 'Casa de Bombas',              icon: '⚙️', desc: 'Instalação de bombas, filtros e cabeçal de controle' },
  { key: 'elétrica',                    label: 'Elétrica',                    icon: '⚡', desc: 'Quadros elétricos, automação e cabeamento' },
  { key: 'lavagem do sistema e testes',  label: 'Lavagem do Sistema e Testes', icon: '💧', desc: 'Limpeza de linhas, teste de estanqueidade e pressão' },
  { key: 'entrega técnica',             label: 'Entrega Técnica',             icon: '📋', desc: 'Checklist final, treinamento operacional e entrega técnica ao cliente' },
];

const getInitials = (name: string) => {
  if (!name) return 'U';
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.substring(0, 2).toUpperCase();
};

const getStatusConfig = (status: StatusDiario | string) => {
  const s = (status || '').toLowerCase();
  if (s.includes('configuração') || s.includes('configuracao') || s.includes('atualizada') || s.includes('atualizado')) {
    return {
      color: 'text-violet-500 bg-violet-500/10 border-violet-500/25',
      badgeBg: 'bg-violet-500/20 text-violet-500 border-violet-500/30',
      icon: Calendar,
      label: 'Configuração Atualizada',
    };
  }
  if (s.includes('dentro') || s.includes('programado') || s.includes('concluído')) {
    return { 
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25', 
      badgeBg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      icon: CheckCircle2,
      label: 'Dentro do programado'
    };
  }
  if (s === 'acima' || s.includes('acima')) {
    return { 
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/25', 
      badgeBg: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      icon: TrendingUp,
      label: 'Acima (Rendimento alto)'
    };
  }
  if (s === 'abaixo' || s.includes('abaixo') || s.includes('atras') || s.includes('problema')) {
    return { 
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/25', 
      badgeBg: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      icon: TrendingDown,
      label: 'Abaixo (Atraso/Lentidão)'
    };
  }
  if (s.includes('chuva')) {
    return { color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/25', badgeBg: 'bg-cyan-500/20 text-cyan-400', icon: CloudRain, label: 'Chuva' };
  }
  return { color: 'text-slate-400 bg-slate-500/10 border-slate-500/25', badgeBg: 'bg-slate-500/20 text-slate-400', icon: Clock, label: status };
};

export default function DiarioCampoTimelinePage() {
  const { success, error: toastError } = useToast();

  // Dados principais
  const [registros, setRegistros] = useState<RegistroDiarioCampo[]>([]);
  const [users, setUsers] = useState<DiarioUser[]>([]);
  const [projetos, setProjetos] = useState<string[]>([]);
  const [projetosDeletados, setProjetosDeletados] = useState<Set<string>>(new Set());

  // Seleções do usuário
  const [selectedProjeto, setSelectedProjeto] = useState<string>('');
  const [selectedEtapa, setSelectedEtapa] = useState<EtapaCampo>('Valetas');

  // Responsáveis mapeados por Etapa: { [projeto::etapa]: string[] }
  const [responsaveisPorEtapa, setResponsaveisPorEtapa] = useState<Record<string, string[]>>({});

  // Filtros de busca
  const [searchProjeto, setSearchProjeto] = useState('');
  const [buscaLog, setBuscaLog] = useState('');
  const [filtroModoHistorico, setFiltroModoHistorico] = useState<'etapa' | 'todos'>('etapa');

  // Estados de carregamento
  const [loadingProjetos, setLoadingProjetos] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Registro rápido
  const [statusRapido, setStatusRapido] = useState<'Dentro do programado' | 'Acima' | 'Abaixo'>('Dentro do programado');
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);

  // Mídia
  const [midiaFile, setMidiaFile] = useState<File | null>(null);
  const [midiaPreview, setMidiaPreview] = useState<string>('');
  const [midiaTipo, setMidiaTipo] = useState<'image' | 'video' | ''>('');
  const [uploadingMidia, setUploadingMidia] = useState(false);

  // Data de Start do Projeto
  const [projetoStartDates, setProjetoStartDates] = useState<Record<string, string>>({});
  const [isProjectStartModalOpen, setIsProjectStartModalOpen] = useState(false);
  const [tempProjectStartDate, setTempProjectStartDate] = useState('');

  // ── Resumo Personalizado para a Diretoria ──────────────────────────────────
  const [isResumoModalOpen, setIsResumoModalOpen] = useState(false);
  const [resumoPeriodo, setResumoPeriodo] = useState<'7dias' | '15dias' | '30dias' | 'tudo'>('15dias');
  const [resumoEtapas, setResumoEtapas] = useState<string[]>(ETAPAS_CAMPO.map(e => e.key));
  const [recadoDiretoria, setRecadoDiretoria] = useState('');
  const [incluirFotosNoResumo, setIncluirFotosNoResumo] = useState(true);
  const [copiadoWhatsApp, setCopiadoWhatsApp] = useState(false);

  // Configuração do Contador de Dias da Etapa
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configEtapas, setConfigEtapas] = useState<Record<string, EtapaConfig>>({});
  const [tempMetaDias, setTempMetaDias] = useState(40);
  const [tempDataInicio, setTempDataInicio] = useState(new Date().toISOString().split('T')[0]);
  const [tempMotivoAjuste, setTempMotivoAjuste] = useState('');

  // ── Prazos Finais Fixos (Imutáveis) e Justificativas de Campo ──────────────
  const [projetosPrazoFinal, setProjetosPrazoFinal] = useState<Record<string, string>>({});
  const [projetoJustificativas, setProjetoJustificativas] = useState<Record<string, Array<{ id: string; data: string; autor: string; motivo: string; observacao: string }>>>({});

  // Modal Novo Projeto (Criado direto no Diário de Campo)
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDeadline, setNewProjectDeadline] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  // Modal Justificativas de Campo (Substitui Ajuste de Meta)
  const [isJustificativaModalOpen, setIsJustificativaModalOpen] = useState(false);
  const [justificativaMotivo, setJustificativaMotivo] = useState('Chuva no dia');
  const [justificativaTexto, setJustificativaTexto] = useState('');
  const [savingJustificativa, setSavingJustificativa] = useState(false);

  // Modal Iniciar e Definir Prazo da Fase Específica
  const [isIniciarEtapaModalOpen, setIsIniciarEtapaModalOpen] = useState(false);
  const [iniciarEtapaDataInicio, setIniciarEtapaDataInicio] = useState('');
  const [iniciarEtapaPrazoLimite, setIniciarEtapaPrazoLimite] = useState('');
  const [iniciarEtapaMetaDias, setIniciarEtapaMetaDias] = useState(20);

  // Modal Concluir Fase
  const [isConcluirFaseModalOpen, setIsConcluirFaseModalOpen] = useState(false);
  const [concluindoFase, setConcluindoFase] = useState(false);
  const [observacaoConclusao, setObservacaoConclusao] = useState('');

  // Progresso manual editável por fase no Diário de Campo
  const [progressoManual, setProgressoManual] = useState<Record<string, number>>({});
  const [savingProgresso, setSavingProgresso] = useState(false);

  // Carrega configurações de contadores, start de projetos e responsáveis por etapa (Nuvem + LocalStorage)
  useEffect(() => {
    // 1. Leitura rápida do cache local
    try {
      const savedConfig = localStorage.getItem('diario_etapas_config_v1');
      if (savedConfig) setConfigEtapas(JSON.parse(savedConfig));

      const savedStarts = localStorage.getItem('diario_projeto_starts_v1');
      if (savedStarts) setProjetoStartDates(JSON.parse(savedStarts));

      const savedRespEtapas = localStorage.getItem('diario_responsaveis_por_etapa_v1');
      if (savedRespEtapas) setResponsaveisPorEtapa(JSON.parse(savedRespEtapas));

      const savedPrazos = localStorage.getItem('diario_projetos_prazo_final_v1');
      if (savedPrazos) setProjetosPrazoFinal(JSON.parse(savedPrazos));

      const savedJust = localStorage.getItem('diario_projeto_justificativas_v1');
      if (savedJust) setProjetoJustificativas(JSON.parse(savedJust));

      const savedProgresso = localStorage.getItem('diario_etapas_progresso_v1');
      if (savedProgresso) setProgressoManual(JSON.parse(savedProgresso));
    } catch (e) {
      console.error('[diario] Erro ao ler configs do localStorage:', e);
    }

    // 2. Sincronização com o servidor/nuvem
    fetch('/api/etapas-config')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          if (data.configEtapas && Object.keys(data.configEtapas).length > 0) {
            setConfigEtapas(prev => ({ ...prev, ...data.configEtapas }));
            try { localStorage.setItem('diario_etapas_config_v1', JSON.stringify(data.configEtapas)); } catch (_) {}
          }
          if (data.projetoStartDates && Object.keys(data.projetoStartDates).length > 0) {
            setProjetoStartDates(prev => ({ ...prev, ...data.projetoStartDates }));
            try { localStorage.setItem('diario_projeto_starts_v1', JSON.stringify(data.projetoStartDates)); } catch (_) {}
          }
          if (data.responsaveisPorEtapa && Object.keys(data.responsaveisPorEtapa).length > 0) {
            setResponsaveisPorEtapa(prev => ({ ...prev, ...data.responsaveisPorEtapa }));
            try { localStorage.setItem('diario_responsaveis_por_etapa_v1', JSON.stringify(data.responsaveisPorEtapa)); } catch (_) {}
          }
          if (data.projetosPrazoFinal && Object.keys(data.projetosPrazoFinal).length > 0) {
            setProjetosPrazoFinal(prev => ({ ...prev, ...data.projetosPrazoFinal }));
            try { localStorage.setItem('diario_projetos_prazo_final_v1', JSON.stringify(data.projetosPrazoFinal)); } catch (_) {}
          }
          if (data.projetoJustificativas && Object.keys(data.projetoJustificativas).length > 0) {
            setProjetoJustificativas(prev => ({ ...prev, ...data.projetoJustificativas }));
            try { localStorage.setItem('diario_projeto_justificativas_v1', JSON.stringify(data.projetoJustificativas)); } catch (_) {}
          }
          // Carrega progresso manual salvo
          if (data.etapasProgresso && Object.keys(data.etapasProgresso).length > 0) {
            setProgressoManual(prev => ({ ...prev, ...data.etapasProgresso }));
            try { localStorage.setItem('diario_etapas_progresso_v1', JSON.stringify(data.etapasProgresso)); } catch (_) {}
          }
        }
      })
      .catch(err => console.warn('[diario] Offline ou erro ao sincronizar configs:', err));
  }, []);

  const saveEtapaConfigToStorage = (newConfigs: Record<string, EtapaConfig>) => {
    setConfigEtapas(newConfigs);
    try {
      localStorage.setItem('diario_etapas_config_v1', JSON.stringify(newConfigs));
    } catch (e) {
      console.error('[diario] Erro ao salvar config no localStorage:', e);
    }
    // Sincroniza em nuvem
    fetch('/api/etapas-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'etapas', dados: newConfigs }),
    }).catch(e => console.warn('[diario] Erro ao sincronizar metas com a nuvem:', e));
  };

  const saveProjectStartsToStorage = (newStarts: Record<string, string>) => {
    setProjetoStartDates(newStarts);
    try {
      localStorage.setItem('diario_projeto_starts_v1', JSON.stringify(newStarts));
    } catch (e) {
      console.error('[diario] Erro ao salvar starts no localStorage:', e);
    }
    // Sincroniza em nuvem
    fetch('/api/etapas-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'starts', dados: newStarts }),
    }).catch(e => console.warn('[diario] Erro ao sincronizar starts com a nuvem:', e));
  };

  const saveResponsaveisPorEtapaToStorage = (newResp: Record<string, string[]>) => {
    setResponsaveisPorEtapa(newResp);
    try {
      localStorage.setItem('diario_responsaveis_por_etapa_v1', JSON.stringify(newResp));
    } catch (e) {
      console.error('[diario] Erro ao salvar responsáveis por etapa:', e);
    }
    // Sincroniza em nuvem
    fetch('/api/etapas-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'responsaveis', dados: newResp }),
    }).catch(e => console.warn('[diario] Erro ao sincronizar equipes com a nuvem:', e));
  };

  // Carrega lista de responsáveis
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/responsaveis');
      if (res.ok) {
        const { responsaveis } = await res.json();
        const mapped: DiarioUser[] = (responsaveis ?? []).map((r: any) => ({
          id: r.id,
          name: r.nome,
          role: r.cargo,
          avatar: getInitials(r.nome),
        }));
        setUsers(mapped);
      }
    } catch (e) {
      console.error('[diario] Erro ao carregar responsáveis:', e);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  // Carrega logs do diário
  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch('/api/diario-logs');
      if (res.ok) {
        const { logs } = await res.json();
        setRegistros(logs ?? []);
      }
    } catch (e) {
      console.error('[diario] Erro ao carregar logs:', e);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  // Carrega lista de projetos ativos e deletados
  const loadProjetos = useCallback(async () => {
    setLoadingProjetos(true);
    try {
      const [resProjetos, resFases] = await Promise.all([
        fetch('/api/projetos'),
        fetch('/api/fases'),
      ]);

      let deletados = new Set<string>();
      let listaProjetos: string[] = [];

      if (resFases.ok) {
        const { fases } = await resFases.json();
        const ativas = (fases ?? [])
          .filter((f: any) => !f.isDeleted && f.projetoCliente && f.projetoCliente.trim() !== '')
          .map((f: any) => f.projetoCliente as string);
        const ativasSet = new Set(ativas);

        deletados = new Set<string>(
          (fases ?? [])
            .filter((f: any) => f.isDeleted && f.projetoCliente && f.projetoCliente.trim() !== '')
            .map((f: any) => f.projetoCliente as string)
            .filter((p: string) => !ativasSet.has(p))
        );
        setProjetosDeletados(deletados);
        listaProjetos.push(...ativas);
      }

      if (resProjetos.ok) {
        const { projetos } = await resProjetos.json();
        listaProjetos.push(...(projetos ?? []));
      }

      const unicos = Array.from(new Set(listaProjetos.filter(p => !deletados.has(p)))).sort();
      setProjetos(unicos);

      if (unicos.length > 0) {
        setSelectedProjeto(prev => prev && unicos.includes(prev) ? prev : unicos[0]);
      }
    } catch (e) {
      console.error('[diario] Erro ao carregar projetos:', e);
    } finally {
      setLoadingProjetos(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    loadUsers();
    loadLogs();
    loadProjetos();
  }, [loadUsers, loadLogs, loadProjetos]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // ── Auto-refresh: polling 30s + recarga ao focar/visibilidade ─────────
  useEffect(() => {
    let timerId: ReturnType<typeof setInterval> | null = null;
    const REFRESH_MS = 30 * 1000;

    const startPolling = () => {
      if (timerId) return;
      timerId = setInterval(() => {
        if (!loadingLogs && !loadingProjetos) {
          loadLogs();
          loadProjetos();
        }
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
        if (!loadingLogs && !loadingProjetos) {
          loadLogs();
          loadProjetos();
        }
        startPolling();
      } else {
        stopPolling();
      }
    };

    const onFocus = () => {
      if (!loadingLogs && !loadingProjetos) {
        loadLogs();
        loadProjetos();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadLogs, loadProjetos, loadingLogs, loadingProjetos]);

  // ── Responsáveis da Etapa Atual (Vinculação por Etapa) ──────────────────────
  const etapaKey = `${selectedProjeto}::${selectedEtapa}`;
  const currentEtapaResponsaveis = useMemo(() => {
    return responsaveisPorEtapa[etapaKey] ?? [];
  }, [responsaveisPorEtapa, etapaKey]);

  // ── Verifica se a etapa atual está concluída ──────────────────────────────────
  const isFaseConcluida = useMemo(() => {
    // Verifica se há configuração de progresso salvo
    const progressoSalvo = configEtapas[etapaKey];
    
    // Verifica logs com status "Concluído"
    const temLogConcluido = registros.some(r => 
      r.projetoCliente === selectedProjeto &&
      (r.atividade === selectedEtapa || r.atividade.toLowerCase().includes(selectedEtapa.toLowerCase())) &&
      (r.status || '').toLowerCase().includes('concluído')
    );

    return temLogConcluido;
  }, [configEtapas, etapaKey, registros, selectedProjeto, selectedEtapa]);

  const toggleResponsavelNaEtapa = (nome: string) => {
    const atuais = responsaveisPorEtapa[etapaKey] ?? [];
    const novos = atuais.includes(nome)
      ? atuais.filter(n => n !== nome)
      : [...atuais, nome];
    
    const updated = {
      ...responsaveisPorEtapa,
      [etapaKey]: novos,
    };
    saveResponsaveisPorEtapaToStorage(updated);
  };

  const selectAllResponsaveisNaEtapa = () => {
    const updated = {
      ...responsaveisPorEtapa,
      [etapaKey]: users.map(u => u.name),
    };
    saveResponsaveisPorEtapaToStorage(updated);
  };

  const clearResponsaveisNaEtapa = () => {
    const updated = {
      ...responsaveisPorEtapa,
      [etapaKey]: [],
    };
    saveResponsaveisPorEtapaToStorage(updated);
  };

  // Mídia upload handlers
  const handleMidiaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    const isImg = file.type.startsWith('image/');
    const isVid = file.type.startsWith('video/');
    if (!isImg && !isVid) return;
    setMidiaFile(file);
    setMidiaTipo(isImg ? 'image' : 'video');
    setMidiaPreview(URL.createObjectURL(file));
  };

  const clearMidia = () => {
    setMidiaFile(null);
    setMidiaPreview('');
    setMidiaTipo('');
  };

  // ── Cálculo do Start do Projeto & Dia Atual do Projeto ──────────────────────
  // Se o primeiro dia que ele usou o histórico foi 01/09, aquele é o Dia 1 do projeto, segundo dia = Dia 2, etc.
  const dataStartProjeto = useMemo(() => {
    if (projetoStartDates[selectedProjeto]) {
      return projetoStartDates[selectedProjeto];
    }
    const logsProjeto = registros.filter(r => r.projetoCliente === selectedProjeto);
    if (logsProjeto.length > 0) {
      const datas = logsProjeto.map(l => l.data).sort();
      return datas[0];
    }
    return new Date().toISOString().split('T')[0];
  }, [projetoStartDates, selectedProjeto, registros]);

  const diaAtualDoProjeto = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const start = new Date(`${dataStartProjeto}T00:00:00`);
    start.setHours(0, 0, 0, 0);
    const diff = hoje.getTime() - start.getTime();
    const diaNum = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, diaNum);
  }, [dataStartProjeto]);

  const handleOpenProjectStartModal = () => {
    setTempProjectStartDate(dataStartProjeto);
    setIsProjectStartModalOpen(true);
  };

  const handleSaveProjectStartModal = () => {
    const updated = {
      ...projetoStartDates,
      [selectedProjeto]: tempProjectStartDate || new Date().toISOString().split('T')[0],
    };
    saveProjectStartsToStorage(updated);
    setIsProjectStartModalOpen(false);
    success(`Data de início do projeto "${selectedProjeto}" atualizada!`);
  };

  // ── Cálculo do Contador da Etapa Atual ──────────────────────────────────────
  const currentConfigKey = `${selectedProjeto}::${selectedEtapa}`;
  const currentEtapaConfig: EtapaConfig = useMemo(() => {
    if (configEtapas[currentConfigKey]) {
      return configEtapas[currentConfigKey];
    }
    const logsEtapa = registros.filter(r => 
      r.projetoCliente === selectedProjeto && 
      (r.atividade === selectedEtapa || r.atividade.toLowerCase().includes(selectedEtapa.toLowerCase()))
    );
    let dataInicioDefault = '';
    if (logsEtapa.length > 0) {
      const datas = logsEtapa.map(l => l.data).sort();
      dataInicioDefault = datas[0];
    }
    return {
      dataInicio: dataInicioDefault || dataStartProjeto || new Date().toISOString().split('T')[0],
      metaDias: 20,
      prazoLimite: '',
      hasStarted: logsEtapa.length > 0,
    };
  }, [configEtapas, currentConfigKey, registros, selectedProjeto, selectedEtapa, dataStartProjeto]);

  const statsContador = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const inicio = new Date(`${currentEtapaConfig.dataInicio}T00:00:00`);
    inicio.setHours(0, 0, 0, 0);

    const diffMs = hoje.getTime() - inicio.getTime();
    const diasDecorridos = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

    let prazoLimiteFase = currentEtapaConfig.prazoLimite || '';
    if (!prazoLimiteFase) {
      const dFim = new Date(inicio);
      dFim.setDate(dFim.getDate() + (currentEtapaConfig.metaDias || 20));
      prazoLimiteFase = dFim.toISOString().split('T')[0];
    }
    const dPrazoFim = new Date(`${prazoLimiteFase}T00:00:00`);
    dPrazoFim.setHours(0, 0, 0, 0);
    const diffRestanteMs = dPrazoFim.getTime() - hoje.getTime();
    const diasRestantes = Math.ceil(diffRestanteMs / (1000 * 60 * 60 * 24));

    const pct = Math.min(100, Math.max(0, Math.round((diasDecorridos / Math.max(1, currentEtapaConfig.metaDias)) * 100)));
    const atrasado = diasRestantes < 0;

    return {
      diasDecorridos,
      diasRestantes,
      metaDias: currentEtapaConfig.metaDias,
      prazoLimite: prazoLimiteFase,
      prazoLimiteFormatado: dPrazoFim.toLocaleDateString('pt-BR'),
      pct,
      atrasado,
      dataInicio: currentEtapaConfig.dataInicio,
      hasStarted: currentEtapaConfig.hasStarted ?? true,
    };
  }, [currentEtapaConfig]);

  const handleOpenIniciarEtapaModal = () => {
    setIniciarEtapaDataInicio(currentEtapaConfig.dataInicio || new Date().toISOString().split('T')[0]);
    let defaultPrazo = currentEtapaConfig.prazoLimite || '';
    if (!defaultPrazo) {
      const d = new Date(`${currentEtapaConfig.dataInicio || new Date().toISOString().split('T')[0]}T00:00:00`);
      d.setDate(d.getDate() + (currentEtapaConfig.metaDias || 20));
      defaultPrazo = d.toISOString().split('T')[0];
    }
    setIniciarEtapaPrazoLimite(defaultPrazo);
    setIniciarEtapaMetaDias(currentEtapaConfig.metaDias || 20);
    setIsIniciarEtapaModalOpen(true);
  };

  const handleSaveIniciarEtapaModal = () => {
    if (!iniciarEtapaDataInicio || !iniciarEtapaPrazoLimite) {
      toastError('Preencha a data de início e o prazo limite da fase.');
      return;
    }
    const dIni = new Date(`${iniciarEtapaDataInicio}T00:00:00`);
    const dFim = new Date(`${iniciarEtapaPrazoLimite}T00:00:00`);
    if (dFim.getTime() < dIni.getTime()) {
      toastError('A data limite da fase não pode ser anterior à data de início.');
      return;
    }
    const prazoTotalObra = projetosPrazoFinal[selectedProjeto];
    if (prazoTotalObra) {
      const dTotal = new Date(`${prazoTotalObra}T00:00:00`);
      if (dFim.getTime() > dTotal.getTime()) {
        toastError(`O prazo da fase (${dFim.toLocaleDateString('pt-BR')}) não pode ultrapassar o prazo total do projeto (${dTotal.toLocaleDateString('pt-BR')}).`);
        return;
      }
    }
    const diffDias = Math.max(1, Math.round((dFim.getTime() - dIni.getTime()) / (1000 * 60 * 60 * 24)));
    const updated = {
      ...configEtapas,
      [currentConfigKey]: {
        dataInicio: iniciarEtapaDataInicio,
        metaDias: diffDias,
        prazoLimite: iniciarEtapaPrazoLimite,
        hasStarted: true,
      }
    };
    saveEtapaConfigToStorage(updated);

    // ── Registra aviso no histórico sobre mudança de datas ─────────────────
    const hojeStr = new Date().toISOString().split('T')[0];
    const antigo = configEtapas[currentConfigKey];
    const mudouInicio = antigo?.dataInicio && antigo.dataInicio !== iniciarEtapaDataInicio;
    const mudouPrazo  = antigo?.prazoLimite && antigo.prazoLimite !== iniciarEtapaPrazoLimite;
    if (mudouInicio || mudouPrazo || !antigo?.hasStarted) {
      const partes: string[] = [];
      if (!antigo?.hasStarted) partes.push(`Fase iniciada em ${new Date(`${iniciarEtapaDataInicio}T00:00:00`).toLocaleDateString('pt-BR')} com prazo até ${new Date(`${iniciarEtapaPrazoLimite}T00:00:00`).toLocaleDateString('pt-BR')} (${diffDias} dias)`);
      else {
        if (mudouInicio) partes.push(`Início alterado de ${new Date(`${antigo.dataInicio}T00:00:00`).toLocaleDateString('pt-BR')} → ${new Date(`${iniciarEtapaDataInicio}T00:00:00`).toLocaleDateString('pt-BR')}`);
        if (mudouPrazo)  partes.push(`Prazo alterado de ${new Date(`${antigo.prazoLimite!}T00:00:00`).toLocaleDateString('pt-BR')} → ${new Date(`${iniciarEtapaPrazoLimite}T00:00:00`).toLocaleDateString('pt-BR')}`);
      }
      const resp = currentEtapaResponsaveis.length > 0 ? currentEtapaResponsaveis.join(', ') : 'Equipe';
      fetch('/api/diario-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: hojeStr,
          responsavel: resp,
          atividade: selectedEtapa,
          status: 'Configuração Atualizada',
          observacoes: `📅 ${partes.join(' | ')}`,
          projetoCliente: selectedProjeto,
        }),
      }).then(r => r.ok ? r.json() : null)
        .then(res => { if (res?.log) setRegistros(prev => [res.log, ...prev]); })
        .catch(() => {});
    }

    setIsIniciarEtapaModalOpen(false);
    success(`Início e prazo da fase "${selectedEtapa}" configurados com sucesso!`);
  };

  // ── Handler para Concluir Fase ──────────────────────────────────────────────
  const handleConcluirFase = async () => {
    if (!selectedProjeto || !selectedEtapa) {
      toastError('Selecione um projeto e uma etapa.');
      return;
    }

    if (currentEtapaResponsaveis.length === 0) {
      toastError('Atribua pelo menos um responsável a esta etapa antes de concluí-la.');
      return;
    }

    setConcluindoFase(true);
    try {
      const chaveEtapa = `${selectedProjeto}::${selectedEtapa}`;
      const hojeStr = new Date().toISOString().split('T')[0];
      const responsaveisStr = currentEtapaResponsaveis.join(', ');

      // 1. Salvar progresso 100% via API
      const resProgresso = await fetch('/api/etapas-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'progresso',
          dados: { [chaveEtapa]: 100 }
        })
      });

      // 2. Salvar status "Concluída" via API
      const resStatus = await fetch('/api/etapas-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'status_etapas',
          dados: { [chaveEtapa]: 'Concluída' }
        })
      });

      if (!resProgresso.ok || !resStatus.ok) {
        throw new Error('Erro ao atualizar status de conclusão');
      }

      // 3. Registrar no diário de campo com status especial "Concluído"
      const logConclusao: Partial<RegistroDiarioCampo> = {
        data: hojeStr,
        responsavel: responsaveisStr,
        atividade: selectedEtapa,
        status: 'Concluído',
        observacoes: observacaoConclusao.trim() || `✅ Fase "${selectedEtapa}" marcada como CONCLUÍDA pela equipe de campo.`,
        projetoCliente: selectedProjeto,
      };

      const resLog = await fetch('/api/diario-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logConclusao)
      });

      if (resLog.ok) {
        const novoLog = await resLog.json();
        setRegistros(prev => [novoLog, ...prev]);
      }

      // 4. Atualizar localStorage e estado local
      const updatedConfig = {
        ...configEtapas,
        [chaveEtapa]: {
          ...configEtapas[chaveEtapa],
          hasStarted: true,
        }
      };
      saveEtapaConfigToStorage(updatedConfig);

      setIsConcluirFaseModalOpen(false);
      setObservacaoConclusao('');
      success(`🎉 Fase "${selectedEtapa}" marcada como CONCLUÍDA! Progresso atualizado para 100%.`);
      
      // Recarregar dados para refletir mudanças
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (err) {
      console.error('[concluir-fase] Erro:', err);
      toastError('Erro ao marcar fase como concluída. Tente novamente.');
    } finally {
      setConcluindoFase(false);
    }
  };

  // ── Salvar Progresso Manual por Fase (Diário de Campo) ──────────────────────
  const handleSalvarProgresso = async (valor: number) => {
    if (!selectedProjeto || !selectedEtapa) return;
    const chaveEtapa = `${selectedProjeto}::${selectedEtapa}`;
    const clampado = Math.min(100, Math.max(0, valor));

    // Atualiza localmente
    const updated = { ...progressoManual, [chaveEtapa]: clampado };
    setProgressoManual(updated);
    try { localStorage.setItem('diario_etapas_progresso_v1', JSON.stringify(updated)); } catch (_) {}

    setSavingProgresso(true);
    try {
      await fetch('/api/etapas-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'progresso', dados: { [chaveEtapa]: clampado } }),
      });
    } catch (_) {
      console.warn('[diario] Erro ao salvar progresso');
    } finally {
      setSavingProgresso(false);
    }
  };

  const handleOpenConfigModal = () => {
    setTempMetaDias(currentEtapaConfig.metaDias);
    setTempDataInicio(currentEtapaConfig.dataInicio);
    setTempMotivoAjuste('');
    setIsConfigModalOpen(true);
  };

  const handleSaveConfigModal = async () => {
    const updated = {
      ...configEtapas,
      [currentConfigKey]: {
        metaDias: Math.max(1, tempMetaDias),
        dataInicio: tempDataInicio || new Date().toISOString().split('T')[0],
      }
    };
    saveEtapaConfigToStorage(updated);

    // Se o usuário escreveu um motivo OU se a meta/data mudou, registra no histórico
    const motivo = tempMotivoAjuste.trim();
    const alterouDias = tempMetaDias !== currentEtapaConfig.metaDias;
    const alterouData = tempDataInicio !== currentEtapaConfig.dataInicio;

    if (motivo || alterouDias || alterouData) {
      try {
        const hojeStr = new Date().toISOString().split('T')[0];
        const respEtapaStr = currentEtapaResponsaveis.join(', ') || 'Equipe Técnica';
        const obsAjuste = `⏱️ Ajuste de Meta para ${tempMetaDias} dias (início: ${new Date(`${tempDataInicio}T00:00:00`).toLocaleDateString('pt-BR')}).${motivo ? ` Motivo: ${motivo}` : ''}`;

        const res = await fetch('/api/diario-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: hojeStr,
            responsavel: respEtapaStr,
            atividade: selectedEtapa,
            status: 'Dentro do programado',
            observacoes: obsAjuste,
            projetoCliente: selectedProjeto,
          }),
        });

        if (res.ok) {
          const { log } = await res.json();
          setRegistros(prev => [log, ...prev]);
        }
      } catch (err) {
        console.error('[diario] Erro ao registrar ajuste no histórico:', err);
      }
    }

    setIsConfigModalOpen(false);
    success(`Contador de ${selectedEtapa} atualizado!`);
  };

  // ── Criar Novo Projeto Diretamente no Diário de Campo ──────────────────────
  const handleCreateNewProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const nomeLimpo = newProjectName.trim();
    if (!nomeLimpo) {
      toastError('Informe o nome do novo projeto.');
      return;
    }
    if (!newProjectDeadline) {
      toastError('Informe a data do prazo final.');
      return;
    }

    setCreatingProject(true);
    try {
      const hoje = new Date().toISOString().split('T')[0];
      const res = await fetch('/api/projetos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nomeLimpo,
          prazoFinal: newProjectDeadline,
          dataInicio: hoje,
        }),
      });

      if (!res.ok) {
        const dErr = await res.json().catch(() => ({}));
        throw new Error(dErr.error || 'Erro ao criar projeto');
      }

      // Sincroniza prazo final imutável
      const novoPrazoObj = { ...projetosPrazoFinal, [nomeLimpo]: newProjectDeadline };
      setProjetosPrazoFinal(novoPrazoObj);
      fetch('/api/etapas-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'prazos_finais', dados: novoPrazoObj }),
      }).catch(() => {});

      // Sincroniza data de start
      const novoStartObj = { ...projetoStartDates, [nomeLimpo]: hoje };
      saveProjectStartsToStorage(novoStartObj);

      await loadProjetos();
      setSelectedProjeto(nomeLimpo);
      setIsNewProjectModalOpen(false);
      setNewProjectName('');
      setNewProjectDeadline('');
      success(`Projeto "${nomeLimpo}" criado com sucesso com as 6 fases oficiais!`);
    } catch (err: any) {
      toastError(err.message || 'Falha ao criar projeto.');
    } finally {
      setCreatingProject(false);
    }
  };

  // ── Registrar Justificativa Oficial de Campo (Prazo Inalterável) ───────────
  const handleSaveJustificativa = async () => {
    const txt = justificativaTexto.trim();
    if (!txt) {
      toastError('Descreva o que ocorreu (ex: Chuva torrencial impediu o serviço...).');
      return;
    }
    if (!selectedProjeto) return;

    setSavingJustificativa(true);
    try {
      const hojeStr = new Date().toISOString().split('T')[0];
      const responsavelStr = currentEtapaResponsaveis.join(', ') || 'Equipe de Campo';
      const novaJust = {
        id: `just_${Date.now()}`,
        data: hojeStr,
        autor: responsavelStr,
        motivo: justificativaMotivo,
        observacao: txt,
      };

      // 1. Salva nas configurações gerais
      await fetch('/api/etapas-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'justificativas',
          dados: {
            projeto: selectedProjeto,
            justificativa: novaJust,
          },
        }),
      });

      // Atualiza estado local
      setProjetoJustificativas(prev => {
        const lista = prev[selectedProjeto] || [];
        return {
          ...prev,
          [selectedProjeto]: [novaJust, ...lista],
        };
      });

      // 2. Cria log no diário de campo para ficar visível na timeline da obra
      const statusLog = justificativaMotivo.toLowerCase().includes('chuva') ? 'Chuva' : 'Abaixo';
      const resLog = await fetch('/api/diario-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: hojeStr,
          responsavel: responsavelStr,
          atividade: selectedEtapa,
          status: statusLog,
          observacoes: `[JUSTIFICATIVA OFICIAL - ${justificativaMotivo.toUpperCase()}]: ${txt}`,
          projetoCliente: selectedProjeto,
        }),
      });

      if (resLog.ok) {
        const { log } = await resLog.json();
        setRegistros(prev => [log, ...prev]);
      }

      setIsJustificativaModalOpen(false);
      setJustificativaTexto('');
      success('Justificativa oficial registrada! O Diretor Paulo poderá consultá-la.');
    } catch (err: any) {
      toastError('Erro ao registrar justificativa.');
    } finally {
      setSavingJustificativa(false);
    }
  };

  // ── Salvar Registro no Diário ────────────────────────────────────────────────
  const handleSalvarDiario = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedProjeto) {
      toastError('Selecione ou cadastre um projeto antes de salvar.');
      return;
    }

    if (currentEtapaResponsaveis.length === 0) {
      toastError(`Selecione ao menos um responsável da equipe para a etapa "${selectedEtapa}".`);
      return;
    }

    // ✅ Validação: não permitir registros em fases concluídas
    if (isFaseConcluida) {
      toastError(`⚠️ A fase "${selectedEtapa}" já está marcada como concluída (100%). Para fazer novos registros, entre em contato com o diretor para reabrir a fase.`);
      return;
    }

    setSaving(true);
    try {
      let midiaUrl = '';
      let midiaFinalTipo = '';
      if (midiaFile) {
        setUploadingMidia(true);
        const fd = new FormData();
        fd.append('file', midiaFile);
        const upRes = await fetch('/api/diario-upload', { method: 'POST', body: fd });
        if (upRes.ok) {
          const upData = await upRes.json();
          midiaUrl       = upData.url  ?? '';
          midiaFinalTipo = upData.tipo ?? '';
        } else {
          console.error('[diario] Falha no upload de mídia.');
        }
        setUploadingMidia(false);
      }

      const responsaveisStr = currentEtapaResponsaveis.join(', ');
      const hojeStr = new Date().toISOString().split('T')[0];

      const res = await fetch('/api/diario-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: hojeStr,
          responsavel: responsaveisStr,
          atividade: selectedEtapa,
          status: statusRapido,
          observacoes: observacoes.trim(),
          projetoCliente: selectedProjeto,
          midiaUrl,
          midiaTipo: midiaFinalTipo,
        }),
      });

      if (res.ok) {
        const { log } = await res.json();
        setRegistros(prev => [log, ...prev]);
        setObservacoes('');
        clearMidia();
        success(`Registro em "${selectedEtapa}" salvo no diário!`);
      } else {
        toastError('Erro ao registrar no diário.');
      }
    } catch (e) {
      console.error('[diario] Erro ao salvar:', e);
      toastError('Erro ao registrar no diário.');
    } finally {
      setSaving(false);
      setUploadingMidia(false);
    }
  };

  // Excluir log
  const handleDeleteLog = async (id: string) => {
    if (!confirm('Deseja excluir este registro do diário?')) return;
    try {
      const res = await fetch(`/api/diario-logs?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setRegistros(prev => prev.filter(r => r.id !== id));
        success('Registro excluído com sucesso.');
      } else {
        toastError('Erro ao excluir o registro.');
      }
    } catch (e) {
      console.error('[diario] Erro ao deletar log:', e);
    }
  };

  // Retorna "Dia X do Projeto" para um log específico
  const getDiaDoProjetoTexto = (logDataStr: string) => {
    try {
      const logDate = new Date(`${logDataStr}T00:00:00`);
      logDate.setHours(0, 0, 0, 0);
      const start = new Date(`${dataStartProjeto}T00:00:00`);
      start.setHours(0, 0, 0, 0);
      const diff = logDate.getTime() - start.getTime();
      const diaNum = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
      return diaNum >= 1 ? `Dia ${diaNum} do Projeto` : 'Antes do Início';
    } catch {
      return '';
    }
  };

  // Logs filtrados
  const filteredLogs = useMemo(() => {
    if (!selectedProjeto) return [];
    const q = buscaLog.toLowerCase().trim();

    return registros
      .filter(r => {
        const matchProjeto = r.projetoCliente === selectedProjeto;
        if (!matchProjeto) return false;
        if (projetosDeletados.has(r.projetoCliente || '')) return false;

        const matchEtapa = filtroModoHistorico === 'todos' 
          ? true 
          : (r.atividade === selectedEtapa || r.atividade.toLowerCase().includes(selectedEtapa.toLowerCase()));

        const matchBusca = !q ||
          r.atividade.toLowerCase().includes(q) ||
          r.responsavel.toLowerCase().includes(q) ||
          (r.observacoes ?? '').toLowerCase().includes(q) ||
          (r.status ?? '').toLowerCase().includes(q);

        return matchEtapa && matchBusca;
      })
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [registros, selectedProjeto, selectedEtapa, filtroModoHistorico, buscaLog, projetosDeletados]);

  // Contagem de logs por projeto
  const logsCountByProjeto = useMemo(() => {
    const counts: Record<string, number> = {};
    registros.forEach(r => {
      if (r.projetoCliente) {
        counts[r.projetoCliente] = (counts[r.projetoCliente] || 0) + 1;
      }
    });
    return counts;
  }, [registros]);

  // Contagem de logs por etapa no projeto selecionado
  const logsCountByEtapa = useMemo(() => {
    const counts: Record<string, number> = {};
    registros.forEach(r => {
      if (r.projetoCliente === selectedProjeto) {
        ETAPAS_CAMPO.forEach(et => {
          if (r.atividade === et.key || r.atividade.toLowerCase().includes(et.key.toLowerCase())) {
            counts[et.key] = (counts[et.key] || 0) + 1;
          }
        });
      }
    });
    return counts;
  }, [registros, selectedProjeto]);

  // ── DADOS E AUXILIARES PARA O RESUMO DA DIRETORIA ──
  const logsResumoDiretoria = useMemo(() => {
    if (!selectedProjeto) return [];
    
    // Filtro por período
    const hoje = new Date();
    hoje.setHours(23, 59, 59, 999);

    return registros
      .filter(r => {
        if (r.projetoCliente !== selectedProjeto) return false;
        if (projetosDeletados.has(r.projetoCliente || '')) return false;

        // Filtro de etapa selecionada no resumo
        const etapaMatch = resumoEtapas.some(et => 
          r.atividade === et || r.atividade.toLowerCase().includes(et.toLowerCase())
        );
        if (!etapaMatch) return false;

        if (resumoPeriodo === 'tudo') return true;

        const logDate = new Date(`${r.data}T00:00:00`);
        const diffDias = Math.floor((hoje.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24));

        if (resumoPeriodo === '7dias') return diffDias <= 7;
        if (resumoPeriodo === '15dias') return diffDias <= 15;
        if (resumoPeriodo === '30dias') return diffDias <= 30;
        return true;
      })
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [registros, selectedProjeto, projetosDeletados, resumoEtapas, resumoPeriodo]);

  // Informações consolidadas de cada etapa para o resumo da diretoria
  const getEtapaResumoInfo = (etapaKey: EtapaCampo) => {
    const key = `${selectedProjeto}::${etapaKey}`;
    const cfg = configEtapas[key] || {
      dataInicio: dataStartProjeto || new Date().toISOString().split('T')[0],
      metaDias: 40,
    };
    const inicio = new Date(`${cfg.dataInicio}T00:00:00`);
    inicio.setHours(0, 0, 0, 0);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diffMs = hoje.getTime() - inicio.getTime();
    const decorridos = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    const restantes = cfg.metaDias - decorridos;
    const resp = responsaveisPorEtapa[key] || [];

    // Último status lançado dessa etapa
    const logsEtapa = registros
      .filter(r => r.projetoCliente === selectedProjeto && (r.atividade === etapaKey || r.atividade.toLowerCase().includes(etapaKey.toLowerCase())))
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    const ultimoLog = logsEtapa[0];

    return {
      cfg,
      decorridos,
      restantes,
      metaDias: cfg.metaDias,
      atrasado: restantes < 0,
      responsaveis: resp,
      ultimoStatus: ultimoLog?.status || 'Dentro do programado',
      ultimoRegistro: ultimoLog?.data || null,
      totalRegistros: logsEtapa.length,
    };
  };

  // Copiar resumo formatado para o WhatsApp
  const handleCopiarWhatsApp = () => {
    const versao = getProjectVersion(selectedProjeto);
    const nomeBase = extractProjectBaseName(selectedProjeto);
    const dataInicioFormatada = new Date(`${dataStartProjeto}T00:00:00`).toLocaleDateString('pt-BR');

    let texto = `📋 *RESUMO EXECUTIVO - DIÁRIO DE CAMPO*\n`;
    texto += `*Projeto:* ${nomeBase} [${versao}]\n`;
    texto += `*Início da Obra:* ${dataInicioFormatada} (Dia ${diaAtualDoProjeto} de Execução)\n`;
    texto += `*Período Analisado:* ${
      resumoPeriodo === '7dias' ? 'Últimos 7 dias' :
      resumoPeriodo === '15dias' ? 'Últimos 15 dias' :
      resumoPeriodo === '30dias' ? 'Últimos 30 dias' : 'Todo o projeto'
    }\n`;
    texto += `─────────────────────────\n`;

    if (recadoDiretoria.trim()) {
      texto += `💬 *PARECER DA EQUIPE DE CAMPO:*\n"${recadoDiretoria.trim()}"\n\n`;
    }

    texto += `📊 *SITUAÇÃO DAS ETAPAS:*\n`;
    resumoEtapas.forEach(etKey => {
      const etMeta = ETAPAS_CAMPO.find(e => e.key === etKey);
      if (!etMeta) return;
      const info = getEtapaResumoInfo(etKey as EtapaCampo);
      const respStr = info.responsaveis.length > 0 ? info.responsaveis.join(', ') : 'Equipe geral';
      const statusIcon = info.ultimoStatus === 'Abaixo' ? '🔴' : (info.ultimoStatus === 'Acima' ? '🔵' : '🟢');

      texto += `• *${etMeta.label}:* ${statusIcon} ${info.ultimoStatus}\n`;
      texto += `  Progresso: ${info.decorridos} de ${info.metaDias} dias (${info.restantes >= 0 ? `${info.restantes}d restantes` : `${Math.abs(info.restantes)}d excedidos`})\n`;
      texto += `  Responsáveis: ${respStr}\n`;
    });

    if (logsResumoDiretoria.length > 0) {
      texto += `\n📝 *PRINCIPAIS OCORRÊNCIAS NO PERÍODO (${logsResumoDiretoria.length}):*\n`;
      // Mostra os últimos 6 logs
      logsResumoDiretoria.slice(0, 6).forEach(log => {
        const dataFmt = new Date(`${log.data}T00:00:00`).toLocaleDateString('pt-BR');
        const diaP = getDiaDoProjetoTexto(log.data);
        texto += `- [${dataFmt} | ${diaP}] *${log.atividade}*: ${log.observacoes ? log.observacoes.slice(0, 100) : 'Sem observações'} (${log.responsavel})\n`;
      });
      if (logsResumoDiretoria.length > 6) {
        texto += `  ...e mais ${logsResumoDiretoria.length - 6} registros detalhados no sistema.\n`;
      }
    }

    texto += `\n_Relatório gerado via Terra Café Irrigação_`;

    navigator.clipboard.writeText(texto);
    setCopiadoWhatsApp(true);
    success('Resumo copiado com sucesso! Pode colar no WhatsApp da diretoria.');
    setTimeout(() => setCopiadoWhatsApp(false), 3000);
  };

  // Imprimir / Salvar PDF
  const handleImprimirResumo = () => {
    window.print();
  };

  const filteredProjetosList = useMemo(() => {
    if (!searchProjeto.trim()) return projetos;
    return projetos.filter(p => p.toLowerCase().includes(searchProjeto.toLowerCase()));
  }, [projetos, searchProjeto]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070c18] text-slate-600 dark:text-slate-300 p-4 md:p-6 lg:p-8 font-sans flex flex-col">
      
      {/* ── HEADER SUPERIOR ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400 mb-2">
            <BackButton />
            <span>Portal</span>
            <ChevronRight className="w-4 h-4" />
            <span>Irrigação</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-blue-600 dark:text-blue-400 font-medium">Diário de Campo</span>
          </nav>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
              <Droplets className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Diário de Campo & Acompanhamento de Etapas</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Acompanhe o start da obra, etapas operacionais e atribua responsáveis por atividade</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </div>

      {/* ── CORPO PRINCIPAL: SIDEBAR DE PROJETOS + PAINEL DO PROJETO ── */}
      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">

        {/* ── COLUNA ESQUERDA: LISTA DE PROJETOS ── */}
        <div className="w-full lg:w-80 flex flex-col gap-4 bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-4 shadow-xl shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-blue-500" />
              Projetos de Campo
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 dark:text-blue-400 font-medium border border-blue-500/20">
                {projetos.length}
              </span>
              <button
                type="button"
                onClick={() => {
                  setNewProjectName('');
                  setNewProjectDeadline('');
                  setIsNewProjectModalOpen(true);
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 shadow-sm transition-all active:scale-95"
                title="Criar novo projeto com prazo final"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo</span>
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input 
              type="text" 
              placeholder="Buscar projeto..." 
              value={searchProjeto} 
              onChange={(e) => setSearchProjeto(e.target.value)} 
              className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors" 
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[calc(100vh-280px)]">
            {loadingProjetos && (
              <>
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#070c18] border border-slate-200/60 dark:border-[#1e293b] space-y-2 animate-pulse">
                    <div className="h-3.5 bg-slate-200 dark:bg-[#1e293b] rounded w-3/4" />
                    <div className="h-2.5 bg-slate-200 dark:bg-[#1e293b] rounded w-1/2" />
                  </div>
                ))}
              </>
            )}

            {!loadingProjetos && filteredProjetosList.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-xs px-2">
                <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
                <p>Nenhum projeto encontrado.</p>
                <p className="text-[11px] mt-1 text-slate-500">Crie fases com projetos no Painel Operacional para que eles apareçam aqui.</p>
              </div>
            )}

            {!loadingProjetos && filteredProjetosList.map(proj => {
              const isSelected = selectedProjeto === proj;
              const totalLogs = logsCountByProjeto[proj] || 0;

              return (
                <button 
                  key={proj} 
                  onClick={() => setSelectedProjeto(proj)} 
                  className={`w-full text-left p-3.5 rounded-xl transition-all flex items-center justify-between gap-3 border ${
                    isSelected 
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/30' 
                      : 'bg-slate-50 dark:bg-[#070c18] border-slate-200 dark:border-[#1e293b] text-slate-800 dark:text-slate-200 hover:border-blue-500/50 hover:bg-slate-100 dark:hover:bg-[#111a30]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-500'}`} />
                      <p className="font-semibold text-sm truncate">{extractProjectBaseName(proj)}</p>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border shrink-0 ${
                        isSelected
                          ? 'bg-white/20 text-white border-white/30'
                          : getProjectVersion(proj) === 'V0'
                            ? 'bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/20'
                            : 'bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/30'
                      }`}>
                        {getProjectVersion(proj)}
                      </span>
                    </div>
                    <p className={`text-xs mt-1 truncate ${isSelected ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                      {totalLogs} registro{totalLogs !== 1 ? 's' : ''} no diário
                    </p>
                  </div>
                  <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isSelected ? 'rotate-90 text-white' : 'text-slate-400'}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* ── COLUNA DIREITA: CONTEÚDO DO PROJETO SELECIONADO ── */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          {selectedProjeto ? (
            <>
              {/* ── CABEÇALHO DO PROJETO: INDICADOR DE START & DIA DO PROJETO ── */}
              <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-5 md:p-6 shadow-xl space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-[#1e293b] pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        Projeto em Execução
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Início: {new Date(`${dataStartProjeto}T00:00:00`).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">
                        {extractProjectBaseName(selectedProjeto)}
                      </h2>
                      <span className={`px-2 py-0.5 rounded text-xs font-extrabold border shrink-0 ${
                        getProjectVersion(selectedProjeto) === 'V0'
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30 ring-1 ring-amber-400/20'
                      }`}>
                        {getProjectVersion(selectedProjeto)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Badge destacado: Dia X do Projeto */}
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-600 dark:text-blue-300 font-bold text-sm shadow-sm">
                      <Flag className="w-4 h-4 text-blue-500" />
                      <span>Dia {diaAtualDoProjeto} do Projeto</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenProjectStartModal}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-[#111a30] border border-slate-200 dark:border-[#1e293b] text-slate-700 dark:text-slate-300 hover:border-blue-400 flex items-center gap-1.5 transition-all"
                      title="Alterar data de start da obra"
                    >
                      <Calendar className="w-3.5 h-3.5 text-blue-500" />
                      Ajustar Start
                    </button>

                    {/* Botão de Resumo para a Diretoria */}
                    <button
                      type="button"
                      onClick={() => setIsResumoModalOpen(true)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white flex items-center gap-2 shadow-md shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                      title="Gerar resumo executivo personalizado para enviar ao diretor"
                    >
                      <FileText className="w-3.5 h-3.5 text-white" />
                      <span>Resumo p/ Diretoria</span>
                    </button>
                  </div>
                </div>

                {/* ── SELETOR DE RESPONSÁVEIS DESTA ETAPA (BRUNO EM VALETAS, ETC.) ── */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        Responsáveis na Etapa (<strong className="capitalize text-blue-500">{selectedEtapa}</strong>):
                      </span>
                      <span className="text-xs text-slate-400">
                        ({currentEtapaResponsaveis.length} selecionado{currentEtapaResponsaveis.length !== 1 ? 's' : ''})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <button 
                        type="button"
                        onClick={selectAllResponsaveisNaEtapa}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        Marcar Todos Nesta Etapa
                      </button>
                      <span className="text-slate-300 dark:text-slate-600">•</span>
                      <button 
                        type="button"
                        onClick={clearResponsaveisNaEtapa}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        Limpar
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                    Clique para atribuir os colaboradores desta etapa (o mesmo responsável pode atuar em mais de uma etapa):
                  </p>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {loadingUsers && (
                      <span className="text-xs text-slate-400 italic">Carregando equipe de campo...</span>
                    )}
                    {!loadingUsers && users.length === 0 && (
                      <span className="text-xs text-slate-400 italic">Nenhum responsável cadastrado. Adicione responsáveis na aba Responsáveis.</span>
                    )}
                    {!loadingUsers && users.map(user => {
                      const isSelected = currentEtapaResponsaveis.includes(user.name);
                      return (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => toggleResponsavelNaEtapa(user.name)}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                            isSelected
                              ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-900/20 ring-1 ring-blue-400'
                              : 'bg-slate-50 dark:bg-[#070c18] border-slate-200 dark:border-[#1e293b] text-slate-600 dark:text-slate-300 hover:border-blue-400'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}>
                            {isSelected ? <Check className="w-3 h-3 text-white" /> : user.avatar}
                          </div>
                          <span>{user.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── NAVEGAÇÃO DAS 5 ETAPAS DO DIÁRIO DE CAMPO (ORDEM FIXA) ── */}
              <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-2 shadow-xl overflow-x-auto">
                <div className="flex items-center gap-2 min-w-max p-1">
                  {ETAPAS_CAMPO.map((etapa, idx) => {
                    const isActive = selectedEtapa === etapa.key;
                    const count = logsCountByEtapa[etapa.key] || 0;
                    const respDestaEtapa = responsaveisPorEtapa[`${selectedProjeto}::${etapa.key}`] || [];
                    
                    // Verifica se esta etapa específica está concluída
                    const etapaFaseConcluida = registros.some(
                      r => r.projetoCliente === selectedProjeto && 
                           r.atividade === etapa.key && 
                           r.status === 'Concluído'
                    );

                    return (
                      <button
                        key={etapa.key}
                        type="button"
                        onClick={() => setSelectedEtapa(etapa.key)}
                        className={`flex items-center gap-2.5 px-4 py-3 rounded-xl font-medium text-sm transition-all border relative ${
                          isActive
                            ? etapaFaseConcluida
                              ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/30'
                              : 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/30'
                            : etapaFaseConcluida
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:border-emerald-400'
                            : 'bg-slate-50 dark:bg-[#070c18] border-slate-200 dark:border-[#1e293b] text-slate-700 dark:text-slate-300 hover:border-blue-400/50 hover:bg-slate-100 dark:hover:bg-[#111a30]'
                        }`}
                      >
                        {etapaFaseConcluida && (
                          <CheckCircle2 className={`w-4 h-4 absolute top-1 right-1 ${isActive ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
                        )}
                        <span className="text-base">{etapa.icon}</span>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded ${
                              isActive 
                                ? 'bg-white/20 text-white' 
                                : etapaFaseConcluida
                                ? 'bg-emerald-200 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                            }`}>
                              0{idx + 1}
                            </span>
                            <span className="font-semibold">{etapa.label}</span>
                          </div>
                          {respDestaEtapa.length > 0 && (
                            <span className={`text-[10px] block truncate max-w-[130px] mt-0.5 ${
                              isActive 
                                ? 'text-blue-100' 
                                : etapaFaseConcluida
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-400'
                            }`}>
                              {respDestaEtapa.join(', ')}
                            </span>
                          )}
                        </div>
                        {count > 0 && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ml-1 ${
                            isActive 
                              ? 'bg-white text-blue-700' 
                              : etapaFaseConcluida
                              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                              : 'bg-blue-500/10 text-blue-500 dark:text-blue-400'
                          }`}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── CARD DE CONTADOR INDEPENDENTE DA ETAPA ATIVA ── */}
              <div className={`bg-gradient-to-br p-5 md:p-6 rounded-2xl border shadow-xl relative overflow-hidden transition-all duration-300 ${
                isFaseConcluida
                  ? 'from-emerald-50 via-emerald-100/50 to-emerald-50 dark:from-emerald-950/30 dark:via-emerald-900/20 dark:to-emerald-950/20 border-emerald-500/50 dark:border-emerald-500/30'
                  : 'from-white via-slate-50 to-blue-50/40 dark:from-[#0d1527] dark:via-[#0c1426] dark:to-[#111c36] border-slate-200 dark:border-[#1e293b]'
              }`}>
                {/* Badge de Status no Canto Superior Direito */}
                {isFaseConcluida && (
                  <div className="absolute top-4 right-4 z-20">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-xs font-black shadow-lg shadow-emerald-500/40 animate-pulse">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>100% CONCLUÍDA</span>
                    </div>
                  </div>
                )}

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Clock className={`w-4 h-4 ${isFaseConcluida ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-500'}`} />
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Contador da Etapa: <strong className={`capitalize ${isFaseConcluida ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-white'}`}>{selectedEtapa}</strong>
                      </span>
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className={`text-3xl md:text-4xl font-extrabold tracking-tight ${
                        isFaseConcluida 
                          ? 'text-emerald-600 dark:text-emerald-400' 
                          : 'text-slate-900 dark:text-white'
                      }`}>
                        Dia {statsContador.diasDecorridos}
                      </span>
                      <span className="text-sm font-semibold text-slate-400">
                        / meta de {statsContador.metaDias} dias
                      </span>
                      {isFaseConcluida && (
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-2 py-1 rounded-md">
                          ✓ Finalizada
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>Início da etapa: <strong className="text-slate-700 dark:text-slate-200">{new Date(`${statsContador.dataInicio}T00:00:00`).toLocaleDateString('pt-BR')}</strong></span>
                      <span>•</span>
                      <span>Prazo da Fase: <strong className={isFaseConcluida ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}>{statsContador.prazoLimiteFormatado}</strong></span>
                      {projetosPrazoFinal[selectedProjeto] && (
                        <>
                          <span>•</span>
                          <span className="text-purple-600 dark:text-purple-400 font-semibold">
                            Prazo Final Total da Obra: {new Date(`${projetosPrazoFinal[selectedProjeto]}T00:00:00`).toLocaleDateString('pt-BR')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className={`px-4 py-2 rounded-xl border text-sm font-bold flex items-center gap-2 ${
                      statsContador.atrasado
                        ? 'bg-rose-500/15 border-rose-500/30 text-rose-500 dark:text-rose-400'
                        : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {statsContador.atrasado ? (
                        <>
                          <AlertCircle className="w-4 h-4 text-rose-500" />
                          <span>+{Math.abs(statsContador.diasRestantes)} dias além da meta da fase</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span>{statsContador.diasRestantes} dias restantes na fase</span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenIniciarEtapaModal}
                      disabled={isFaseConcluida}
                      className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 shadow-sm transition-all ${
                        isFaseConcluida
                          ? 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400 cursor-not-allowed'
                          : statsContador.hasStarted
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20'
                          : 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20'
                      }`}
                      title={
                        isFaseConcluida
                          ? 'Fase concluída - configuração bloqueada'
                          : statsContador.hasStarted
                          ? `Fase iniciada em ${statsContador.dataInicio} com meta de ${statsContador.metaDias} dias. Clique para ajustar.`
                          : 'Definir início e prazo desta fase específica'
                      }
                    >
                      <Calendar className={`w-3.5 h-3.5 ${
                        isFaseConcluida 
                          ? 'text-slate-400' 
                          : statsContador.hasStarted 
                          ? 'text-emerald-500' 
                          : 'text-blue-500'
                      }`} />
                      {statsContador.hasStarted ? '✓ Fase Configurada' : 'Definir Início / Prazo da Fase'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!isFaseConcluida) {
                          setJustificativaMotivo('Chuva no dia');
                          setJustificativaTexto('');
                          setIsJustificativaModalOpen(true);
                        }
                      }}
                      disabled={isFaseConcluida}
                      className={`px-3.5 py-2.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 shadow-sm transition-all ${
                        isFaseConcluida
                          ? 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400 cursor-not-allowed'
                          : 'bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25'
                      }`}
                      title={
                        isFaseConcluida
                          ? 'Fase concluída - justificativas bloqueadas'
                          : 'Registrar ocorrências de campo (chuva, quebras, atrasos) para justificativa do diretor Paulo'
                      }
                    >
                      <CloudRain className={`w-4 h-4 ${isFaseConcluida ? 'text-slate-400' : 'text-amber-500'}`} />
                      Registrar Justificativa / Ocorrência
                    </button>

                    {/* Botão Concluir Fase */}
                    {!isFaseConcluida ? (
                      <button
                        type="button"
                        onClick={() => {
                          setObservacaoConclusao('');
                          setIsConcluirFaseModalOpen(true);
                        }}
                        className="px-4 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all hover:scale-105 active:scale-95 border-2 border-emerald-400/50"
                        title="Marcar esta fase como 100% concluída"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Concluir Fase</span>
                        <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-md">100%</span>
                      </button>
                    ) : (
                      <div className="px-4 py-2.5 rounded-xl text-xs font-black bg-emerald-500/20 border-2 border-emerald-500/50 text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>✅ Fase Concluída</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Barra de progresso do contador */}
                <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-[#1e293b]/60 relative z-10">
                  <div className="flex justify-between items-center text-xs text-slate-500 mb-1.5">
                    <span className="flex items-center gap-1">
                      <span>{isFaseConcluida ? 'Fase concluída' : 'Evolução do tempo na etapa'}</span>
                      {!isFaseConcluida && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-500 font-semibold">
                          🔒 Meta Fixa Inalterável ({statsContador.metaDias}d)
                        </span>
                      )}
                    </span>
                    <span className={`font-semibold ${isFaseConcluida ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>
                      {isFaseConcluida ? '100% Concluída ✓' : `${statsContador.pct}% do prazo previsto`}
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        isFaseConcluida
                          ? 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 animate-pulse'
                          : statsContador.atrasado 
                          ? 'bg-rose-500' 
                          : 'bg-gradient-to-r from-blue-500 to-emerald-500'
                      }`}
                      style={{ width: isFaseConcluida ? '100%' : `${Math.min(100, statsContador.pct)}%` }}
                    />
                  </div>
                  {isFaseConcluida && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-2 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Esta fase foi marcada como 100% concluída pela equipe de campo
                    </p>
                  )}
                </div>

                {/* ── Progresso da Fase (editável pela equipe de campo) ── */}
                {!isFaseConcluida && (
                  <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-[#1e293b]/60 relative z-10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5" />
                        Conclusão da Fase (% real)
                      </span>
                      <span className="text-xs font-black text-slate-700 dark:text-slate-200">
                        {progressoManual[currentConfigKey] !== undefined
                          ? `${progressoManual[currentConfigKey]}%`
                          : 'Automático'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2.5">
                      Arraste para atualizar o quanto da fase está realmente concluído. Se não mudar, o sistema calcula pelo tempo.
                    </p>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={progressoManual[currentConfigKey] ?? statsContador.pct}
                      onChange={e => {
                        const v = Number(e.target.value);
                        const chave = currentConfigKey;
                        const updated = { ...progressoManual, [chave]: v };
                        setProgressoManual(updated);
                        try { localStorage.setItem('diario_etapas_progresso_v1', JSON.stringify(updated)); } catch (_) {}
                      }}
                      onMouseUp={e => handleSalvarProgresso(Number((e.target as HTMLInputElement).value))}
                      onTouchEnd={e => handleSalvarProgresso(Number((e.currentTarget as HTMLInputElement).value))}
                      className="w-full h-2 rounded-full appearance-none cursor-pointer accent-blue-500"
                      style={{
                        background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${progressoManual[currentConfigKey] ?? statsContador.pct}%, #e2e8f0 ${progressoManual[currentConfigKey] ?? statsContador.pct}%, #e2e8f0 100%)`,
                      }}
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>0%</span>
                      <div className="flex gap-2">
                        {[25, 50, 75].map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => handleSalvarProgresso(v)}
                            className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 hover:bg-blue-500/20 text-slate-600 dark:text-slate-400 hover:text-blue-600 transition-colors"
                          >{v}%</button>
                        ))}
                      </div>
                      <span>100%</span>
                    </div>
                    {savingProgresso && (
                      <p className="text-[10px] text-blue-500 mt-1 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Salvando...
                      </p>
                    )}
                  </div>
                )}

                {/* Justificativas Registradas para este Projeto */}
                {projetoJustificativas[selectedProjeto] && projetoJustificativas[selectedProjeto].length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-[#1e293b]/60 relative z-10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Ocorrências / Justificativas Registradas ({projetoJustificativas[selectedProjeto].length}):
                      </span>
                      <span className="text-[10px] text-slate-400">Visível ao Diretor Paulo</span>
                    </div>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {projetoJustificativas[selectedProjeto].map((j) => (
                        <div key={j.id} className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-slate-700 dark:text-slate-300">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-amber-700 dark:text-amber-300">{j.motivo}</span>
                            <span className="text-slate-400 text-[10px]">
                              {new Date(`${j.data}T00:00:00`).toLocaleDateString('pt-BR')} por <strong className="text-slate-600 dark:text-slate-300">{j.autor}</strong>
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                            {j.observacao}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── BOTOEIRA RÁPIDA DE STATUS CLICÁVEL & FORMULÁRIO ── */}
              <form onSubmit={handleSalvarDiario} className={`rounded-2xl p-5 md:p-6 shadow-xl space-y-5 transition-all ${
                isFaseConcluida
                  ? 'bg-slate-100 dark:bg-slate-900/20 border-2 border-slate-300 dark:border-slate-700 opacity-60'
                  : 'bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b]'
              }`}>
                {/* Aviso de fase concluída */}
                {isFaseConcluida && (
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 border-2 border-emerald-500/50 dark:border-emerald-500/30 rounded-xl p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-100 mb-1">
                          ✅ Fase Concluída - Registro Bloqueado
                        </h4>
                        <p className="text-xs text-emerald-800 dark:text-emerald-200 leading-relaxed">
                          Esta fase foi marcada como 100% concluída. Para fazer novos registros, entre em contato com o diretor para reabrir a fase.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#1e293b] pb-3">
                  <div className="flex items-center gap-2">
                    <Plus className={`w-4 h-4 ${isFaseConcluida ? 'text-slate-400' : 'text-blue-500'}`} />
                    <h3 className={`text-base font-bold ${isFaseConcluida ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                      Registrar Andamento em <span className={`capitalize ${isFaseConcluida ? 'text-slate-500' : 'text-blue-500'}`}>{selectedEtapa}</span>
                      {isFaseConcluida && <span className="ml-2 text-xs font-normal">(bloqueado)</span>}
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400 hidden sm:inline">
                    {isFaseConcluida ? 'Fase concluída' : 'Não precisa digitar sempre: clique no status do dia!'}
                  </span>
                </div>

                {/* Botoeira com 3 opções principais de 1 clique */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">
                    1. Como está o andamento desta etapa hoje?
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Botão: Dentro do programado */}
                    <button
                      type="button"
                      onClick={() => !isFaseConcluida && setStatusRapido('Dentro do programado')}
                      disabled={isFaseConcluida}
                      className={`p-4 rounded-xl border-2 text-left transition-all relative flex flex-col justify-between gap-2 ${
                        isFaseConcluida
                          ? 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/20 opacity-50 cursor-not-allowed'
                          : statusRapido === 'Dentro do programado'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 shadow-lg shadow-emerald-900/10 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#070c18] hover:border-emerald-500/50 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold uppercase tracking-wider ${isFaseConcluida ? 'text-slate-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          Programado
                        </span>
                        <CheckCircle2 className={`w-5 h-5 ${isFaseConcluida ? 'text-slate-400' : statusRapido === 'Dentro do programado' ? 'text-emerald-500' : 'text-slate-400'}`} />
                      </div>
                      <p className={`font-bold text-base ${isFaseConcluida ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>Dentro do programado</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Ritmo normal de obra e sem gargalos</p>
                    </button>

                    {/* Botão: Acima */}
                    <button
                      type="button"
                      onClick={() => !isFaseConcluida && setStatusRapido('Acima')}
                      disabled={isFaseConcluida}
                      className={`p-4 rounded-xl border-2 text-left transition-all relative flex flex-col justify-between gap-2 ${
                        isFaseConcluida
                          ? 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/20 opacity-50 cursor-not-allowed'
                          : statusRapido === 'Acima'
                          ? 'border-blue-500 bg-blue-500/10 text-blue-950 dark:text-blue-100 shadow-lg shadow-blue-900/10 ring-2 ring-blue-500/20'
                          : 'border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#070c18] hover:border-blue-500/50 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold uppercase tracking-wider ${isFaseConcluida ? 'text-slate-400' : 'text-blue-600 dark:text-blue-400'}`}>
                          Adiantado
                        </span>
                        <TrendingUp className={`w-5 h-5 ${isFaseConcluida ? 'text-slate-400' : statusRapido === 'Acima' ? 'text-blue-500' : 'text-slate-400'}`} />
                      </div>
                      <p className={`font-bold text-base ${isFaseConcluida ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>Acima do previsto</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Rendimento alto e avanço adiantado</p>
                    </button>

                    {/* Botão: Abaixo */}
                    <button
                      type="button"
                      onClick={() => !isFaseConcluida && setStatusRapido('Abaixo')}
                      disabled={isFaseConcluida}
                      className={`p-4 rounded-xl border-2 text-left transition-all relative flex flex-col justify-between gap-2 ${
                        isFaseConcluida
                          ? 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/20 opacity-50 cursor-not-allowed'
                          : statusRapido === 'Abaixo'
                          ? 'border-rose-500 bg-rose-500/10 text-rose-950 dark:text-rose-100 shadow-lg shadow-rose-900/10 ring-2 ring-rose-500/20'
                          : 'border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#070c18] hover:border-rose-500/50 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold uppercase tracking-wider ${isFaseConcluida ? 'text-slate-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          Atrasado
                        </span>
                        <TrendingDown className={`w-5 h-5 ${isFaseConcluida ? 'text-slate-400' : statusRapido === 'Abaixo' ? 'text-rose-500' : 'text-slate-400'}`} />
                      </div>
                      <p className={`font-bold text-base ${isFaseConcluida ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>Abaixo do previsto</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Ritmo lento, clima ou aguardo de insumos</p>
                    </button>
                  </div>
                </div>

                {/* Caixa de Observação opcional */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                    2. Observações adicionais (opcional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder={isFaseConcluida ? "Campo desabilitado - fase concluída" : "Se desejar escrever algo específico sobre o dia de hoje, detalhe aqui (opcional)..."}
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    disabled={isFaseConcluida}
                    className={`w-full border rounded-xl p-3 text-sm transition-colors resize-none ${
                      isFaseConcluida
                        ? 'bg-slate-100 dark:bg-slate-900/20 border-slate-300 dark:border-slate-700 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-50 dark:bg-[#070c18] border-slate-200 dark:border-[#1e293b] text-slate-900 dark:text-white focus:outline-none focus:border-blue-500'
                    }`}
                  />
                </div>

                {/* Anexo de Foto/Vídeo e Botão Salvar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-3">
                    <label className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
                      isFaseConcluida
                        ? 'bg-slate-100 dark:bg-slate-900/20 text-slate-400 border-slate-300 dark:border-slate-700 cursor-not-allowed'
                        : 'bg-slate-100 dark:bg-[#111a30] hover:bg-slate-200 dark:hover:bg-[#1e293b] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#1e293b] cursor-pointer'
                    }`}>
                      <Paperclip className={`w-4 h-4 ${isFaseConcluida ? 'text-slate-400' : 'text-blue-500'}`} />
                      <span>{isFaseConcluida ? 'Anexo Bloqueado' : 'Anexar Foto / Vídeo'}</span>
                      {!isFaseConcluida && <input type="file" accept="image/*,video/*" className="hidden" onChange={handleMidiaChange} />}
                    </label>

                    {midiaPreview && (
                      <div className="relative inline-flex items-center gap-2 px-2.5 py-1.5 bg-slate-100 dark:bg-[#111a30] rounded-xl border border-slate-300 dark:border-slate-700 text-xs">
                        {midiaTipo === 'image' ? (
                          <div className="relative w-8 h-8 rounded-lg overflow-hidden">
                            <Image src={midiaPreview} alt="preview" fill className="object-cover" unoptimized />
                          </div>
                        ) : (
                          <Video className="w-4 h-4 text-blue-400" />
                        )}
                        <span className="text-slate-700 dark:text-slate-200 truncate max-w-[120px]">{midiaFile?.name}</span>
                        <button type="button" onClick={clearMidia} className="p-1 rounded-full hover:bg-rose-500/20 text-rose-500">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={saving || uploadingMidia || isFaseConcluida}
                    className={`px-6 py-3 rounded-xl font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2 ${
                      isFaseConcluida
                        ? 'bg-slate-400 dark:bg-slate-700 text-slate-200 dark:text-slate-400 cursor-not-allowed opacity-50'
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-900/25 disabled:opacity-60'
                    }`}
                  >
                    {(saving || uploadingMidia) ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Salvando registro...</span>
                      </>
                    ) : isFaseConcluida ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Fase Concluída - Registro Bloqueado</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Salvar no Diário ({selectedEtapa})</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* ── HISTÓRICO / TIMELINE DE ATIVIDADES DESTA ETAPA ── */}
              <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl p-5 md:p-6 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-[#1e293b] pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-500" />
                      Histórico Registrado
                    </h3>
                    <p className="text-xs text-slate-400">
                      {filtroModoHistorico === 'etapa' 
                        ? `Registros da etapa: ${selectedEtapa}` 
                        : `Todos os registros do projeto ${selectedProjeto}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Toggle de visualização */}
                    <div className="flex items-center bg-slate-100 dark:bg-[#070c18] p-1 rounded-xl border border-slate-200 dark:border-[#1e293b] text-xs">
                      <button
                        type="button"
                        onClick={() => setFiltroModoHistorico('etapa')}
                        className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                          filtroModoHistorico === 'etapa'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Apenas {selectedEtapa}
                      </button>
                      <button
                        type="button"
                        onClick={() => setFiltroModoHistorico('todos')}
                        className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                          filtroModoHistorico === 'todos'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Todas as Etapas
                      </button>
                    </div>

                    {/* Campo de busca nos registros */}
                    <div className="relative w-full sm:w-48">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Buscar nos logs..."
                        value={buscaLog}
                        onChange={(e) => setBuscaLog(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                      />
                      {buscaLog && (
                        <button onClick={() => setBuscaLog('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Lista Timeline */}
                {loadingLogs ? (
                  <div className="space-y-4 py-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="p-4 rounded-xl bg-slate-50 dark:bg-[#070c18] animate-pulse space-y-2">
                        <div className="h-4 bg-slate-200 dark:bg-[#1e293b] rounded w-1/4" />
                        <div className="h-3 bg-slate-200 dark:bg-[#1e293b] rounded w-3/4" />
                      </div>
                    ))}
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30 text-slate-400" />
                    <p className="font-semibold text-sm text-slate-700 dark:text-slate-300">Nenhum registro encontrado</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {buscaLog
                        ? `Nenhum registro para "${buscaLog}".`
                        : `Ainda não há registros para a etapa "${selectedEtapa}". Use a botoeira acima para registrar.`}
                    </p>
                  </div>
                ) : (
                  <div className="relative border-l-2 border-slate-200 dark:border-[#1e293b] ml-4 space-y-6 pt-2 pb-4">
                    {filteredLogs.map((log) => {
                      const conf = getStatusConfig(log.status);
                      const Icon = conf.icon;
                      const isConfigUpdate = (log.status || '').toLowerCase().includes('configuração') || (log.status || '').toLowerCase().includes('atualizada');
                      const dateObj = new Date(`${log.data}T00:00:00`);
                      const isToday = log.data === new Date().toISOString().split('T')[0];
                      const dataFormatada = isToday 
                        ? 'Hoje' 
                        : dateObj.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
                      
                      const diaDoProjetoLabel = getDiaDoProjetoTexto(log.data);

                      return (
                        <div key={log.id} className="relative pl-7 md:pl-8 group">
                          {/* Marcador na linha do tempo */}
                          <div className={`absolute -left-[17px] top-1.5 w-8 h-8 rounded-full border-4 flex items-center justify-center shadow-md ${
                            isConfigUpdate
                              ? 'border-violet-200 dark:border-violet-900 bg-violet-100 dark:bg-violet-950'
                              : 'border-white dark:border-[#0d1527] bg-slate-100 dark:bg-[#111a30]'
                          }`}>
                            <Icon className={`w-4 h-4 ${conf.color.split(' ')[0]}`} />
                          </div>

                          <div className={`border rounded-xl p-4.5 hover:border-blue-500/40 transition-colors shadow-sm relative space-y-2.5 ${
                            isConfigUpdate
                              ? 'bg-violet-50 dark:bg-violet-950/20 border-violet-300 dark:border-violet-800/50'
                              : 'bg-slate-50 dark:bg-[#070c18] border-slate-200 dark:border-[#1e293b]'
                          }`}>
                            {/* Botão de excluir */}
                            <button
                              type="button"
                              onClick={() => handleDeleteLog(log.id)}
                              className="absolute top-3 right-3 p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                              title="Excluir este registro"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Topo do card: Dia do Projeto, data, etapa e status */}
                            <div className="flex flex-wrap items-center gap-2 pr-8">
                              {diaDoProjetoLabel && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-blue-600 text-white shadow-sm">
                                  <Flag className="w-3 h-3" />
                                  {diaDoProjetoLabel}
                                </span>
                              )}
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 capitalize">
                                {dataFormatada}
                              </span>
                              <span className="text-slate-400">•</span>
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-md bg-blue-500/10 text-blue-500 dark:text-blue-400 border border-blue-500/20 capitalize">
                                <Layers className="w-3 h-3" />
                                {log.atividade}
                              </span>
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${conf.color}`}>
                                {log.status}
                              </span>
                            </div>

                            {/* Responsáveis envolvidos */}
                            {log.responsavel && (
                              <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                                <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span className="font-semibold text-slate-700 dark:text-slate-200">Equipe nesta Etapa:</span>
                                <span className="truncate">{log.responsavel}</span>
                              </div>
                            )}

                            {/* Observações / Motivos */}
                            {log.observacoes && (
                              <p className={`text-sm p-3 rounded-lg border leading-relaxed ${
                                log.observacoes.startsWith('⏱️')
                                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-950 dark:text-amber-200 font-medium'
                                  : 'bg-white dark:bg-[#0d1527] border-slate-200/80 dark:border-[#1e293b] text-slate-800 dark:text-slate-200'
                              }`}>
                                {log.observacoes}
                              </p>
                            )}

                            {/* Mídia anexada */}
                            {log.midiaUrl && log.midiaTipo === 'image' && (
                              <a href={log.midiaUrl} target="_blank" rel="noopener noreferrer" className="block mt-2">
                                <div className="relative w-full max-w-sm h-48 rounded-lg overflow-hidden border border-slate-200 dark:border-[#1e293b] hover:opacity-95 transition-opacity">
                                  <Image src={log.midiaUrl} alt="Foto da obra" fill className="object-cover" />
                                </div>
                                <span className="text-[10px] text-slate-400 mt-1 block">Clique para ver em tamanho real</span>
                              </a>
                            )}

                            {log.midiaUrl && log.midiaTipo === 'video' && (
                              <div className="mt-2">
                                <video src={log.midiaUrl} controls className="rounded-lg max-h-48 w-full border border-slate-200 dark:border-[#1e293b]" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl flex items-center justify-center p-12 shadow-xl">
              <div className="text-center text-slate-400 max-w-md">
                <Briefcase className="w-14 h-14 mx-auto mb-3 opacity-25 text-blue-500" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Selecione um Projeto</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Selecione um projeto de irrigação na barra lateral para ver as etapas, contadores e registrar o diário de campo com sua equipe.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL: AJUSTAR DATA DE START DO PROJETO ── */}
      {isProjectStartModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329]">
              <div className="flex items-center gap-2">
                <Flag className="w-5 h-5 text-blue-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Data de Início do Projeto ({selectedProjeto})
                </h3>
              </div>
              <button onClick={() => setIsProjectStartModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-[#1e293b] text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Essa data define o <strong>Dia 1 do Projeto</strong> para cálculo de todos os dias decorridos da obra e rótulos no histórico.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Data de Start Oficial:
                </label>
                <input
                  type="date"
                  value={tempProjectStartDate}
                  onChange={(e) => setTempProjectStartDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl p-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsProjectStartModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e293b]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveProjectStartModal}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-900/20"
              >
                Salvar Início do Projeto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: NOVO PROJETO (CRIADO DIRETAMENTE NO DIÁRIO DE CAMPO) ── */}
      {isNewProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Novo Projeto de Irrigação
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Inicializa automaticamente as 6 fases oficiais
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsNewProjectModalOpen(false)} 
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-[#1e293b] text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewProject} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  1. Nome do Projeto / Fazenda: *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Fazenda Boa Esperança - Setor Sul"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl p-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  2. Prazo Final da Obra (Imutável): *
                </label>
                <input
                  type="date"
                  required
                  value={newProjectDeadline}
                  onChange={(e) => setNewProjectDeadline(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl p-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  Regra de Governança da Diretoria
                </div>
                <p className="text-[11px] leading-relaxed">
                  O prazo final definido aqui é fixo e não poderá ser aumentado. Em caso de atrasos por chuva, quebras ou peças, utilize o botão <strong>Registrar Justificativa</strong> no Diário de Campo para prestar contas ao Diretor Paulo.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-slate-600 dark:text-slate-400">
                <span className="font-semibold text-slate-900 dark:text-white block mb-1">6 Fases Criadas Automaticamente:</span>
                <span className="text-[11px]">⛏️ Valetas • 🌱 Montagem Campo • ⚙️ Casa de Bombas • ⚡ Elétrica • 💧 Lavagem/Testes • 📋 Entrega Técnica</span>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-[#1e293b] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewProjectModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e293b]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingProject}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white flex items-center gap-2 shadow-md shadow-blue-900/20"
                >
                  {creatingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {creatingProject ? 'Criando Projeto...' : 'Criar Projeto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: REGISTRAR JUSTIFICATIVA OFICIAL DE CAMPO (SUBSTITUI AJUSTE DE META) ── */}
      {isJustificativaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                  <CloudRain className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Registrar Justificativa de Campo
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                    {selectedProjeto} • Etapa: {selectedEtapa}
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsJustificativaModalOpen(false)} 
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-[#1e293b] text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#111a30] border border-slate-200 dark:border-[#1e293b] flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Regra de Prazo:</span>
                <span className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  🔒 Meta e Prazo Fixos (Inalteráveis)
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Motivo Principal da Ocorrência:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { id: 'Chuva no dia', label: '🌧️ Chuva no dia' },
                    { id: 'Problema Técnico / Máquina', label: '⚠️ Problema Técnico' },
                    { id: 'Aguardando Peças / Entrega', label: '⏳ Aguardando Peças' },
                    { id: 'Falta de Energia Elétrica', label: '⚡ Falta de Energia' },
                    { id: 'Ajuste de Projeto / Cliente', label: '📐 Ajuste de Projeto' },
                    { id: 'Outro Imprevisto de Campo', label: '🚜 Outro Imprevisto' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setJustificativaMotivo(item.id)}
                      className={`p-2 rounded-xl border text-xs font-medium text-left transition-all ${
                        justificativaMotivo === item.id
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500'
                          : 'bg-slate-50 dark:bg-[#070c18] border-slate-200 dark:border-[#1e293b] text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Detalhamento da Ocorrência (Obrigatório): *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Ex: Chuva torrencial durante toda a tarde impediu os trabalhos da equipe na abertura de valas..."
                  value={justificativaTexto}
                  onChange={(e) => setJustificativaTexto(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 resize-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Esta justificativa ficará salva no histórico permanente para auditoria do Diretor Paulo.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsJustificativaModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e293b]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingJustificativa || !justificativaTexto.trim()}
                onClick={handleSaveJustificativa}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white flex items-center gap-2 shadow-md shadow-amber-900/20"
              >
                {savingJustificativa ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {savingJustificativa ? 'Gravando...' : 'Salvar Justificativa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: DEFINIR INÍCIO E PRAZO DA FASE ESPECÍFICA ── */}
      {isIniciarEtapaModalOpen && (
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
                    {selectedProjeto} • Fase: {selectedEtapa}
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsIniciarEtapaModalOpen(false)} 
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-[#1e293b] text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {projetosPrazoFinal[selectedProjeto] && (
                <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/25 text-purple-700 dark:text-purple-300 text-xs">
                  <span className="font-bold block">Prazo Final Total da Obra:</span>
                  <span className="text-sm font-black">
                    {new Date(`${projetosPrazoFinal[selectedProjeto]}T00:00:00`).toLocaleDateString('pt-BR')}
                  </span>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    O prazo limite desta fase não pode ultrapassar o prazo total da obra.
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
                  value={iniciarEtapaDataInicio}
                  onChange={(e) => setIniciarEtapaDataInicio(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl p-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  2. Prazo Limite / Término desta Fase: *
                </label>
                <input
                  type="date"
                  required
                  value={iniciarEtapaPrazoLimite}
                  onChange={(e) => setIniciarEtapaPrazoLimite(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl p-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  style={{ colorScheme: 'dark' }}
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Cada fase começa e termina no seu próprio tempo, permitindo acompanhamento independente.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsIniciarEtapaModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e293b]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveIniciarEtapaModal}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 shadow-md shadow-blue-900/20"
              >
                <Check className="w-4 h-4" />
                Salvar Prazo da Fase
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: RESUMO PERSONALIZADO PARA A DIRETORIA ── */}
      {isResumoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            
            {/* Header do Modal */}
            <div className="p-4 md:p-5 border-b border-slate-200 dark:border-[#1e293b] flex items-center justify-between bg-slate-50 dark:bg-[#0b1329]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Resumo Executivo para a Diretoria
                    <span className="text-xs px-2 py-0.5 rounded font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      {extractProjectBaseName(selectedProjeto)} [{getProjectVersion(selectedProjeto)}]
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Gere um relatório limpo e consolidado para prestação de contas da equipe de campo ao diretor
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsResumoModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#1e293b] transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo do Modal (Customização + Preview) */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
              
              {/* Painel de Customização pelo Pessoal de Irrigação */}
              <div className="bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Settings2 className="w-3.5 h-3.5 text-blue-500" />
                    Personalizar Conteúdo do Resumo
                  </span>
                  <span className="text-[11px] text-slate-500">Ajuste o que deseja apresentar ao diretor</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Filtro de Período */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Período do Histórico:
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { id: '7dias', label: '7 dias' },
                        { id: '15dias', label: '15 dias' },
                        { id: '30dias', label: '30 dias' },
                        { id: 'tudo', label: 'Tudo' },
                      ].map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setResumoPeriodo(p.id as any)}
                          className={`py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                            resumoPeriodo === p.id
                              ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                              : 'bg-white dark:bg-[#0d1527] border-slate-200 dark:border-[#1e293b] text-slate-600 dark:text-slate-400 hover:border-slate-300'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Incluir Fotos */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Evidências Visuais (Fotos/Anexos):
                    </label>
                    <button
                      type="button"
                      onClick={() => setIncluirFotosNoResumo(!incluirFotosNoResumo)}
                      className={`w-full py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-between transition-all ${
                        incluirFotosNoResumo
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                          : 'bg-white dark:bg-[#0d1527] border-slate-200 dark:border-[#1e293b] text-slate-500'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {incluirFotosNoResumo ? <CheckSquare className="w-4 h-4 text-blue-500" /> : <Square className="w-4 h-4 text-slate-400" />}
                        Incluir miniaturas das fotos anexadas
                      </span>
                      <span className="text-[11px] font-bold">{incluirFotosNoResumo ? 'Sim' : 'Não'}</span>
                    </button>
                  </div>
                </div>

                {/* Seleção de Etapas a incluir */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Etapas a incluir no relatório:
                    </label>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setResumoEtapas(ETAPAS_CAMPO.map(e => e.key))}
                        className="text-blue-500 hover:underline"
                      >
                        Selecionar todas
                      </button>
                      <span className="text-slate-400">•</span>
                      <button
                        type="button"
                        onClick={() => setResumoEtapas([selectedEtapa])}
                        className="text-blue-500 hover:underline"
                      >
                        Apenas etapa atual ({selectedEtapa})
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {ETAPAS_CAMPO.map(et => {
                      const isChecked = resumoEtapas.includes(et.key);
                      return (
                        <button
                          key={et.key}
                          type="button"
                          onClick={() => {
                            if (isChecked) {
                              if (resumoEtapas.length === 1) return; // manter ao menos 1
                              setResumoEtapas(resumoEtapas.filter(k => k !== et.key));
                            } else {
                              setResumoEtapas([...resumoEtapas, et.key]);
                            }
                          }}
                          className={`p-2 rounded-lg border text-left flex items-center gap-2 transition-all ${
                            isChecked
                              ? 'bg-blue-600/10 border-blue-500/40 text-blue-700 dark:text-blue-300'
                              : 'bg-white dark:bg-[#0d1527] border-slate-200 dark:border-[#1e293b] text-slate-500 opacity-60'
                          }`}
                        >
                          {isChecked ? <CheckSquare className="w-3.5 h-3.5 text-blue-500 shrink-0" /> : <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                          <span className="text-xs font-semibold truncate capitalize">{et.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Recado / Parecer da Equipe de Campo para o Diretor */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Parecer da Equipe de Campo para a Diretoria (opcional):
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Obra em ritmo excelente. Concluímos a montagem de campo adiantados e a previsão é ligar a bomba na próxima terça-feira..."
                    value={recadoDiretoria}
                    onChange={(e) => setRecadoDiretoria(e.target.value)}
                    className="w-full bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 resize-none shadow-inner placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* ── PRÉ-VISUALIZAÇÃO DO RESUMO (FORMATO RELATÓRIO EXECUTIVO) ── */}
              <div id="area-resumo-diretoria" className="border border-slate-200 dark:border-[#1e293b] rounded-xl p-5 bg-white dark:bg-[#0b1329] shadow-sm space-y-5">
                
                {/* Cabeçalho do Relatório */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-[#1e293b] pb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        Terra Café Irrigação • Relatório de Campo
                      </span>
                      <span className="text-xs text-slate-400">
                        Emitido em {new Date().toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xl font-extrabold text-slate-900 dark:text-white">
                        {extractProjectBaseName(selectedProjeto)}
                      </h4>
                      <span className="px-2 py-0.5 rounded text-xs font-extrabold border bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30">
                        {getProjectVersion(selectedProjeto)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right sm:border-r border-slate-200 dark:border-[#1e293b] sm:pr-4">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Start da Obra</p>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {new Date(`${dataStartProjeto}T00:00:00`).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center gap-1.5">
                      <Flag className="w-3.5 h-3.5 text-blue-500" />
                      <span>Dia {diaAtualDoProjeto} do Projeto</span>
                    </div>
                  </div>
                </div>

                {/* Parecer do Campo se preenchido */}
                {recadoDiretoria.trim() && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl p-3.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 block mb-1">
                      Parecer da Equipe de Campo:
                    </span>
                    <p className="text-xs text-slate-700 dark:text-slate-200 italic leading-relaxed">
                      &quot;{recadoDiretoria.trim()}&quot;
                    </p>
                  </div>
                )}

                {/* Tabela Resumo das Etapas Selecionadas */}
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-500" />
                    Status Geral das Etapas
                  </h5>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-[#1e293b] text-slate-400 text-[11px]">
                          <th className="py-2 px-3 font-semibold">Etapa</th>
                          <th className="py-2 px-3 font-semibold">Status Recente</th>
                          <th className="py-2 px-3 font-semibold">Tempo / Meta</th>
                          <th className="py-2 px-3 font-semibold">Responsáveis</th>
                          <th className="py-2 px-3 font-semibold text-right">Registros</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-[#1e293b]/60">
                        {resumoEtapas.map(etKey => {
                          const etMeta = ETAPAS_CAMPO.find(e => e.key === etKey);
                          if (!etMeta) return null;
                          const info = getEtapaResumoInfo(etKey as EtapaCampo);
                          const cfgStatus = getStatusConfig(info.ultimoStatus);
                          const StatusIcon = cfgStatus.icon;

                          return (
                            <tr key={etKey} className="hover:bg-slate-50/50 dark:hover:bg-[#111a30]/50">
                              <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-100">
                                <span className="mr-1.5">{etMeta.icon}</span>
                                {etMeta.label}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfgStatus.badgeBg}`}>
                                  <StatusIcon className="w-3 h-3" />
                                  {info.ultimoStatus}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">{info.decorridos}</span> / {info.metaDias} dias
                                <span className={`ml-1 text-[11px] font-medium ${info.atrasado ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                                  ({info.restantes >= 0 ? `${info.restantes}d rest.` : `${Math.abs(info.restantes)}d excedidos`})
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                                {info.responsaveis.length > 0 ? info.responsaveis.join(', ') : <span className="text-slate-400 italic">Equipe geral</span>}
                              </td>
                              <td className="py-2.5 px-3 text-right font-medium text-slate-500">
                                {info.totalRegistros}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Linha do Tempo de Ocorrências no Período */}
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-500" />
                      Atividades & Histórico ({logsResumoDiretoria.length} registro{logsResumoDiretoria.length !== 1 ? 's' : ''})
                    </h5>
                    <span className="text-[11px] text-slate-400">
                      {resumoPeriodo === '7dias' ? 'Últimos 7 dias' :
                       resumoPeriodo === '15dias' ? 'Últimos 15 dias' :
                       resumoPeriodo === '30dias' ? 'Últimos 30 dias' : 'Todo o projeto'}
                    </span>
                  </div>

                  {logsResumoDiretoria.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 dark:bg-[#070c18] rounded-xl border border-slate-200 dark:border-[#1e293b]">
                      Nenhuma ocorrência registrada no período selecionado.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {logsResumoDiretoria.slice(0, 10).map((log) => {
                        const cfgStatus = getStatusConfig(log.status);
                        const StatusIcon = cfgStatus.icon;
                        const diaTexto = getDiaDoProjetoTexto(log.data);

                        return (
                          <div
                            key={log.id}
                            className="p-3 rounded-xl border border-slate-200 dark:border-[#1e293b] bg-slate-50/70 dark:bg-[#070c18]/70 flex flex-col md:flex-row md:items-center justify-between gap-2"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                  {new Date(`${log.data}T00:00:00`).toLocaleDateString('pt-BR')}
                                </span>
                                {diaTexto && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                    {diaTexto}
                                  </span>
                                )}
                                <span className="text-slate-400 text-xs">•</span>
                                <span className="text-xs font-semibold capitalize text-blue-600 dark:text-blue-400">
                                  {log.atividade}
                                </span>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfgStatus.badgeBg}`}>
                                  <StatusIcon className="w-2.5 h-2.5" />
                                  {log.status}
                                </span>
                              </div>

                              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                                {log.observacoes || <span className="italic text-slate-400">Sem observações descritivas</span>}
                              </p>
                              
                              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                                <User className="w-3 h-3 text-slate-400" />
                                Por: <strong className="text-slate-600 dark:text-slate-300">{log.responsavel}</strong>
                              </p>
                            </div>

                            {/* Foto se houver e estiver marcado */}
                            {incluirFotosNoResumo && log.midiaUrl && (
                              <div className="shrink-0 flex items-center gap-2">
                                <a
                                  href={log.midiaUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="relative block w-14 h-14 rounded-lg overflow-hidden border border-slate-200 dark:border-[#1e293b] hover:opacity-90 transition-opacity"
                                >
                                  {log.midiaTipo === 'video' ? (
                                    <div className="w-full h-full bg-slate-900 flex items-center justify-center text-white">
                                      <Video className="w-5 h-5 text-blue-400" />
                                    </div>
                                  ) : (
                                    <Image
                                      src={log.midiaUrl}
                                      alt="Evidência"
                                      fill
                                      className="object-cover"
                                      unoptimized
                                    />
                                  )}
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {logsResumoDiretoria.length > 10 && (
                        <p className="text-center text-xs text-slate-400 pt-1">
                          + {logsResumoDiretoria.length - 10} outras atividades registradas neste período
                        </p>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Footer com Ações de Envio / Exportação */}
            <div className="p-4 border-t border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329] flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                Selecione se prefere enviar diretamente pelo <strong>WhatsApp</strong> ou <strong>Imprimir/Salvar PDF</strong>.
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsResumoModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e293b]"
                >
                  Fechar
                </button>

                <button
                  type="button"
                  onClick={handleImprimirResumo}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-[#1e293b] hover:bg-slate-300 dark:hover:bg-[#2d3748] text-slate-800 dark:text-white flex items-center gap-2 transition-all"
                  title="Abrir diálogo de impressão / salvar como PDF"
                >
                  <Printer className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  Imprimir / Salvar PDF
                </button>

                <button
                  type="button"
                  onClick={handleCopiarWhatsApp}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 shadow-md shadow-emerald-900/20 transition-all active:scale-[0.98]"
                  title="Copiar texto formatado com emojis para o WhatsApp do Diretor"
                >
                  {copiadoWhatsApp ? <Check className="w-4 h-4 text-white" /> : <Share2 className="w-4 h-4 text-white" />}
                  {copiadoWhatsApp ? 'Copiado p/ WhatsApp!' : 'Copiar p/ WhatsApp'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── MODAL: CONCLUIR FASE ──────────────────────────────────────────── */}
      {isConcluirFaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0d1527] border border-emerald-500/40 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 p-5 text-white">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/20">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black">Concluir Fase</h3>
                    <p className="text-sm text-emerald-50 opacity-90">Marcar como 100% concluída</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsConcluirFaseModalOpen(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {/* Informações da Fase */}
              <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/15">
                    <span className="text-2xl">
                      {ETAPAS_CAMPO.find(e => e.key === selectedEtapa)?.icon || '📋'}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
                      {selectedProjeto}
                    </p>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white capitalize mb-2">
                      {selectedEtapa}
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">Início:</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {new Date(`${statsContador.dataInicio}T00:00:00`).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">Dias Decorridos:</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {statsContador.diasDecorridos} / {statsContador.metaDias} dias
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Aviso Importante */}
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-900 dark:text-blue-100 leading-relaxed space-y-1">
                    <p className="font-bold">Ao concluir esta fase:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-blue-800 dark:text-blue-200">
                      <li>O progresso será atualizado para <strong>100%</strong></li>
                      <li>A fase aparecerá como <strong>"Concluída"</strong> em todos os painéis</li>
                      <li>Um registro será criado no diário de campo</li>
                      <li>O diretor será notificado da conclusão</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Observações Finais */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Observações Finais da Conclusão (opcional):
                </label>
                <textarea
                  rows={3}
                  placeholder="Ex: Fase concluída dentro do prazo. Todas as valetas niveladas e aprovadas pela equipe técnica..."
                  value={observacaoConclusao}
                  onChange={(e) => setObservacaoConclusao(e.target.value)}
                  className="w-full bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 resize-none placeholder:text-slate-400"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Esta mensagem ficará registrada permanentemente no histórico da fase.
                </p>
              </div>

              {/* Responsáveis */}
              {currentEtapaResponsaveis.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-500">Responsáveis:</span>
                  {currentEtapaResponsaveis.map((resp, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 rounded-md text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    >
                      {resp}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 dark:bg-[#0b1221] border-t border-slate-200 dark:border-[#1e293b] p-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsConcluirFaseModalOpen(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#0d1527] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConcluirFase}
                disabled={concluindoFase}
                className="px-6 py-2.5 rounded-xl text-sm font-black bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {concluindoFase ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Concluindo...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Sim, Concluir Fase</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
