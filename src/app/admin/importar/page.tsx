"use client";

import React, { useState, useRef, useEffect } from 'react';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import BackButton from '@/components/BackButton';
import { useSession } from 'next-auth/react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  Download, 
  RefreshCw, 
  ShieldCheck, 
  ChevronRight, 
  FileText, 
  Layers, 
  Database,
  ArrowRight,
  Sparkles,
  Info
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface NormalizedRecord {
  idFirebird: number | null;
  nome: string;
  status: string | null;
  responsavel: string | null;
  dataInicio: string | null;
  areaTotal: number | null;
}

export default function AdminImportarCSVPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAuthorized, setIsAuthorized] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewData, setPreviewData] = useState<NormalizedRecord[]>([]);
  const [stats, setStats] = useState<{ total: number; saved: number; errors: number; isDb: boolean } | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Authentication check
  useEffect(() => {
    if (status === 'loading') return;
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (status !== 'authenticated' || role !== 'Desenvolvedor') {
      router.push(status === 'authenticated' ? '/irrigacao/execucao' : '/login');
    } else {
      setIsAuthorized(true);
    }
  }, [session, status, router]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      setNotification({ type: 'error', text: 'Por favor, selecione um arquivo no formato .CSV ou .TXT exportado do IBExpert.' });
      return;
    }
    setSelectedFile(file);
    setNotification(null);
    setStats(null);
    setPreviewData([]);
  };

  const handleUploadAndProcess = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setNotification({ type: 'info', text: 'Processando arquivo CSV com segurança...' });

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/importar-csv', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao processar o arquivo.');
      }

      setPreviewData(result.records || []);
      setStats({
        total: result.totalRows,
        saved: result.savedCount,
        errors: result.errorsCount,
        isDb: result.isDbConfigured,
      });

      // Também sincroniza diretamente no armazenamento local da aplicação para atualizar a visualização na hora
      if (result.records && result.records.length > 0) {
        const mappedFases = result.records.map((rec: NormalizedRecord, idx: number) => ({
          id: rec.idFirebird ? `fb-${rec.idFirebird}` : `import-${Date.now()}-${idx}`,
          gabarito: rec.nome,
          responsavel: rec.responsavel || 'Não Definido',
          dataInicio: rec.dataInicio ? rec.dataInicio.split('T')[0] : '2026-08-30',
          prazoDias: 15,
          status: (rec.status === 'Concluído' || rec.status === 'Em Andamento' || rec.status === 'Problema técnico') 
            ? rec.status 
            : 'Em Andamento',
          areaTotal: rec.areaTotal || null,
        }));

        localStorage.setItem('terracafe_fases', JSON.stringify(mappedFases));
        
        // Atualiza também os responsáveis se houver
        const respUnicos = Array.from(new Set(result.records.map((r: NormalizedRecord) => r.responsavel).filter(Boolean)));
        if (respUnicos.length > 0) {
          const respFormatados = respUnicos.map((nome, idx) => ({
            id: `resp-fb-${idx}`,
            nome: String(nome),
            cargo: 'Técnico de Campo',
            origem: 'BANCO_DADOS',
            status: 'Ativo',
          }));
          localStorage.setItem('terracafe_responsaveis', JSON.stringify(respFormatados));
        }
      }

      setNotification({
        type: 'success',
        text: `Sucesso! ${result.savedCount} projetos foram importados e sincronizados com a plataforma.`,
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        text: err.message || 'Ocorreu um erro ao importar o arquivo.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = "ID;NOME;STATUS;RESPONSAVEL;DATA_INICIO;AREA_TOTAL\n101;Pivô Central 01 - Setor Norte;Em Andamento;Carlos Mendes;2026-08-15;45.5\n102;Gotejamento Talhão Café Arábica;Concluído;Mariana Silva;2026-07-20;28.0\n103;Aspersão Convencional Lote B;Problema técnico;João Paulo;2026-08-01;12.3";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'modelo_exportacao_ibexpert.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070c18] text-slate-700 dark:text-slate-300 p-4 md:p-6 lg:p-8 font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400 mb-2">
            <BackButton />
            <span>Portal</span>
            <ChevronRight className="w-4 h-4" />
            <span>Administração</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-slate-900 dark:text-white font-medium">Importação Segura (CSV)</span>
          </nav>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-emerald-500" />
            Sincronizador Air-Gapped (Risco Zero)
          </h1>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <ThemeToggle />
          <LogoutButton />
          
          <Link 
            href="/irrigacao/execucao"
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20 text-sm"
          >
            <Layers className="w-4 h-4" />
            Ver no Painel de Irrigação
          </Link>
        </div>
      </div>

      {/* SECURITY BANNER */}
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-emerald-700 dark:text-emerald-300">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <h4 className="font-semibold text-sm">Ambiente 100% Isolado da Rede da Empresa</h4>
            <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">
              O sistema não faz requisições à rede local da empresa. Todos os dados são processados via arquivo seguro.
            </p>
          </div>
        </div>

        <button 
          onClick={handleDownloadTemplate}
          className="flex items-center gap-2 text-xs font-medium bg-white dark:bg-[#0d1527] border border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-[#111a30] text-emerald-600 dark:text-emerald-400 px-3 py-2 rounded-lg transition-colors shrink-0"
        >
          <Download className="w-4 h-4" />
          Baixar Modelo CSV do IBExpert
        </button>
      </div>

      {/* NOTIFICATIONS */}
      {notification && (
        <div className={`p-4 rounded-xl mb-6 text-sm flex items-center gap-3 border ${
          notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
          notification.type === 'error' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
          'bg-blue-500/10 border-blue-500/30 text-blue-400'
        }`}>
          {notification.type === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0" />}
          {notification.type === 'error' && <AlertTriangle className="w-5 h-5 shrink-0" />}
          {notification.type === 'info' && <RefreshCw className="w-5 h-5 shrink-0 animate-spin" />}
          <span>{notification.text}</span>
        </div>
      )}

      {/* MAIN UPLOAD CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* DRAG & DROP CARD */}
        <div className="lg:col-span-1 bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl shadow-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-blue-500" />
              Carregar Arquivo
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              Exporte a tabela de irrigação no IBExpert (como CSV) e solte o arquivo aqui.
            </p>

            <div 
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                dragActive 
                  ? 'border-blue-500 bg-blue-500/10 scale-102' 
                  : 'border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 bg-slate-50 dark:bg-[#070c18]'
              }`}
            >
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".csv, .txt"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {selectedFile ? selectedFile.name : 'Arraste o arquivo CSV ou clique aqui'}
              </div>
              <span className="text-xs text-slate-400">Suporta .CSV ou .TXT exportados pelo IBExpert</span>
            </div>

            {selectedFile && (
              <div className="mt-4 p-3 bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 truncate">
                  <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="truncate text-slate-700 dark:text-slate-300">{selectedFile.name}</span>
                </div>
                <span className="text-slate-500 font-mono">{(selectedFile.size / 1024).toFixed(1)} KB</span>
              </div>
            )}
          </div>

          <div className="mt-6">
            <button
              onClick={handleUploadAndProcess}
              disabled={!selectedFile || isProcessing}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 rounded-lg transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Sincronizar Projetos Agora
                </>
              )}
            </button>
          </div>
        </div>

        {/* INSTRUCTIONS & STATS */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* STATS IF AVAILABLE */}
          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] p-5 rounded-xl">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total no Arquivo</p>
                <h4 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.total}</h4>
                <p className="text-xs text-blue-500 mt-1">Linhas processadas</p>
              </div>
              <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] p-5 rounded-xl">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Importados com Sucesso</p>
                <h4 className="text-2xl font-bold text-emerald-500 mt-1">{stats.saved}</h4>
                <p className="text-xs text-emerald-400 mt-1">Prontos na plataforma</p>
              </div>
              <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] p-5 rounded-xl">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Destino dos Dados</p>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white mt-1 flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-500" />
                  {stats.isDb ? 'Banco Supabase' : 'Armazenamento Local'}
                </h4>
                <p className="text-xs text-slate-400 mt-1">Sessão ativa e sincronizada</p>
              </div>
            </div>
          )}

          {/* PREVIEW TABLE OR INSTRUCTIONS */}
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-[#1e293b] flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-500" />
                {previewData.length > 0 ? `Prévia dos Dados (${previewData.length} itens)` : 'Passo a Passo no IBExpert'}
              </h3>
              {previewData.length > 0 && (
                <Link 
                  href="/irrigacao/execucao"
                  className="text-xs font-medium text-blue-500 hover:text-blue-400 flex items-center gap-1"
                >
                  Abrir no Painel <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>

            {previewData.length > 0 ? (
              <div className="overflow-x-auto max-h-[350px]">
                <table className="w-full text-xs text-left">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-[#0b1329] border-b border-slate-200 dark:border-[#1e293b] text-slate-500 dark:text-slate-400 uppercase">
                    <tr>
                      <th className="px-4 py-3">Cód Firebird</th>
                      <th className="px-4 py-3">Nome do Projeto</th>
                      <th className="px-4 py-3">Responsável</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Área (ha)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-[#1e293b]">
                    {previewData.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-[#111a30]">
                        <td className="px-4 py-2.5 font-mono text-blue-400">#{item.idFirebird || idx + 1}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">{item.nome}</td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{item.responsavel || '-'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            item.status === 'Concluído' ? 'bg-emerald-500/10 text-emerald-400' :
                            item.status === 'Problema técnico' ? 'bg-rose-500/10 text-rose-400' :
                            'bg-blue-500/10 text-blue-400'
                          }`}>
                            {item.status || 'Em Andamento'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{item.areaTotal ? `${item.areaTotal} ha` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 space-y-4 text-sm text-slate-600 dark:text-slate-400">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-500 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">1</div>
                  <div>
                    <strong className="text-slate-900 dark:text-white block">Abra o IBExpert na Área de Trabalho Remota</strong>
                    Conecte no banco da empresa com os dados fornecidos pelo Lucas/TI.
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-500 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">2</div>
                  <div>
                    <strong className="text-slate-900 dark:text-white block">Execute a consulta SQL</strong>
                    Abra o SQL Editor e digite a consulta da tabela de irrigação (ex: <code>SELECT * FROM PROJETOS_IRRIGACAO</code>).
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-500 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">3</div>
                  <div>
                    <strong className="text-slate-900 dark:text-white block">Exporte para CSV</strong>
                    Clique com o botão direito no resultado da tabela e escolha <em>Export Data to CSV</em> (ou use delimitador ponto e vírgula <code>;</code>).
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-500 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">4</div>
                  <div>
                    <strong className="text-slate-900 dark:text-white block">Envie o arquivo aqui</strong>
                    Copie o arquivo para o seu computador e faça o upload no quadro ao lado.
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
