"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import BackButton from '@/components/BackButton';
import { useSession } from 'next-auth/react';
import { 
  ChevronRight, Search, Plus, RefreshCw, Users, User, Database,
  Edit2, Trash2, AlertTriangle, X, Info, KeyRound, ShieldCheck,
  UserPlus, Copy, CheckCircle2, Link2
} from 'lucide-react';
import { Responsavel } from './mockResponsaveis';
import { offlineFetch } from '@/lib/offline';

export default function ResponsaveisPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? '';
  const isAdminView = ['Admin', 'Diretor', 'Desenvolvedor'].includes(userRole);

  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroLogin, setFiltroLogin] = useState<'todos' | 'com' | 'sem'>('todos');

  // ── Criar login (admin) ──
  const [loginTarget, setLoginTarget] = useState<Responsavel | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginCargo, setLoginCargo] = useState('Montador');
  const [loginSaving, setLoginSaving] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginResult, setLoginResult] = useState<{ senha: string; projetos: string[]; aviso?: string | null } | null>(null);
  const [loginConflito, setLoginConflito] = useState<{ email: string } | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadResponsaveis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await offlineFetch('/api/responsaveis');
      if (res.ok) {
        const d = await res.json();
        setResponsaveis(d.responsaveis ?? []);
      }
    } catch (e) {
      console.error('[responsaveis] Erro ao carregar:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadResponsaveis(); }, [loadResponsaveis]);

  const [isAddModalOpen, setIsAddModalOpen]     = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedToDelete, setSelectedToDelete]  = useState<Responsavel | null>(null);
  const [novoNome, setNovoNome]   = useState('');
  const [novoCargo, setNovoCargo] = useState('');
  const [saving, setSaving] = useState(false);

  const nameCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    responsaveis.forEach(r => {
      const n = r.nome.trim().toLowerCase();
      counts[n] = (counts[n] || 0) + 1;
    });
    return counts;
  }, [responsaveis]);

  const isDuplicateName = (nome: string) => (nameCounts[nome.trim().toLowerCase()] || 0) > 1;

  const isTypingDuplicate = useMemo(() => {
    if (!novoNome.trim()) return false;
    return responsaveis.some(r => r.nome.trim().toLowerCase() === novoNome.trim().toLowerCase());
  }, [novoNome, responsaveis]);

  const filtered = useMemo(() => {
    let list = responsaveis;
    if (filtroLogin === 'com') list = list.filter(r => r.temLogin);
    if (filtroLogin === 'sem') list = list.filter(r => !r.temLogin && r.origem !== 'USUARIO');
    if (!search.trim()) return list;
    const lower = search.toLowerCase();
    return list.filter(r => r.nome.toLowerCase().includes(lower) || r.cargo.toLowerCase().includes(lower));
  }, [responsaveis, search, filtroLogin]);

  const totalComLogin = useMemo(() => responsaveis.filter(r => r.temLogin).length, [responsaveis]);
  const totalSemLogin = useMemo(() => responsaveis.filter(r => !r.temLogin && r.origem !== 'USUARIO').length, [responsaveis]);

  const openCriarLogin = (r: Responsavel) => {
    setLoginTarget(r);
    // Sugere email a partir do nome (admin ajusta antes de confirmar)
    const sugestao = r.nome.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, '').trim().split(/\s+/).join('.');
    setLoginEmail(sugestao ? `${sugestao}@terracafe.com.br` : '');
    setLoginCargo('Montador');
    setLoginError('');
    setLoginResult(null);
    setCopied(false);
  };

  const closeCriarLogin = () => {
    setLoginTarget(null);
    setLoginEmail('');
    setLoginCargo('Montador');
    setLoginError('');
    setLoginResult(null);
    setLoginConflito(null);
    setVinculando(false);
    setLoginSaving(false);
  };

  const handleVincular = async () => {
    if (!loginTarget || !loginConflito) return;
    setVinculando(true);
    setLoginError('');
    try {
      const res = await fetch('/api/admin/responsaveis/vincular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responsavelId: loginTarget.id, userEmail: loginConflito.email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoginError(data.error || 'Não foi possível vincular.');
        return;
      }
      setResponsaveis(prev => prev.map(r => r.id === loginTarget.id
        ? { ...r, temLogin: true, loginEmail: loginConflito.email.toLowerCase(), user_email: loginConflito.email.toLowerCase(), user_id: data.user?.id ?? r.user_id }
        : r));
      closeCriarLogin();
    } catch {
      setLoginError('Erro de conexão. Tente novamente.');
    } finally {
      setVinculando(false);
    }
  };

  const handleCriarLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginTarget || !loginEmail.trim()) return;
    setLoginSaving(true);
    setLoginError('');
    setLoginConflito(null);
    try {
      const res = await fetch('/api/admin/responsaveis/criar-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responsavelId: loginTarget.id, email: loginEmail.trim(), role: loginCargo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoginError(data.error || 'Não foi possível criar o login.');
        if (data.conflito?.email) setLoginConflito({ email: data.conflito.email });
        return;
      }
      setLoginResult({ senha: data.senhaGerada, projetos: data.projetos ?? [], aviso: data.avisoHomonimos ?? null });
      // Atualiza a linha localmente: passa a ter login
      setResponsaveis(prev => prev.map(r => r.id === loginTarget.id
        ? { ...r, temLogin: true, loginEmail: loginEmail.trim().toLowerCase(), user_email: loginEmail.trim().toLowerCase(), user_id: data.user?.id ?? r.user_id }
        : r));
    } catch {
      setLoginError('Erro de conexão. Tente novamente.');
    } finally {
      setLoginSaving(false);
    }
  };

  const handleSaveNovo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoNome.trim()) return;
    setSaving(true);
    try {
      // (offline: fica na fila e sincroniza depois)
      const res = await offlineFetch('/api/responsaveis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoNome.trim(), cargo: novoCargo.trim(), origem: 'MANUAL' }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.responsavel) {
          setResponsaveis(prev => [data.responsavel, ...prev]);
        } else if (data?.offlineQueued) {
          // Sem conexão: mostra otimisticamente até a sincronização
          const nome = novoNome.trim();
          setResponsaveis(prev => [
            {
              id: `temp-${Date.now()}`,
              nome,
              cargo: novoCargo.trim(),
              origem: 'MANUAL',
              avatar: nome.trim().split(' ').length >= 2
                ? (nome.trim()[0] + nome.trim().split(' ').at(-1)![0]).toUpperCase()
                : nome.substring(0, 2).toUpperCase(),
            },
            ...prev,
          ]);
        }
        setNovoNome('');
        setNovoCargo('');
        setIsAddModalOpen(false);
      }
    } catch (e) {
      console.error('[responsaveis] Erro ao criar:', e);
    } finally {
      setSaving(false);
    }
  };

  const openDelete = (r: Responsavel) => {
    if (r.origem === 'USUARIO') return;
    if (r.origem === 'BANCO_DADOS' && userRole !== 'Desenvolvedor') return;
    setSelectedToDelete(r);
    setIsDeleteModalOpen(true);
  };

  // Ao deletar responsável, também desatribui (via API de fases) as fases desse responsável
  const confirmDelete = async (trashProjects: boolean) => {
    if (!selectedToDelete) return;
    try {
      // Atualiza fases que têm esse responsável (offline: usa cache + fila)
      const fasesRes = await offlineFetch('/api/fases');
      if (fasesRes.ok) {
        const { fases } = await fasesRes.json();
        const afetadas = fases.filter((f: any) => f.responsavel === selectedToDelete.nome && !f.isDeleted);
        await Promise.all(afetadas.map((f: any) =>
          offlineFetch('/api/fases', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: f.id,
              ...(trashProjects ? { isDeleted: true } : { responsavel: 'Não atribuído' }),
            }),
          })
        ));
      }
      // Deleta o responsável (offline: fica na fila e sincroniza depois)
      await offlineFetch(`/api/responsaveis?id=${selectedToDelete.id}`, { method: 'DELETE' });
      setResponsaveis(prev => prev.filter(r => r.id !== selectedToDelete.id));
    } catch (e) {
      console.error('[responsaveis] Erro ao deletar:', e);
    } finally {
      setIsDeleteModalOpen(false);
      setSelectedToDelete(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070c18] text-slate-600 dark:text-slate-300 p-4 md:p-6 lg:p-8 font-sans">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400 mb-2">
            <BackButton />
            <span>Portal</span><ChevronRight className="w-4 h-4" />
            <span>Irrigação</span><ChevronRight className="w-4 h-4" />
            <span className="text-slate-900 dark:text-white font-medium">Responsáveis</span>
          </nav>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-3">
            <Users className="w-6 h-6 text-blue-500" />Gestão de Equipe e Responsáveis
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={loadResponsaveis} className="flex items-center justify-center gap-2 bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] hover:border-blue-500 text-slate-900 dark:text-white px-4 py-2 rounded-lg font-medium transition-all" title="Recarregar do banco">
            <RefreshCw className="w-4 h-4" />Sincronizar Banco
          </button>
          <button onClick={() => setIsAddModalOpen(true)} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20">
            <Plus className="w-4 h-4" />Novo Responsável Manual
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl shadow-xl shadow-black/30 overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-[#1e293b] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" placeholder="Buscar por nome ou cargo..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-1 text-xs font-medium max-w-full overflow-x-auto">
              <button onClick={() => setFiltroLogin('todos')} className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${filtroLogin === 'todos' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
                Todos ({responsaveis.length})
              </button>
              <button onClick={() => setFiltroLogin('com')} className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1 whitespace-nowrap ${filtroLogin === 'com' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
                <ShieldCheck className="w-3.5 h-3.5" />Com login ({totalComLogin})
              </button>
              <button onClick={() => setFiltroLogin('sem')} className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1 whitespace-nowrap ${filtroLogin === 'sem' ? 'bg-amber-600 text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
                <UserPlus className="w-3.5 h-3.5" />Sem login ({totalSemLogin})
              </button>
            </div>
            {isAdminView && (
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-lg border border-emerald-500/20">
                <ShieldCheck className="w-4 h-4" /><span>Visão admin: todos os responsáveis</span>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-[#0b1329] border-b border-slate-200 dark:border-[#1e293b]">
              <tr>
                <th className="px-6 py-4 font-medium">Nome do Responsável</th>
                <th className="px-6 py-4 font-medium">Cargo / Função</th>
                <th className="px-6 py-4 font-medium">Origem</th>
                <th className="px-6 py-4 font-medium">Login</th>
                <th className="px-6 py-4 font-medium">Projetos vinculados</th>
                <th className="px-6 py-4 font-medium text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#1e293b]">
              {loading && <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">Carregando responsáveis do banco...</td></tr>}
              {!loading && filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-100 dark:hover:bg-[#111a30] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 text-xs">{r.avatar}</div>
                      <div className="flex flex-col">
                        <span className="text-slate-900 dark:text-white font-medium flex items-center gap-2">
                          {r.nome}
                          {isDuplicateName(r.nome) && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20" title="Existe mais de um responsável com este nome">
                              <AlertTriangle className="w-3 h-3" />Homônimo
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-slate-500">ID: {r.id}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{r.cargo}</td>
                  <td className="px-6 py-4">
                    {r.origem === 'USUARIO' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Você</span>
                    ) : r.origem === 'BANCO_DADOS' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20"><Database className="w-3.5 h-3.5" />Importado do Banco</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-600 dark:text-slate-300 border border-slate-500/20"><User className="w-3.5 h-3.5" />Cadastro Manual</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {r.temLogin ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" title={r.loginEmail || r.user_email || 'Tem login'}>
                        <ShieldCheck className="w-3.5 h-3.5" />Agricultor
                      </span>
                    ) : r.origem === 'USUARIO' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Você</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20" title="Criado por um agricultor — ainda sem login">
                        <UserPlus className="w-3.5 h-3.5" />Sem login
                      </span>
                    )}
                    {r.loginEmail && (
                      <div className="text-[11px] text-slate-500 mt-1 truncate max-w-[200px]" title={r.loginEmail}>{r.loginEmail}</div>
                    )}
                    {!r.temLogin && r.origem !== 'USUARIO' && (r.criadoPorNome || r.criadoPorEmail) && (
                      <div className="text-[11px] text-slate-500 mt-1" title={r.criadoPorEmail || ''}>
                        criado por {r.criadoPorNome || r.criadoPorEmail}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {(r.totalProjetos ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20" title={(r.projetos ?? []).join(', ')}>
                        <Link2 className="w-3.5 h-3.5" />{r.totalProjetos} projeto{(r.totalProjetos ?? 0) > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {isAdminView && !r.temLogin && r.origem !== 'USUARIO' && r.id !== 'self' && (
                        <button onClick={() => openCriarLogin(r)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors" title="Criar login para esta pessoa (email + senha aleatória). Os projetos vinculados aparecem direto para ela.">
                          <KeyRound className="w-3.5 h-3.5" />Criar login
                        </button>
                      )}
                      <button className={`p-3 rounded-lg transition-colors ${r.origem === 'BANCO_DADOS' || r.origem === 'USUARIO' ? 'text-slate-600 cursor-not-allowed' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#1e293b]'}`} disabled={r.origem === 'BANCO_DADOS' || r.origem === 'USUARIO'} title={r.origem === 'BANCO_DADOS' ? 'Edição bloqueada' : r.origem === 'USUARIO' ? 'Você faz parte da equipe' : 'Editar Responsável'}>
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => openDelete(r)} className={`p-3 rounded-lg transition-colors ${r.origem === 'BANCO_DADOS' && userRole !== 'Desenvolvedor' || r.origem === 'USUARIO' ? 'text-slate-600 cursor-not-allowed' : 'text-slate-500 dark:text-slate-400 hover:text-rose-400 hover:bg-rose-500/10'}`} disabled={r.origem === 'BANCO_DADOS' && userRole !== 'Desenvolvedor' || r.origem === 'USUARIO'} title={r.origem === 'USUARIO' ? 'Você faz parte da equipe' : 'Remover Responsável'}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">Nenhum responsável encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* DRAWER - NOVO RESPONSÁVEL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white/95 dark:bg-[#0d1527]/95 backdrop-blur-2xl h-full border-l border-slate-200 dark:border-[#1e293b] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329]">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Novo Responsável (Manual)</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-[#1e293b] text-slate-500 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="bg-slate-100 dark:bg-[#111a30] border border-blue-500/20 p-4 rounded-lg flex gap-3 text-sm text-blue-200">
                <Info className="w-5 h-5 text-blue-400 shrink-0" />
                <p>Este cadastro ficará salvo no banco e estará disponível para todos os usuários.</p>
              </div>
              <form id="add-responsavel-form" onSubmit={handleSaveNovo} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Nome Completo</label>
                  <input type="text" required placeholder="Ex: Roberto Alves" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors" />
                  {isTypingDuplicate && (
                    <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-400"><strong>Atenção:</strong> Já existe um responsável com o nome "{novoNome}".</p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Cargo / Função <span className="text-xs text-slate-400">(opcional)</span></label>
                  <input type="text" placeholder="Ex: Engenheiro Hidráulico" value={novoCargo} onChange={(e) => setNovoCargo(e.target.value)} className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
              </form>
            </div>
            <div className="p-6 border-t border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329] flex justify-end gap-3">
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e293b] transition-colors">Cancelar</button>
              <button type="submit" form="add-responsavel-form" disabled={saving} className="px-5 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20 transition-all disabled:opacity-70 flex items-center gap-2">
                {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Salvar Responsável
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL - CRIAR LOGIN (admin) */}
      {loginTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329]">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-emerald-500" />Criar login
              </h3>
              <button onClick={closeCriarLogin} className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-[#1e293b] text-slate-500 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              {!loginResult ? (
                <form id="criar-login-form" onSubmit={handleCriarLogin} className="space-y-4">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Criar acesso para <strong className="text-slate-900 dark:text-white">{loginTarget.nome}</strong>.
                    O login usa o <strong>mesmo nome</strong>, então os {(loginTarget.totalProjetos ?? 0) > 0 ? `${loginTarget.totalProjetos} projeto(s) vinculado(s)` : 'projetos vinculados'} aparecem direto para a pessoa.
                  </p>
                  {(loginTarget.projetos ?? []).length > 0 && (
                    <div className="text-xs bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-blue-300">
                      Projetos que vão aparecer: {(loginTarget.projetos ?? []).join(', ')}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">E-mail do login</label>
                    <input type="email" required placeholder="nome@terracafe.com.br" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Nível de acesso</label>
                    <select value={loginCargo} onChange={(e) => setLoginCargo(e.target.value)} className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors">
                      <option value="Montador">🛠️ Montador</option>
                      <option value="Gerente">🏢 Gerente (Obras da sua cidade)</option>
                      <option value="Coordenador">📊 Coordenador (Visão do Diretor)</option>
                      <option value="Diretor">👔 Diretor (Visão Geral Corporativa)</option>
                      <option value="Admin">🛡️ Admin</option>
                    </select>
                  </div>
                  <p className="text-xs text-slate-500">A senha é gerada aleatoriamente e fica visível na tela + salva para consulta.</p>
                  {loginError && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-lg text-sm space-y-2">
                      <p>{loginError}</p>
                      {loginConflito && (
                        <button
                          type="button"
                          onClick={handleVincular}
                          disabled={vinculando}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-all disabled:opacity-70"
                        >
                          {vinculando ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Link2 className="w-4 h-4" />}
                          {vinculando ? 'Vinculando...' : `Vincular a ${loginConflito.email} em vez de criar outro`}
                        </button>
                      )}
                    </div>
                  )}
                </form>
              ) : (
                <div className="flex flex-col items-center text-center py-2 space-y-4">
                  <div className="w-14 h-14 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                    <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900 dark:text-white">Login criado!</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Envie o e-mail e a senha abaixo para a pessoa:</p>
                  <div className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] p-3 rounded-lg">
                    <div className="text-xs text-slate-500 mb-1">E-mail</div>
                    <code className="text-sm font-semibold text-slate-900 dark:text-white select-all">{loginEmail.trim().toLowerCase()}</code>
                    <div className="text-xs text-slate-500 mt-3 mb-1">Senha provisória</div>
                    <div className="flex items-center justify-center gap-2">
                      <code className="text-lg font-bold tracking-widest text-emerald-400 select-all">{loginResult.senha}</code>
                      <button onClick={() => { navigator.clipboard.writeText(loginResult.senha); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors" title="Copiar senha">
                        {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {loginResult.projetos.length > 0 && (
                    <p className="text-xs text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-lg p-2">
                      {loginResult.projetos.length} projeto(s) já aparecem para ela: {loginResult.projetos.join(', ')}
                    </p>
                  )}
                  {loginResult.aviso && (
                    <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">{loginResult.aviso}</p>
                  )}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329] flex justify-end gap-3">
              <button onClick={closeCriarLogin} className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e293b] transition-colors">
                {loginResult ? 'Fechar' : 'Cancelar'}
              </button>
              {!loginResult && (
                <button type="submit" form="criar-login-form" disabled={loginSaving} className="px-5 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-all disabled:opacity-70 flex items-center gap-2">
                  {loginSaving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  {loginSaving ? 'Criando...' : 'Gerar login'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL - CONFIRMAR DELETE */}
      {isDeleteModalOpen && selectedToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Remover Responsável</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                O que fazer com as ações atribuídas a <strong className="text-slate-900 dark:text-white">{selectedToDelete.nome}</strong>?
              </p>
            </div>
            <div className="p-6 border-t border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329] flex flex-col gap-3">
              <button onClick={() => confirmDelete(false)} className="w-full px-4 py-3 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white transition-all">
                Manter ações (desatribuir responsável)
              </button>
              <button onClick={() => confirmDelete(true)} className="w-full px-4 py-3 rounded-lg text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white transition-all">
                Mover ações para a lixeira
              </button>
              <button onClick={() => { setIsDeleteModalOpen(false); setSelectedToDelete(null); }} className="w-full px-4 py-3 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e293b] transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
