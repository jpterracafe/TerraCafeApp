"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import BackButton from '@/components/BackButton';
import { 
  ChevronRight, 
  Search,
  Plus,
  ShieldAlert,
  UserCheck,
  UserX,
  Mail,
  Copy,
  CheckCircle2,
  X,
  Lock,
  Key,
  FileSpreadsheet,
  Trash2,
  Eye,
  EyeOff,
  Store,
  Building2,
  Briefcase,
} from 'lucide-react';
import { UsuarioSistema, RoleSistema } from './mockUsuariosSistema';
import { isMasterDevSession } from '@/lib/client-roles';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';

function mapDbUser(u: {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  loja?: string | null;
  senhaTemp?: string | null;
  createdAt?: string;
}): UsuarioSistema {
  const nome = u.name || u.email || 'Usuário';
  const initials = nome.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
  return {
    id: u.id,
    nome,
    email: u.email || '',
    cargo: (u.role as RoleSistema) || 'Colaborador',
    loja: u.loja ?? undefined,
    status: 'Ativo',
    avatar: initials || 'U',
    senhaGerada: u.senhaTemp ?? undefined,
  };
}

export default function AdminUsuariosPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>([]);
  const [search, setSearch] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<UsuarioSistema | null>(null);
  // Controla quais senhas estão visíveis: Set de IDs com senha revelada
  const [senhasVisiveis, setSenhasVisiveis] = useState<Set<string>>(new Set());
  // Feedback visual de cópia da senha por ID
  const [copiedSenhaId, setCopiedSenhaId] = useState<string | null>(null);
  // IDs com reset em andamento
  const [resettingId, setResettingId] = useState<string | null>(null);
  // Modal de edição manual de senha
  const [editSenhaUser, setEditSenhaUser] = useState<UsuarioSistema | null>(null);
  const [editSenhaInput, setEditSenhaInput] = useState('');
  const [editSenhaLoading, setEditSenhaLoading] = useState(false);
  const [editSenhaError, setEditSenhaError] = useState('');

  const copySenha = (id: string, senha: string) => {
    try {
      navigator.clipboard.writeText(senha);
      setCopiedSenhaId(id);
      setTimeout(() => setCopiedSenhaId(null), 2000);
    } catch {
      // fallback
    }
  };

  const toggleSenha = (id: string) => {
    setSenhasVisiveis((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleTodasSenhas = () => {
    const todosIdsComSenha = usuarios.filter((u) => !!u.senhaGerada).map((u) => u.id);
    if (senhasVisiveis.size >= todosIdsComSenha.length && todosIdsComSenha.length > 0) {
      setSenhasVisiveis(new Set());
    } else {
      setSenhasVisiveis(new Set(todosIdsComSenha));
    }
  };

  const handleResetSenha = async (u: UsuarioSistema) => {
    setResettingId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Erro ao resetar senha.');
        return;
      }
      // Atualiza localmente com a nova senha
      setUsuarios((prev) =>
        prev.map((usr) => usr.id === u.id ? { ...usr, senhaGerada: data.novaSenha } : usr)
      );
      // Revela automaticamente a nova senha
      setSenhasVisiveis((prev) => new Set(prev).add(u.id));
      copySenha(u.id, data.novaSenha);
    } catch {
      alert('Erro de conexão ao resetar senha.');
    } finally {
      setResettingId(null);
    }
  };

  const handleSaveCustomSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSenhaUser) return;
    const senha = editSenhaInput.trim();
    if (senha.length < 4) {
      setEditSenhaError('A senha deve ter pelo menos 4 caracteres.');
      return;
    }
    setEditSenhaLoading(true);
    setEditSenhaError('');
    try {
      const res = await fetch(`/api/admin/users/${editSenhaUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ novaSenha: senha }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditSenhaError(data.error || 'Erro ao alterar senha.');
        return;
      }
      setUsuarios((prev) =>
        prev.map((usr) => usr.id === editSenhaUser.id ? { ...usr, senhaGerada: data.novaSenha } : usr)
      );
      setSenhasVisiveis((prev) => new Set(prev).add(editSenhaUser.id));
      copySenha(editSenhaUser.id, data.novaSenha);
      setEditSenhaUser(null);
      setEditSenhaInput('');
    } catch {
      setEditSenhaError('Erro de conexão ao alterar senha.');
    } finally {
      setEditSenhaLoading(false);
    }
  };

  const loadUsers = useCallback(async () => {
    setLoadingList(true);
    setListError('');
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) {
        setListError(data.error || 'Não foi possível carregar os usuários.');
        setUsuarios([]);
        return;
      }
      setUsuarios((data.users || []).map(mapDbUser));
    } catch {
      setListError('Erro de conexão ao carregar usuários.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  const isMaster = isMasterDevSession(session);

  // Estados de Gestão de Lojas & Atribuição de Projetos
  const [lojas, setLojas] = useState<{ id: string; nome: string; ativo: boolean }[]>([]);
  const [isLojasModalOpen, setIsLojasModalOpen] = useState(false);
  const [activeLojasTab, setActiveLojasTab] = useState<'lojas' | 'projetos'>('lojas');
  const [novoNomeLoja, setNovoNomeLoja] = useState('');
  const [lojasLoading, setLojasLoading] = useState(false);
  const [lojaError, setLojaError] = useState('');
  const [deletingLojaId, setDeletingLojaId] = useState<string | null>(null);

  // Controle de edição rápida de loja do usuário
  const [updatingLojaId, setUpdatingLojaId] = useState<string | null>(null);
  const [savedLojaId, setSavedLojaId] = useState<string | null>(null);

  // Controle de atribuição de projetos a lojas
  const [projetosList, setProjetosList] = useState<string[]>([]);
  const [projetosLojasMap, setProjetosLojasMap] = useState<Record<string, string>>({});
  const [loadingProjetosAdmin, setLoadingProjetosAdmin] = useState(false);
  const [updatingProjetoNome, setUpdatingProjetoNome] = useState<string | null>(null);
  const [savedProjetoNome, setSavedProjetoNome] = useState<string | null>(null);

  const loadLojas = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/lojas');
      if (res.ok) {
        const data = await res.json();
        setLojas(data.lojas || []);
      }
    } catch (e) {
      console.error('[loadLojas] Erro ao carregar lojas:', e);
    }
  }, []);

  const loadProjetosAdmin = useCallback(async () => {
    setLoadingProjetosAdmin(true);
    try {
      const [resProj, resLojas] = await Promise.all([
        fetch('/api/projetos'),
        fetch('/api/lojas'),
      ]);
      if (resProj.ok) {
        const d = await resProj.json();
        setProjetosList(Array.isArray(d.projetos) ? d.projetos : []);
      }
      if (resLojas.ok) {
        const d = await resLojas.json();
        setProjetosLojasMap(d.projetosLojas || {});
      }
    } catch (e) {
      console.error('[loadProjetosAdmin] Erro:', e);
    } finally {
      setLoadingProjetosAdmin(false);
    }
  }, []);

  const handleUpdateProjetoLoja = async (projetoNome: string, lojaNome: string) => {
    setUpdatingProjetoNome(projetoNome);
    try {
      const res = await fetch('/api/lojas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projetoNome, lojaNome }),
      });
      if (res.ok) {
        setProjetosLojasMap((prev) => {
          const next = { ...prev };
          if (lojaNome) {
            next[projetoNome] = lojaNome;
          } else {
            delete next[projetoNome];
          }
          return next;
        });
        setSavedProjetoNome(projetoNome);
        setTimeout(() => setSavedProjetoNome(null), 2500);
      } else {
        alert('Erro ao atribuir loja ao projeto.');
      }
    } catch {
      alert('Erro de conexão ao atribuir loja ao projeto.');
    } finally {
      setUpdatingProjetoNome(null);
    }
  };

  const handleCreateLoja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoNomeLoja.trim()) return;
    setLojasLoading(true);
    setLojaError('');
    try {
      const res = await fetch('/api/admin/lojas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoNomeLoja.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLojaError(data.error || 'Erro ao criar loja.');
        return;
      }
      setLojas((prev) => [...prev, data.loja]);
      setNovoNomeLoja('');
    } catch {
      setLojaError('Erro de conexão ao criar loja.');
    } finally {
      setLojasLoading(false);
    }
  };

  const handleDeleteLoja = async (id: string) => {
    if (!confirm('Deseja realmente remover esta loja?')) return;
    setDeletingLojaId(id);
    try {
      const res = await fetch(`/api/admin/lojas?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        setLojas((prev) => prev.filter((l) => l.id !== id));
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao excluir loja.');
      }
    } catch {
      alert('Erro de conexão ao excluir loja.');
    } finally {
      setDeletingLojaId(null);
    }
  };

  const handleUpdateLoja = async (id: string, newLoja: string) => {
    setUpdatingLojaId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loja: newLoja }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Erro ao atribuir loja.');
        return;
      }
      setUsuarios((prev) =>
        prev.map((usr) => (usr.id === id ? { ...usr, loja: newLoja || undefined } : usr))
      );
      setSavedLojaId(id);
      setTimeout(() => setSavedLojaId(null), 2500);
    } catch {
      alert('Erro de conexão ao atribuir loja.');
    } finally {
      setUpdatingLojaId(null);
    }
  };

  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'authenticated' || !isMaster) {
      if (status === 'authenticated' && !isMaster) {
        router.push('/irrigacao/diario-campo');
      }
      return;
    }
    loadUsers();
    loadLojas();
  }, [status, isMaster, router, loadUsers, loadLojas]);

  // Modal States
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [novoEmail, setNovoEmail] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [novoCargo, setNovoCargo] = useState<RoleSistema>('Agricultor');
  const [novaLoja, setNovaLoja] = useState('');
  const [novaSenhaManual, setNovaSenhaManual] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  // Controle de edição rápida de cargo
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [savedRoleId, setSavedRoleId] = useState<string | null>(null);

  const handleUpdateRole = async (id: string, newRole: RoleSistema) => {
    setUpdatingRoleId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Erro ao alterar nível de acesso.');
        return;
      }
      setUsuarios((prev) =>
        prev.map((usr) => usr.id === id ? { ...usr, cargo: newRole } : usr)
      );
      setSavedRoleId(id);
      setTimeout(() => setSavedRoleId(null), 2500);
    } catch {
      alert('Erro de conexão ao alterar nível de acesso.');
    } finally {
      setUpdatingRoleId(null);
    }
  };

  // Filtering
  const filtered = useMemo(() => {
    if (!search.trim()) return usuarios;
    const lower = search.toLowerCase();
    return usuarios.filter(u => 
      u.nome.toLowerCase().includes(lower) || 
      u.email.toLowerCase().includes(lower) ||
      u.cargo.toLowerCase().includes(lower)
    );
  }, [usuarios, search]);

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoEmail.trim() || !novoNome.trim()) return;

    setInviteLoading(true);
    setInviteError('');

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: novoNome.trim(),
          email: novoEmail.trim(),
          cargo: novoCargo,
          loja: novaLoja.trim() || undefined,
          senha: novaSenhaManual.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error || 'Não foi possível criar o usuário.');
        return;
      }

      const mapped = mapDbUser(data.user);
      setUsuarios((prev) => [mapped, ...prev]);
      setInviteLink(data.senhaGerada);
    } catch {
      setInviteError('Erro de conexão. Tente novamente.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    setDeletingId(userToDelete.id);
    setListError('');
    try {
      const res = await fetch(`/api/admin/users/${userToDelete.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setListError(data.error || 'Não foi possível excluir o usuário.');
        return;
      }
      setUsuarios((prev) => prev.filter((u) => u.id !== userToDelete.id));
      setUserToDelete(null);
    } catch {
      setListError('Erro de conexão ao excluir o usuário.');
    } finally {
      setDeletingId(null);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeInviteModal = () => {
    setIsInviteModalOpen(false);
    setInviteLink('');
    setNovoEmail('');
    setNovoNome('');
    setNovoCargo('Agricultor');
    setNovaLoja('');
    setNovaSenhaManual('');
    setInviteError('');
    setInviteLoading(false);
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'Ativo': 
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><UserCheck className="w-3.5 h-3.5" /> Ativo</span>;
      case 'Pendente': 
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"><Mail className="w-3.5 h-3.5" /> Pendente (Convite Enviado)</span>;
      case 'Bloqueado': 
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20"><UserX className="w-3.5 h-3.5" /> Bloqueado</span>;
      default: 
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070c18] text-slate-600 dark:text-slate-300 p-4 md:p-6 lg:p-8 font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400 mb-2">
            <BackButton />
            <span>Portal</span>
            <ChevronRight className="w-4 h-4" />
            <span>Administração</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-slate-900 dark:text-white font-medium">Usuários do Sistema</span>
          </nav>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-3">
            <Lock className="w-6 h-6 text-blue-500" />
            Controle de Acesso (RBAC)
          </h1>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <ThemeToggle />
          <LogoutButton />
          
          <Link 
            href="/admin/importar"
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-emerald-900/20"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Importar Dados (CSV)
          </Link>

          <Link 
            href="/irrigacao/diario-campo"
            className="flex items-center justify-center gap-2 bg-slate-100 dark:bg-[#111a30] hover:bg-slate-200 dark:hover:bg-[#1e293b] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#1e293b] px-4 py-2 rounded-lg font-medium transition-all"
          >
            <LayoutDashboard className="w-4 h-4" />
            Acessar Plataforma
          </Link>

          <button 
            type="button"
            onClick={() => {
              setIsLojasModalOpen(true);
              loadProjetosAdmin();
            }}
            className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold px-4 py-2 rounded-lg transition-all shadow-md shadow-amber-900/20"
            title="Adicionar lojas ou atribuir projetos a filiais"
          >
            <Store className="w-4 h-4" />
            Lojas & Projetos ({lojas.length})
          </button>

          <button 
            onClick={() => setIsInviteModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-slate-900 dark:text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20"
          >
            <Plus className="w-4 h-4" />
            Convidar Novo Usuário
          </button>
        </div>
      </div>

      {/* FILTER & TABLE */}
      <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl shadow-xl shadow-black/30 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-900/10 dark:hover:shadow-blue-500/10">
        
        {/* TOOLBAR */}
        <div className="p-5 border-b border-slate-200 dark:border-[#1e293b] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text" 
              placeholder="Buscar por nome, email ou cargo..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-blue-400 bg-blue-500/10 px-4 py-2 rounded-lg border border-blue-500/20">
            <ShieldAlert className="w-4 h-4" />
            <span>Acesso Restrito: Desenvolvedores</span>
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-[#0b1329] border-b border-slate-200 dark:border-[#1e293b]">
              <tr>
                <th className="px-6 py-4 font-medium">Usuário</th>
                <th className="px-6 py-4 font-medium">Nível de Acesso (Cargo)</th>
                <th className="px-6 py-4 font-medium">Loja / Filial</th>
                <th className="px-6 py-4 font-medium">Status da Conta</th>
                <th className="px-6 py-4 font-medium">
                  <div className="flex items-center gap-2">
                    <span>Senha Provisória</span>
                    {usuarios.some((u) => !!u.senhaGerada) && (
                      <button
                        type="button"
                        onClick={toggleTodasSenhas}
                        className="text-[11px] font-normal normal-case text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Revelar ou ocultar todas as senhas"
                      >
                        {senhasVisiveis.size > 0 ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Ocultar todas</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            <span>Revelar todas</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </th>
                <th className="px-6 py-4 font-medium">Último Login</th>
                <th className="px-6 py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#1e293b]">
              {loadingList && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    Carregando usuários do banco...
                  </td>
                </tr>
              )}
              {!loadingList && listError && (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-rose-400 text-sm">
                    {listError}
                  </td>
                </tr>
              )}
              {!loadingList && filtered.map((u) => {
                const senhaVisivel = senhasVisiveis.has(u.id);
                const temSenha = !!u.senhaGerada;
                return (
                  <tr key={u.id} className="hover:bg-slate-100 dark:hover:bg-[#111a30] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full border flex items-center justify-center font-bold text-xs ${
                          u.cargo === 'Desenvolvedor' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}>
                          {u.avatar}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-slate-900 dark:text-white font-medium">{u.nome}</span>
                          <span className="text-xs text-slate-500">{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {u.cargo === 'Desenvolvedor' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          💻 Desenvolvedor (Master)
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            value={u.cargo}
                            disabled={updatingRoleId === u.id}
                            onChange={(e) => handleUpdateRole(u.id, e.target.value as RoleSistema)}
                            className="bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer disabled:opacity-60"
                            title="Clique para alterar o nível de acesso"
                          >
                            <option value="Agricultor">🌱 Agricultor</option>
                            <option value="Admin">🛡️ Admin</option>
                            <option value="Diretor">👔 Diretor</option>
                          </select>
                          {updatingRoleId === u.id && (
                            <span className="w-3.5 h-3.5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                          )}
                          {savedRoleId === u.id && (
                            <span className="text-[11px] text-emerald-500 font-bold flex items-center gap-0.5 animate-pulse">
                              ✓ Salvo!
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {u.cargo === 'Desenvolvedor' ? (
                        <span className="text-xs text-slate-400 italic">Todas as Lojas</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            value={u.loja || ''}
                            disabled={updatingLojaId === u.id}
                            onChange={(e) => handleUpdateLoja(u.id, e.target.value)}
                            className="bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-500 transition-colors cursor-pointer disabled:opacity-60 max-w-[150px]"
                            title="Clique para atribuir ou alterar a loja deste usuário"
                          >
                            <option value="">— Sem Loja —</option>
                            {lojas.map((l) => (
                              <option key={l.id} value={l.nome}>
                                🏬 {l.nome}
                              </option>
                            ))}
                          </select>
                          {updatingLojaId === u.id && (
                            <span className="w-3.5 h-3.5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                          )}
                          {savedLojaId === u.id && (
                            <span className="text-[11px] text-emerald-500 font-bold flex items-center gap-0.5 animate-pulse">
                              ✓ Salvo!
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(u.status)}
                    </td>
                    <td className="px-6 py-4">
                      {temSenha ? (
                        <div className="flex items-center gap-2">
                          <code className={`font-mono text-sm tracking-widest transition-all select-all font-semibold ${senhaVisivel ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400'}`}>
                            {senhaVisivel ? u.senhaGerada : '••••••••'}
                          </code>
                          <button
                            type="button"
                            onClick={() => toggleSenha(u.id)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 transition-colors"
                            title={senhaVisivel ? 'Ocultar senha' : 'Revelar senha'}
                          >
                            {senhaVisivel ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => copySenha(u.id, u.senhaGerada!)}
                            className={`p-1.5 rounded-md transition-colors ${copiedSenhaId === u.id ? 'text-emerald-500 bg-emerald-500/10' : 'text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10'}`}
                            title="Copiar senha"
                          >
                            {copiedSenhaId === u.id ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2">
                          <span className="text-xs text-amber-500/90 font-medium italic">Não definida</span>
                          <button
                            type="button"
                            onClick={() => handleResetSenha(u)}
                            disabled={resettingId === u.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/20 transition-all disabled:opacity-50"
                            title="Gerar senha provisória agora"
                          >
                            {resettingId === u.id ? (
                              <span className="w-3 h-3 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                            ) : (
                              <Key className="w-3 h-3" />
                            )}
                            Gerar
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                      {u.ultimoLogin ? new Date(u.ultimoLogin).toLocaleString('pt-BR') : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditSenhaUser(u);
                            setEditSenhaInput(u.senhaGerada || '');
                            setEditSenhaError('');
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-500 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                          title="Definir senha personalizada para este usuário"
                        >
                          <Key className="w-3.5 h-3.5" />
                          Alterar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResetSenha(u)}
                          disabled={resettingId === u.id}
                          title="Gerar nova senha provisória para este usuário"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                        >
                          {resettingId === u.id ? (
                            <span className="w-3.5 h-3.5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                          ) : (
                            <Lock className="w-3.5 h-3.5" />
                          )}
                          Resetar
                        </button>
                        <button
                          type="button"
                          onClick={() => setUserToDelete(u)}
                          disabled={deletingId === u.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              
              {!loadingList && filtered.length === 0 && !listError && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Nenhum usuário cadastrado no banco ainda. Use Convidar Novo Usuário.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL - CONVIDAR USUÁRIO */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl w-full max-w-md shadow-2xl shadow-black overflow-hidden animate-in zoom-in-95 duration-200">
            
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329]">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Convidar Novo Usuário</h3>
              <button 
                onClick={closeInviteModal}
                className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-[#1e293b] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {!inviteLink ? (
                <form id="invite-form" onSubmit={handleCreateInvite} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Nome Completo</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Ex: Ana Souza"
                      value={novoNome}
                      onChange={(e) => setNovoNome(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">E-mail Corporativo</label>
                    <input 
                      type="email" 
                      required
                      placeholder="ana.souza@terracafe.com.br"
                      value={novoEmail}
                      onChange={(e) => setNovoEmail(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Nível de Acesso (Cargo)</label>
                    <select 
                      value={novoCargo}
                      onChange={(e) => setNovoCargo(e.target.value as RoleSistema)}
                      className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      <option value="Agricultor">🌱 Agricultor (Aponta no Diário / Técnico de Campo)</option>
                      <option value="Admin">🛡️ Admin (Administrador da Plataforma)</option>
                      <option value="Diretor">👔 Diretor (Acompanhamento Executivo)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                      Loja / Filial
                    </label>
                    <select 
                      value={novaLoja}
                      onChange={(e) => setNovaLoja(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      <option value="">— Sem loja definida (Atribuir depois) —</option>
                      {lojas.map((l) => (
                        <option key={l.id} value={l.nome}>
                          🏬 {l.nome}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400 mt-1">
                      Você também poderá atribuir ou alterar a loja a qualquer momento pela tabela.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                      Senha Provisória (Opcional)
                    </label>
                    <input 
                      type="text" 
                      placeholder="Deixe em branco para gerar aleatória (8 caracteres)"
                      value={novaSenhaManual}
                      onChange={(e) => setNovaSenhaManual(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:border-blue-500 transition-colors placeholder:font-sans placeholder:text-slate-500"
                    />
                  </div>

                  {inviteError && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-lg text-sm flex items-center gap-2">
                      <Lock className="w-4 h-4 shrink-0" />
                      {inviteError}
                    </div>
                  )}
                </form>
              ) : (
                <div className="flex flex-col items-center text-center py-4 space-y-4 animate-in zoom-in-95">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20 mb-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900 dark:text-white">Usuário Criado!</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    A conta de {novoNome} foi criada. Envie a senha provisória abaixo para ele(a):
                  </p>
                  
                  <div className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] p-3 rounded-lg flex items-center justify-between gap-3 mt-4">
                    <div className="flex-1 text-center">
                      <span className="text-xs text-slate-500 block mb-1">Senha Gerada</span>
                      <code className="text-lg font-bold tracking-widest text-emerald-400 select-all">{inviteLink}</code>
                    </div>
                    <button 
                      onClick={copyToClipboard}
                      className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors flex-shrink-0 flex items-center justify-center"
                      title="Copiar Senha"
                    >
                      {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                    Esta senha fica salva no banco e pode ser consultada a qualquer momento na tabela de usuários.
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329] flex justify-end gap-3">
              <button 
                onClick={closeInviteModal}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e293b] hover:text-slate-900 dark:text-white transition-colors"
              >
                {inviteLink ? 'Fechar' : 'Cancelar'}
              </button>
              
              {!inviteLink && (
                <button 
                  type="submit"
                  form="invite-form"
                  disabled={inviteLoading}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-slate-900 dark:text-white shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {inviteLoading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4" />
                  )}
                  {inviteLoading ? 'Criando...' : 'Gerar Convite'}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Excluir usuário</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Remover <span className="font-medium text-slate-900 dark:text-white">{userToDelete.nome}</span> ({userToDelete.email}) do banco? Essa pessoa não conseguirá mais entrar no sistema.
              </p>
            </div>
            <div className="p-6 border-t border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329] flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e293b] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingId === userToDelete.id}
                className="px-5 py-2.5 rounded-lg text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white transition-all disabled:opacity-60"
              >
                {deletingId === userToDelete.id ? 'Excluindo...' : 'Excluir do banco'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL - ALTERAR SENHA DO USUÁRIO */}
      {editSenhaUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl w-full max-w-md shadow-2xl shadow-black overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#0b1329]">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-blue-500" />
                  Alterar Senha do Usuário
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {editSenhaUser.nome} ({editSenhaUser.email})
                </p>
              </div>
              <button
                onClick={() => {
                  setEditSenhaUser(null);
                  setEditSenhaInput('');
                  setEditSenhaError('');
                }}
                className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-[#1e293b] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomSenha} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                  Nova Senha
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Digite a nova senha (mínimo 4 caracteres)"
                    value={editSenhaInput}
                    onChange={(e) => setEditSenhaInput(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  A senha será salva de forma segura e ficará visível na tabela para o desenvolvedor master.
                </p>
              </div>

              {editSenhaError && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-lg text-sm flex items-center gap-2">
                  <Lock className="w-4 h-4 shrink-0" />
                  {editSenhaError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditSenhaUser(null);
                    setEditSenhaInput('');
                    setEditSenhaError('');
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1e293b] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editSenhaLoading || !editSenhaInput.trim()}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2 disabled:opacity-60"
                >
                  {editSenhaLoading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Key className="w-4 h-4" />
                  )}
                  {editSenhaLoading ? 'Salvando...' : 'Salvar Nova Senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GERENCIAR LOJAS & ATRIBUIR PROJETOS */}
      {isLojasModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-200 dark:border-[#1e293b] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-xl">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Gerenciar Lojas & Filiais</h2>
                  <p className="text-xs text-slate-400">Cadastre filiais e atribua projetos a cada uma</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsLojasModalOpen(false);
                  setLojaError('');
                }}
                className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-[#1e293b] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ABAS DO MODAL */}
            <div className="flex border-b border-slate-200 dark:border-[#1e293b] bg-slate-50 dark:bg-[#070c18] px-6">
              <button
                type="button"
                onClick={() => setActiveLojasTab('lojas')}
                className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
                  activeLojasTab === 'lojas'
                    ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                <Store className="w-4 h-4" />
                <span>Filiais / Lojas ({lojas.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveLojasTab('projetos');
                  loadProjetosAdmin();
                }}
                className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
                  activeLojasTab === 'projetos'
                    ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                <Briefcase className="w-4 h-4" />
                <span>Atribuir Projetos às Lojas ({projetosList.length})</span>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {activeLojasTab === 'lojas' ? (
                <>
                  {/* Formulário de Adicionar Nova Loja (Apenas o nome) */}
                  <form onSubmit={handleCreateLoja} className="space-y-3">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Nova Filial / Loja (Apenas o Nome)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        placeholder="Ex: Matriz, Patrocínio, Araxá..."
                        value={novoNomeLoja}
                        onChange={(e) => setNovoNomeLoja(e.target.value)}
                        className="flex-1 bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 transition-colors"
                      />
                      <button
                        type="submit"
                        disabled={lojasLoading || !novoNomeLoja.trim()}
                        className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-900 font-semibold px-4 py-2.5 rounded-lg text-sm transition-all flex items-center gap-1.5 shrink-0 shadow-sm"
                      >
                        {lojasLoading ? (
                          <span className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                        Adicionar
                      </button>
                    </div>
                    {lojaError && (
                      <p className="text-xs text-rose-500 font-medium">{lojaError}</p>
                    )}
                  </form>

                  {/* Lista de Lojas Cadastradas */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Lojas Cadastradas ({lojas.length})
                      </span>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                      {lojas.length === 0 ? (
                        <div className="text-center py-8 text-sm text-slate-400 bg-slate-50 dark:bg-[#070c18] rounded-xl border border-dashed border-slate-200 dark:border-[#1e293b]">
                          Nenhuma loja cadastrada ainda. Adicione a primeira acima!
                        </div>
                      ) : (
                        lojas.map((loja) => (
                          <div
                            key={loja.id}
                            className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b]"
                          >
                            <div className="flex items-center gap-3">
                              <Building2 className="w-4 h-4 text-amber-500" />
                              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                {loja.nome}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteLoja(loja.id)}
                              disabled={deletingLojaId === loja.id}
                              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                              title="Excluir loja"
                            >
                              {deletingLojaId === loja.id ? (
                                <span className="w-3.5 h-3.5 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : (
                /* ABA DE ATRIBUIÇÃO DE PROJETOS A LOJAS */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Vínculo de Projetos às Lojas
                      </span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Defina a qual filial cada projeto pertence. Projetos sem loja ficam visíveis em "Todas as Lojas".
                      </p>
                    </div>
                    {loadingProjetosAdmin && (
                      <span className="text-xs text-amber-500 animate-pulse font-medium">Carregando...</span>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                    {projetosList.length === 0 ? (
                      <div className="text-center py-8 text-sm text-slate-400 bg-slate-50 dark:bg-[#070c18] rounded-xl border border-dashed border-slate-200 dark:border-[#1e293b]">
                        Nenhum projeto cadastrado no sistema ainda.
                      </div>
                    ) : (
                      projetosList.map((proj) => {
                        const lojaAtual = projetosLojasMap[proj] || '';
                        const isUpdating = updatingProjetoNome === proj;
                        const isSaved = savedProjetoNome === proj;

                        return (
                          <div
                            key={proj}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b]"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                {proj}
                              </p>
                              <span className="text-[11px] text-slate-400">
                                {lojaAtual ? `Vinculado a: ${lojaAtual}` : 'Sem loja atribuída (Geral)'}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <select
                                value={lojaAtual}
                                disabled={isUpdating}
                                onChange={(e) => handleUpdateProjetoLoja(proj, e.target.value)}
                                className="text-xs font-medium bg-white dark:bg-[#111a30] border border-slate-300 dark:border-[#1e293b] rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer disabled:opacity-50"
                              >
                                <option value="">(Sem loja atribuída)</option>
                                {lojas.map((l) => (
                                  <option key={l.id} value={l.nome}>
                                    {l.nome}
                                  </option>
                                ))}
                              </select>

                              {isUpdating && (
                                <span className="w-3.5 h-3.5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                              )}
                              {isSaved && (
                                <span className="text-xs text-emerald-500 font-bold flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Salvo!
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsLojasModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Concluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}

