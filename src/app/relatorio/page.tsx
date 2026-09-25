"use client";

import React, { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Printer, ArrowLeft, FileSpreadsheet, Layers, Calendar,
  CheckCircle2, AlertTriangle, CloudRain, Users, Building2,
  Check, Clock
} from 'lucide-react';
import { exportToCSV } from '@/lib/export-csv';

interface FaseAcaoItem {
  id: string;
  gabarito: string;
  responsavel: string;
  prazoLimite: string;
  status: string;
  observacoes?: string;
  projetoCliente?: string;
  isDeleted?: boolean;
}

interface DiarioLogItem {
  id: string;
  data: string;
  responsavel: string;
  atividade: string;
  status: string;
  observacoes?: string;
  projetoCliente?: string;
  midiaUrl?: string;
}

const ETAPAS_CAMPO = [
  { key: 'Valetas',                     label: '01. Valetas',           icon: '⛏️', desc: 'Abertura e nivelamento' },
  { key: 'montagem campo',              label: '02. Montagem Campo',    icon: '🌱', desc: 'Tubulações e gotejadores' },
  { key: 'casa de bombas',              label: '03. Casa de Bombas',    icon: '⚙️', desc: 'Conjunto moto-bomba e filtros' },
  { key: 'elétrica',                    label: '04. Elétrica',          icon: '⚡', desc: 'Quadros e automação' },
  { key: 'lavagem do sistema e testes', label: '05. Lavagem e Testes',  icon: '💧', desc: 'Pressão e estanqueidade' },
  { key: 'entrega técnica',             label: '06. Entrega Técnica',   icon: '📋', desc: 'Treinamento e comissionamento' },
];

const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  'Dentro do programado': { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  'Dentro do Programado': { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  'Acima':                { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  'Abaixo':               { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' },
  'Chuva/Paralisação':    { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc' },
  'Problema Técnico':     { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' },
  'Comercial/Ajustes':    { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  'Aguardando material':  { bg: '#fefce8', text: '#a16207', border: '#fef08a' },
  'Concluído':            { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
};

function RelatorioContent() {
  const params  = useSearchParams();
  const router  = useRouter();
  const { status } = useSession();
  const projeto = params.get('projeto') ?? '';

  const [fases, setFases]       = useState<FaseAcaoItem[]>([]);
  const [logs, setLogs]         = useState<DiarioLogItem[]>([]);
  const [nomeLoja, setNomeLoja] = useState<string>('');
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');
  const [mostrarTodosLogs, setMostrarTodosLogs] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [resFases, resLogs, resLojas] = await Promise.all([
        fetch('/api/fases'),
        fetch('/api/diario-logs'),
        fetch('/api/lojas'),
      ]);

      if (!resFases.ok || !resLogs.ok) {
        setLoadError('Não foi possível carregar os dados do relatório. Tente recarregar a página.');
      }

      if (resFases.ok) {
        const { fases: all } = await resFases.json();
        const filtradas: FaseAcaoItem[] = projeto === '__todos__' || !projeto
          ? (all ?? []).filter((f: FaseAcaoItem) => !f.isDeleted)
          : (all ?? []).filter((f: FaseAcaoItem) => !f.isDeleted && (f.projetoCliente ?? '').trim() === projeto.trim());
        setFases(filtradas);
      }

      if (resLogs.ok) {
        const { logs: allLogs } = await resLogs.json();
        const filtradosLogs: DiarioLogItem[] = projeto === '__todos__' || !projeto
          ? (allLogs ?? [])
          : (allLogs ?? []).filter((l: DiarioLogItem) => (l.projetoCliente ?? '').trim() === projeto.trim());
        setLogs(filtradosLogs);
      }

      if (resLojas.ok) {
        const dataLojas = await resLojas.json();
        const mapProjLojas = dataLojas?.projetosLojas || {};
        if (projeto && mapProjLojas[projeto]) {
          setNomeLoja(mapProjLojas[projeto]);
        }
      }
    } catch {
      setLoadError('Erro de conexão ao carregar o relatório. Tente recarregar a página.');
    } finally {
      setLoading(false);
    }
  }, [projeto]);

  useEffect(() => {
    if (status === 'authenticated') {
      load();
    }
  }, [status, load]);

  const nomeProjeto = (!projeto || projeto === '__todos__') ? 'Consolidado Geral de Obras' : projeto;

  // Métricas
  const totalAcoes = fases.length;
  const concluidas = fases.filter(f => f.status === 'Concluído').length;
  const hojeMeiaNoite = new Date();
  hojeMeiaNoite.setHours(0, 0, 0, 0);

  const atrasadas = fases.filter(f => {
    if (f.status === 'Concluído' || !f.prazoLimite) return false;
    const prazo = new Date(`${String(f.prazoLimite).slice(0, 10)}T00:00:00`);
    if (isNaN(prazo.getTime())) return false;
    return prazo < hojeMeiaNoite;
  }).length;

  const pctGeral = totalAcoes > 0 ? Math.round((concluidas / totalAcoes) * 100) : 0;

  // Responsáveis únicos
  const responsaveis = useMemo(() => {
    const set = new Set<string>();
    fases.forEach(f => { if (f.responsavel) set.add(f.responsavel.trim()); });
    logs.forEach(l => {
      if (l.responsavel) {
        l.responsavel.split(',').forEach(r => {
          const limpo = r.trim();
          if (limpo) set.add(limpo);
        });
      }
    });
    return Array.from(set).sort();
  }, [fases, logs]);

  const logsExibidos = useMemo(() => {
    return mostrarTodosLogs ? logs : logs.slice(0, 16);
  }, [logs, mostrarTodosLogs]);

  // Exportação CSV
  const handleExportCSV = () => {
    const headers = ['Tipo', 'Projeto', 'Data/Prazo', 'Responsável', 'Etapa/Fase', 'Status', 'Observações'];
    const rowsLogs = logs.map(l => [
      'Apontamento Campo',
      l.projetoCliente || nomeProjeto,
      l.data,
      l.responsavel,
      l.atividade,
      l.status,
      (l.observacoes || '').replace(/\r?\n/g, ' ')
    ]);
    const rowsFases = fases.map(f => [
      'Fase Contratual',
      f.projetoCliente || nomeProjeto,
      f.prazoLimite ? f.prazoLimite.slice(0, 10) : '',
      f.responsavel,
      f.gabarito,
      f.status,
      (f.observacoes || '').replace(/\r?\n/g, ' ')
    ]);

    const hojeStr = new Date().toISOString().split('T')[0];
    const slug = nomeProjeto.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    exportToCSV(`relatorio-executivo-${slug}-${hojeStr}.csv`, headers, [...rowsLogs, ...rowsFases]);
  };

  const hojeFormatado = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen font-sans bg-slate-50 text-slate-600 gap-3">
      <span className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm font-semibold">Gerando relatório executivo da diretoria...</span>
    </div>
  );

  if (loadError) return (
    <div className="flex flex-col items-center justify-center min-h-screen font-sans p-6 text-center text-rose-600">
      <AlertTriangle className="w-12 h-12 mb-3 text-rose-500" />
      <p className="text-base font-bold">{loadError}</p>
      <button
        onClick={() => router.back()}
        className="mt-4 px-4 py-2 rounded-lg bg-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-300"
      >
        Voltar
      </button>
    </div>
  );

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 14mm 14mm 14mm;
          }
          html, body {
            background: #ffffff !important;
            color: #0f172a !important;
            font-size: 10.5pt !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .print-full-width {
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          thead {
            display: table-header-group;
          }
          tr {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .shadow-sm, .shadow-md, .shadow-lg, .shadow-xl {
            box-shadow: none !important;
          }
          .border {
            border-color: #cbd5e1 !important;
          }
        }
      `}</style>

      {/* BARRA SUPERIOR DE AÇÕES (OCULTA NA IMPRESSÃO/PDF) */}
      <div className="no-print sticky top-0 z-50 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-white px-4 sm:px-8 py-3 shadow-lg">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar ao Sistema</span>
            </button>
            <span className="text-xs text-slate-400 hidden md:inline">
              Visualização de Impressão Executiva (A4)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {logs.length > 16 && (
              <button
                type="button"
                onClick={() => setMostrarTodosLogs(!mostrarTodosLogs)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition-colors"
              >
                {mostrarTodosLogs ? 'Mostrar Recentes (16)' : `Mostrar Todos os Relatos (${logs.length})`}
              </button>
            )}

            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-colors"
              title="Baixar planilha compatível com Microsoft Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Excel (CSV)</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-500/25 transition-all active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Salvar PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* DOCUMENTO PRINCIPAL (FORMATO A4 EXECUTIVO) */}
      <main className="print-full-width max-w-4xl mx-auto px-6 py-8 sm:py-10 bg-white text-slate-900 font-sans">
        
        {/* CABEÇALHO TIMBRADO OFICIAL */}
        <header className="border-b-2 border-slate-900 pb-5 mb-6">
          <div className="flex items-start justify-between gap-4">
            
            {/* Logo e Identificação */}
            <div className="flex items-center gap-4">
              <img
                src="/logo-terra-cafe.png"
                alt="TerraCafé Irrigação"
                className="h-12 w-auto object-contain shrink-0"
              />
              <div className="h-10 w-px bg-slate-300" />

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    Relatório Técnico Executivo
                  </span>
                  {nomeLoja && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      Filial: {nomeLoja}
                    </span>
                  )}
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                  {nomeProjeto}
                </h1>
              </div>
            </div>

            {/* Data e Status Geral */}
            <div className="text-right shrink-0">
              <div className="text-2xl font-black text-blue-600 leading-none">
                {logs.length > 0 ? `${logs.length} Relatos` : `${pctGeral}%`}
              </div>
              <p className="text-[11px] font-semibold text-slate-500 mt-1">
                {logs.length > 0 ? 'apontamentos de campo' : 'progresso contratual'}
              </p>
              <p className="text-[10px] text-slate-400 mt-1 capitalize">
                {hojeFormatado}
              </p>
            </div>
          </div>
        </header>

        {/* CARDS DE INDICADORES EXECUTIVOS (KPIS) */}
        <section className="mb-7 avoid-break">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            
            <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Apontamentos</span>
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="text-xl font-extrabold text-slate-900">{logs.length}</div>
              <p className="text-[10px] text-slate-500">registros no diário</p>
            </div>

            <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Eficiência de Ritmo</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="text-xl font-extrabold text-emerald-600">
                {logs.length > 0 
                  ? `${Math.round((logs.filter(l => !(l.status || '').toLowerCase().includes('abaixo') && !(l.status || '').toLowerCase().includes('problema')).length / logs.length) * 100)}%`
                  : '100%'}
              </div>
              <p className="text-[10px] text-slate-500">dentro ou acima da meta</p>
            </div>

            <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Paradas Climáticas</span>
                <CloudRain className="w-3.5 h-3.5 text-cyan-600" />
              </div>
              <div className="text-xl font-extrabold text-cyan-700">
                {logs.filter(l => (l.status || '').toLowerCase().includes('chuva')).length}
              </div>
              <p className="text-[10px] text-slate-500">dias com chuva/paralisação</p>
            </div>

            <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Fases / Prazos</span>
                <AlertTriangle className={`w-3.5 h-3.5 ${atrasadas > 0 ? 'text-rose-500' : 'text-slate-400'}`} />
              </div>
              <div className="text-xl font-extrabold text-slate-900">
                {concluidas}/{totalAcoes}
                {atrasadas > 0 && (
                  <span className="text-xs font-bold text-rose-600 ml-1.5">
                    ({atrasadas} em atraso)
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500">marcos contratuais</p>
            </div>

          </div>
        </section>

        {/* CICLO TÉCNICO DAS 6 FASES DA IRRIGAÇÃO */}
        <section className="mb-7 avoid-break">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-600" />
              Ciclo Técnico de Campo (6 Etapas da Irrigação)
            </h2>
            <span className="text-[10px] font-semibold text-slate-400">
              Monitoramento sequencial da obra
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {ETAPAS_CAMPO.map((etp) => {
              const logsEtp = logs.filter(l => (l.atividade || '').toLowerCase().includes(etp.key.toLowerCase()));
              const count = logsEtp.length;
              const hasActivity = count > 0;

              return (
                <div
                  key={etp.key}
                  className={`border rounded-xl p-2.5 text-center transition-all ${
                    hasActivity
                      ? 'border-blue-300 bg-blue-50/50'
                      : 'border-slate-200 bg-slate-50/30'
                  }`}
                >
                  <div className="text-xl mb-1">{etp.icon}</div>
                  <h3 className="text-[11px] font-bold text-slate-800 leading-tight">
                    {etp.label}
                  </h3>
                  <p className="text-[9px] text-slate-500 mt-0.5 line-clamp-1">{etp.desc}</p>
                  <div className="mt-2 pt-1.5 border-t border-slate-200/80">
                    <span className={`text-[10px] font-extrabold ${hasActivity ? 'text-blue-700' : 'text-slate-400'}`}>
                      {count} relato{count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* DIÁRIO DE CAMPO - APONTAMENTOS DE OBRAS */}
        {logs.length > 0 && (
          <section className="mb-7">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-blue-600" />
                Diário de Obras — Apontamentos Operacionais {mostrarTodosLogs ? `(Todos: ${logs.length})` : `(Últimos ${logsExibidos.length})`}
              </h2>
              <span className="text-[10px] text-slate-400">
                Ordem cronológica decrescente
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 text-[10.5px]">
                    <th className="py-2.5 px-3 font-bold w-[12%]">Data</th>
                    <th className="py-2.5 px-3 font-bold w-[20%]">Etapa</th>
                    <th className="py-2.5 px-3 font-bold w-[22%]">Responsável</th>
                    <th className="py-2.5 px-3 font-bold w-[18%]">Status</th>
                    <th className="py-2.5 px-3 font-bold">Observações de Campo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {logsExibidos.map(l => {
                    const st = STATUS_COLOR[l.status] || { bg: '#f1f5f9', text: '#334155', border: '#e2e8f0' };
                    return (
                      <tr key={l.id} className="hover:bg-slate-50/60">
                        <td className="py-2 px-3 font-bold text-slate-700 whitespace-nowrap">
                          {new Date(`${l.data}T00:00:00`).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900 capitalize">
                          {l.atividade}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {l.responsavel || <span className="text-slate-400 italic">Geral</span>}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border"
                            style={{ backgroundColor: st.bg, color: st.text, borderColor: st.border }}
                          >
                            {l.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-600 leading-snug">
                          {l.observacoes || <span className="text-slate-400 italic">Sem anotações complementares.</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!mostrarTodosLogs && logs.length > 16 && (
              <p className="no-print text-[11px] text-slate-400 text-right mt-1.5 italic">
                Exibindo 16 de {logs.length} registros. Clique em &quot;Mostrar Todos&quot; na barra superior para exportar a totalidade.
              </p>
            )}
          </section>
        )}

        {/* PIPELINE CONTRATUAL E SUPRIMENTOS */}
        {fases.length > 0 && (
          <section className="mb-7 avoid-break">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-600" />
                Pipeline Contratual & Marcos da Obra
              </h2>
              <span className="text-[10px] text-slate-400">
                Prazos e entregáveis formais
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 text-[10.5px]">
                    <th className="py-2.5 px-3 font-bold w-[28%]">Gabarito / Fase</th>
                    <th className="py-2.5 px-3 font-bold w-[22%]">Responsável</th>
                    <th className="py-2.5 px-3 font-bold w-[15%]">Prazo Limite</th>
                    <th className="py-2.5 px-3 font-bold w-[17%]">Situação</th>
                    <th className="py-2.5 px-3 font-bold">Observações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {fases.map(f => {
                    const st = STATUS_COLOR[f.status] || { bg: '#f1f5f9', text: '#334155', border: '#e2e8f0' };
                    return (
                      <tr key={f.id} className="hover:bg-slate-50/60">
                        <td className="py-2 px-3 font-bold text-slate-900">
                          {f.gabarito}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {f.responsavel}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-700">
                          {f.prazoLimite ? new Date(`${f.prazoLimite}T00:00:00Z`).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border"
                            style={{ backgroundColor: st.bg, color: st.text, borderColor: st.border }}
                          >
                            {f.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-500">
                          {f.observacoes || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* EQUIPE ENVOLVIDA */}
        {responsaveis.length > 0 && (
          <section className="mb-8 avoid-break">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-600" />
                Quadro de Responsáveis e Equipe Técnica ({responsaveis.length})
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {responsaveis.map(r => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {r}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* CAMPO DE ASSINATURAS / TERMO DE ENTREGA TÉCNICA */}
        <section className="mt-10 pt-6 border-t border-slate-300 avoid-break">
          <div className="grid grid-cols-2 gap-12 text-center">
            <div>
              <div className="border-b border-slate-400 mb-2 w-3/4 mx-auto" />
              <p className="text-xs font-bold text-slate-800">Responsável Técnico de Campo</p>
              <p className="text-[10px] text-slate-500">TerraCafé Irrigação & Montagem</p>
            </div>
            <div>
              <div className="border-b border-slate-400 mb-2 w-3/4 mx-auto" />
              <p className="text-xs font-bold text-slate-800">Diretoria de Operações</p>
              <p className="text-[10px] text-slate-500">Aprovação e Validação de Obra</p>
            </div>
          </div>
        </section>

        {/* RODAPÉ DO DOCUMENTO */}
        <footer className="mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400 flex items-center justify-between">
          <span>TerraCafé Irrigação · Sistema de Gestão Operacional de Campo</span>
          <span>Página Oficial de Relatório · Emitido em {new Date().toLocaleDateString('pt-BR')}</span>
        </footer>

      </main>
    </>
  );
}

export default function RelatorioPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen font-sans text-slate-500">
        Carregando relatório...
      </div>
    }>
      <RelatorioContent />
    </Suspense>
  );
}
