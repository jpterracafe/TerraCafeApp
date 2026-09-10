"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import BackButton from '@/components/BackButton';
import { useSession } from 'next-auth/react';
import { 
  ChevronRight, Search, Plus, RefreshCw, Users, User, Database,
  Edit2, Trash2, AlertTriangle, X, Info
} from 'lucide-react';
import { Responsavel } from './mockResponsaveis';

export default function ResponsaveisPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? '';

  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadResponsaveis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/responsaveis');
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
    if (!search.trim()) return responsaveis;
    const lower = search.toLowerCase();
    return responsaveis.filter(r => r.nome.toLowerCase().includes(lower) || r.cargo.toLowerCase().includes(lower));
  }, [responsaveis, search]);

  const handleSaveNovo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoNome.trim() || !novoCargo.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/responsaveis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoNome.trim(), cargo: novoCargo.trim(), origem: 'MANUAL' }),
      });
      if (res.ok) {
        const { responsavel } = await res.json();
        setResponsaveis(prev => [responsavel, ...prev]);
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
    if (r.origem === 'BANCO_DADOS' && userRole !== 'Desenvolvedor') return;
    setSelectedToDelete(r);
    setIsDeleteModalOpen(true);
  };

  // Ao deletar responsável, também desatribui (via API de fases) as fases desse responsável
  const confirmDelete = async (trashProjects: boolean) => {
    if (!selectedToDelete) return;
    try {
      // Atualiza fases que têm esse responsável
      const fasesRes = await fetch('/api/fases');
      if (fasesRes.ok) {
        const { fases } = await fasesRes.json();
        const afetadas = fases.filter((f: any) => f.responsavel === selectedToDelete.nome && !f.isDeleted);
        await Promise.all(afetadas.map((f: any) =>
          fetch('/api/fases', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: f.id,
              ...(trashProjects ? { isDeleted: true } : { responsavel: 'Não atribuído' }),
            }),
          })
        ));
      }
      // Deleta o responsável
      await fetch(`/api/responsaveis?id=${selectedToDelete.id}`, { method: 'DELETE' });
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
          <ThemeToggle /><LogoutButton />
          <button onClick={loadResponsaveis} className="flex items-center justify-center gap-2 bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] hover:border-blue-500 text-slate-900 dark:text-white px-4 py-2 rounded-lg font-medium transition-all" title="Recarregar do banco">
            <RefreshCw className="w-4 h-4" />Sincronizar Banco
          </button>
          <button onClick={() => setIsAddModalOpen(true)} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20">
            <Plus className="w-4 h-4" />Novo Responsável Manual
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl shadow-xl shadow-black/30 overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-[#1e293b] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" placeholder="Buscar por nome ou cargo..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors" />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Info className="w-4 h-4" /><span>Registros integrados do ERP são de leitura estrita.</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-[#0b1329] border-b border-slate-200 dark:border-[#1e293b]">
              <tr>
                <th className="px-6 py-4 font-medium">Nome do Responsável</th>
                <th className="px-6 py-4 font-medium">Cargo / Função</th>
                <th className="px-6 py-4 font-medium">Origem</th>
                <th className="px-6 py-4 font-medium text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#1e293b]">
              {loading && <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500">Carregando responsáveis do banco...</td></tr>}
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
                    {r.origem === 'BANCO_DADOS' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20"><Database className="w-3.5 h-3.5" />Importado do Banco</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-600 dark:text-slate-300 border border-slate-500/20"><User className="w-3.5 h-3.5" />Cadastro Manual</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button className={`p-3 rounded-lg transition-colors ${r.origem === 'BANCO_DADOS' ? 'text-slate-600 cursor-not-allowed' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#1e293b]'}`} disabled={r.origem === 'BANCO_DADOS'} title={r.origem === 'BANCO_DADOS' ? 'Edição bloqueada' : 'Editar Responsável'}>
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => openDelete(r)} className={`p-3 rounded-lg transition-colors ${r.origem === 'BANCO_DADOS' && userRole !== 'Desenvolvedor' ? 'text-slate-600 cursor-not-allowed' : 'text-slate-500 dark:text-slate-400 hover:text-rose-400 hover:bg-rose-500/10'}`} disabled={r.origem === 'BANCO_DADOS' && userRole !== 'Desenvolvedor'} title="Remover Responsável">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500">Nenhum responsável encontrado.</td></tr>}
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
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Cargo / Função</label>
                  <input type="text" required placeholder="Ex: Engenheiro Hidráulico" value={novoCargo} onChange={(e) => setNovoCargo(e.target.value)} className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors" />
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
