"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, ArrowRight, Leaf, CheckCircle, Copy, ArrowLeft } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

export default function EsqueciMinhaSenhaPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState('');
  const [debugLink, setDebugLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsLoading(true);
    setErro('');
    setMensagemSucesso('');
    setDebugLink(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        setErro(json?.error || 'Não foi possível processar a solicitação. Tente novamente.');
        setIsLoading(false);
        return;
      }

      setMensagemSucesso(json?.message ?? 'Instruções enviadas.');
      if (json?.debugLink) setDebugLink(json.debugLink);
    } catch (err) {
      console.error('[esqueci-senha] erro:', err);
      setErro('Erro de conexão. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const copiarLink = async () => {
    if (!debugLink) return;
    try {
      await navigator.clipboard.writeText(debugLink);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* não crítico — usuário pode selecionar manualmente */
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070c18] flex items-center justify-center p-4 relative overflow-hidden font-sans">

      <div className="absolute top-4 right-4 z-50"><ThemeToggle /></div>
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none opacity-30">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600 rounded-full blur-[120px]"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-emerald-600 rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full max-w-md bg-white dark:bg-[#0d1527]/80 backdrop-blur-xl border border-slate-200 dark:border-[#1e293b] rounded-2xl shadow-2xl z-10 p-8 sm:p-10">

        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-14 h-14 bg-blue-600/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
            <Leaf className="w-7 h-7 text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Recuperar senha</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Informe seu e-mail corporativo e enviaremos o link de redefinição.
          </p>
        </div>

        {erro && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-lg text-sm mb-6 flex items-center gap-2">
            <Mail className="w-4 h-4 shrink-0" />
            {erro}
          </div>
        )}

        {mensagemSucesso && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 p-3 rounded-lg text-sm mb-6 flex items-start gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{mensagemSucesso}</span>
          </div>
        )}

        {debugLink && !mensagemSucesso.includes('enviamos as instruções') && (
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 p-4 rounded-lg text-sm mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" /> Link de redefinição gerado (modo dev):
              </p>
              <button
                type="button"
                onClick={copiarLink}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-amber-500/20 hover:bg-amber-500/30 transition-colors border border-amber-500/30"
              >
                <Copy className="w-3 h-3" />
                {copiado ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <div className="font-mono text-[11px] break-all px-2 py-1.5 rounded bg-black/5 dark:bg-white/5 border border-amber-500/20 select-all">
              {debugLink}
            </div>
            <p className="mt-2 text-xs opacity-90">
              Copie o link completo e cole na barra do navegador para redefinir.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">E-mail Corporativo</label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                required
                placeholder="seu.nome@terracafe.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg pl-10 pr-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3 font-medium transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-2"
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            ) : (
              <>
                Enviar link de redefinição
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-500 dark:text-slate-400 dark:hover:text-blue-400 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  );
}
