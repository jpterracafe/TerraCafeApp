"use client";

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

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
  { key: 'Valetas',                    label: '01. Valetas',                    icon: '⛏️' },
  { key: 'montagem campo',             label: '02. Montagem Campo',             icon: '🌱' },
  { key: 'casa de bombas',             label: '03. Casa de Bombas',             icon: '⚙️' },
  { key: 'elétrica',                   label: '04. Elétrica',                   icon: '⚡' },
  { key: 'lavagem do sistema e testes', label: '05. Lavagem e Testes',           icon: '💧' },
  { key: 'entrega técnica',            label: '06. Entrega Técnica',            icon: '📋' },
];

const STATUS_COLOR: Record<string, string> = {
  'Dentro do programado': '#10b981',
  'Dentro do Programado': '#10b981',
  'Acima':                '#2563eb',
  'Abaixo':               '#e11d48',
  'Chuva/Paralisação':    '#0891b2',
  'Problema Técnico':     '#e11d48',
  'Comercial/Ajustes':    '#d97706',
  'Aguardando material':  '#ca8a04',
  'Concluído':            '#10b981',
};

function RelatorioContent() {
  const params  = useSearchParams();
  const router  = useRouter();
  const { status } = useSession();
  const projeto = params.get('projeto') ?? '';

  const [fases, setFases]   = useState<FaseAcaoItem[]>([]);
  const [logs, setLogs]     = useState<DiarioLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  const load = useCallback(async () => {
    try {
      const [resFases, resLogs] = await Promise.all([
        fetch('/api/fases'),
        fetch('/api/diario-logs'),
      ]);

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
    } finally {
      setLoading(false);
    }
  }, [projeto]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#64748b' }}>
      Gerando relatório executivo da diretoria...
    </div>
  );

  const totalAcoes = fases.length;
  const concluidas = fases.filter(f => f.status === 'Concluído').length;
  const atrasadas  = fases.filter(f => f.status !== 'Concluído' && new Date(`${f.prazoLimite}T00:00:00Z`) < new Date()).length;
  const pctGeral   = totalAcoes > 0 ? Math.round((concluidas / totalAcoes) * 100) : 0;

  // Responsáveis únicos
  const respFases = fases.map(f => f.responsavel);
  const respLogs  = logs.map(l => l.responsavel);
  const responsaveis = Array.from(new Set([...respFases, ...respLogs])).filter(Boolean);

  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const nomeProjeto = (!projeto || projeto === '__todos__') ? 'Consolidado Geral de Obras' : projeto;

  // Resumo de Campo
  const logsRecentes = logs.slice(0, 8);

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 15mm 12mm; size: A4 portrait; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 11px; color: #1e293b; background: #fff; line-height: 1.4; }
        h1 { font-size: 20px; font-weight: 800; color: #0f172a; }
        h2 { font-size: 12px; font-weight: 700; color: #0f172a; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 4px; }
        h3 { font-size: 11px; font-weight: 700; color: #334155; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 6px; }
        th { background: #f8fafc; padding: 6px 8px; text-align: left; font-weight: 700; color: #475569; border-bottom: 1px solid #cbd5e1; font-size: 9.5px; }
        td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: middle; }
        tr:last-child td { border-bottom: none; }
        .badge { display: inline-block; padding: 2px 7px; border-radius: 9999px; font-size: 9px; font-weight: 700; }
      `}</style>

      {/* BOTÃO IMPRIMIR */}
      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, zIndex: 100, display: 'flex', gap: 8 }}>
        <button
          onClick={() => window.print()}
          style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 12, boxShadow: '0 4px 6px -1px rgba(37,99,235,0.3)' }}
        >
          🖨️ Imprimir / Salvar PDF
        </button>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 20px' }}>

        {/* CABEÇALHO */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 14, borderBottom: '2.5px solid #2563eb' }}>
          <div>
            <div style={{ fontSize: 9.5, color: '#64748b', fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 }}>
              TerraCafé Irrigação · Relatório Executivo de Diretoria
            </div>
            <h1>{nomeProjeto}</h1>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>
              Emitido em {hoje} · Base de dados de campo e execução
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontStyle: 'normal', fontWeight: 900, color: '#2563eb', lineHeight: 1 }}>
              {logs.length > 0 ? `${logs.length} Relatos` : `${pctGeral}%`}
            </div>
            <div style={{ fontSize: 9.5, fontWeight: 600, color: '#64748b', marginTop: 2 }}>
              {logs.length > 0 ? 'apontamentos no diário' : 'conclusão contratual'}
            </div>
          </div>
        </div>

        {/* KPIS EXECUTIVOS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 9.5, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Apontamentos Campo</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#2563eb', marginTop: 2 }}>{logs.length}</div>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 9.5, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Eficiência no Ritmo</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#10b981', marginTop: 2 }}>
              {logs.length > 0 
                ? `${Math.round((logs.filter(l => !(l.status || '').toLowerCase().includes('abaixo') && !(l.status || '').toLowerCase().includes('problema')).length / logs.length) * 100)}%`
                : '100%'}
            </div>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 9.5, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Paradas por Chuva</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#0891b2', marginTop: 2 }}>
              {logs.filter(l => (l.status || '').toLowerCase().includes('chuva')).length}
            </div>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 9.5, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Tarefas Contratuais</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: atrasadas > 0 ? '#e11d48' : '#334155', marginTop: 2 }}>
              {concluidas}/{totalAcoes} <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b' }}>({atrasadas} atrasos)</span>
            </div>
          </div>
        </div>

        {/* RADAR DAS 5 ETAPAS DE CAMPO DA IRRIGAÇÃO */}
        <div style={{ marginBottom: 20 }}>
          <h2>Ciclo Técnico de Campo (5 Etapas da Irrigação)</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {ETAPAS_CAMPO.map((etp) => {
              const logsEtp = logs.filter(l => (l.atividade || '').toLowerCase().includes(etp.key.toLowerCase()));
              const count = logsEtp.length;
              return (
                <div key={etp.key} style={{ background: count > 0 ? '#eff6ff' : '#f8fafc', border: `1px solid ${count > 0 ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, marginBottom: 2 }}>{etp.icon}</div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: '#1e293b' }}>{etp.label}</div>
                  <div style={{ fontSize: 10, color: count > 0 ? '#2563eb' : '#94a3b8', fontWeight: 800, marginTop: 3 }}>
                    {count} apontamento{count !== 1 ? 's' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* DIÁRIO DE CAMPO - ÚLTIMOS RELATOS */}
        {logsRecentes.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h2>Apontamentos Recentes de Campo (Diário de Obras)</h2>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '13%' }}>Data</th>
                  <th style={{ width: '22%' }}>Responsável</th>
                  <th style={{ width: '20%' }}>Etapa / Atividade</th>
                  <th style={{ width: '18%' }}>Status</th>
                  <th>Observações Operacionais</th>
                </tr>
              </thead>
              <tbody>
                {logsRecentes.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600 }}>{new Date(`${l.data}T00:00:00`).toLocaleDateString('pt-BR')}</td>
                    <td>{l.responsavel}</td>
                    <td><strong style={{ color: '#0f172a' }}>{l.atividade}</strong></td>
                    <td>
                      <span className="badge" style={{ background: `${STATUS_COLOR[l.status] ?? '#94a3b8'}22`, color: STATUS_COLOR[l.status] ?? '#334155' }}>
                        {l.status}
                      </span>
                    </td>
                    <td style={{ color: '#475569', fontSize: 9.5 }}>
                      {l.observacoes || 'Sem observações'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* FASES CONTRATUAIS */}
        {fases.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h2>Pipeline Contratual & Suprimentos</h2>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Gabarito / Fase</th>
                  <th style={{ width: '24%' }}>Responsável</th>
                  <th style={{ width: '15%' }}>Prazo</th>
                  <th style={{ width: '18%' }}>Situação</th>
                  <th>Observações</th>
                </tr>
              </thead>
              <tbody>
                {fases.map(f => (
                  <tr key={f.id}>
                    <td><strong>{f.gabarito}</strong></td>
                    <td>{f.responsavel}</td>
                    <td>{new Date(`${f.prazoLimite}T00:00:00Z`).toLocaleDateString('pt-BR')}</td>
                    <td>
                      <span className="badge" style={{ background: `${STATUS_COLOR[f.status] ?? '#94a3b8'}22`, color: STATUS_COLOR[f.status] ?? '#334155' }}>
                        {f.status}
                      </span>
                    </td>
                    <td style={{ color: '#64748b' }}>{f.observacoes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* EQUIPE ENVOLVIDA */}
        {responsaveis.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h2>Equipe Técnica e Operacional</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {responsaveis.map(r => (
                <div key={r} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', fontSize: 10, color: '#334155', fontWeight: 600 }}>
                  👤 {r}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RODAPÉ */}
        <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#94a3b8' }}>
          <span>TerraCafé Irrigação · Documento Gerado Automaticamente</span>
          <span>{hoje}</span>
        </div>

      </div>
    </>
  );
}

export default function RelatorioPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>Carregando relatório...</div>}>
      <RelatorioContent />
    </Suspense>
  );
}
