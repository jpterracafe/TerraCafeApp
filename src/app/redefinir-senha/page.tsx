"use client";

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, ArrowRight, Leaf, CheckCircle, ArrowLeft, AlertTriangle } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

function RedefinirSenhaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [tokenValido, setTokenValido] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) {
      setTokenValido(false);
      setErro('Token não encontrado. Solicite um novo link de redefinição.');
    } else {
      setTokenValido(true);
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setIsLoading(true);
    setErro('');
    setSucesso('');

    if (novaSenha.length < 6) {
      setErro('A nova senha deve ter pelo menos 6 caracteres.');
      setIsLoading(false);
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setErro('As senhas digitadas não conferem.');
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, novaSenha, confirmarSenha }),
      });
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        setErro(json?.error || 'Não foi possível redefinir a senha. Tente novamente.');
        setIsLoading(false);
        return;
      }

      setSucesso(json?.message || 'Senha redefinida com sucesso!');

      setTimeout(() => {
        router.replace(json?.redirectTo || '/login');
      }, 2500);
    } catch (err) {
      console.error('[redefinir-senha] erro:', err);
      setErro('Erro de conexão. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const forcaSenha = (() => {
    let pontos = 0;
    if (novaSenha.length >= 6) pontos++;
    if (novaSenha.length >= 10) pontos++;
    if (/[A-Z]/.test(novaSenha)) pontos++;
    if (/[0-9]/.test(novaSenha)) pontos++;
    if (/[^A-Za-z0-9]/.test(novaSenha)) pontos++;
    return pontos;
  })();

  const corForca = forcaSenha <= 1 ? 'bg-rose-500' : forcaSenha <= 2 ? 'bg-amber-500' : forcaSenha <= 3 ? 'bg-yellow-400' : forcaSenha <= 4 ? 'bg-lime-500' : 'bg-emerald-500';
  const labelForca = forcaSenha <= 1 ? 'Fraca' : forcaSenha <= 2 ? 'Razoável' : forcaSenha <= 3 ? 'Boa' : forcaSenha <= 4 ? 'Forte' : 'Excelente';

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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Redefinir senha</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Digite sua nova senha abaixo.
          </p>
        </div>

        {tokenValido === false && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-lg mb-6">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">Link inválido ou expirado</p>
                <p className="text-sm opacity-90">
                  Este link de redefinição não é válido ou já expirou (validade de 30 minutos).
                  Solicite um novo link.
                </p>
              </div>
            </div>
            <Link
              href="/esqueci-minha-senha"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 transition-colors border border-rose-500/30"
            >
              <ArrowLeft className="w-4 h-4" />
              Solicitar novo link
            </Link>
          </div>
        )}

        {erro && tokenValido !== false && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-lg text-sm mb-6 flex items-start gap-2">
            <Lock className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{erro}</span>
          </div>
        )}

        {sucesso && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 p-3 rounded-lg text-sm mb-6 flex items-start gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span>{sucesso}</span>
              <p className="text-xs mt-1 opacity-80">Você será redirecionado para o login em instantes...</p>
            </div>
          </div>
        )}

        {tokenValido && !sucesso && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Nova Senha</label>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg pl-10 pr-12 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-xs font-medium transition-colors"
                  tabIndex={-1}
                >
                  {mostrarSenha ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              {novaSenha && (
                <div className="mt-2">
                  <div className="flex gap-1 h-1.5 mb-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-full transition-colors ${
                          i < forcaSenha ? corForca : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Força da senha: <span className="font-medium">{labelForca}</span></p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Confirmar Nova Senha</label>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="Repita a senha"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  className={`w-full bg-slate-50 dark:bg-[#070c18] border rounded-lg pl-10 pr-4 py-3 text-slate-900 dark:text-white focus:outline-none transition-colors ${
                    confirmarSenha && novaSenha !== confirmarSenha
                      ? 'border-rose-400 focus:border-rose-500'
                      : confirmarSenha && novaSenha === confirmarSenha
                      ? 'border-emerald-400 focus:border-emerald-500'
                      : 'border-slate-200 dark:border-[#1e293b] focus:border-blue-500'
                  }`}
                />
                {confirmarSenha && novaSenha === confirmarSenha && (
                  <CheckCircle className="w-5 h-5 absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />
                )}
              </div>
              {confirmarSenha && novaSenha !== confirmarSenha && (
                <p className="text-xs text-rose-400 mt-1">As senhas não conferem</p>
              )}
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
                  Redefinir senha
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

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

export default function RedefinirSenhaPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 dark:bg-[#070c18] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    }>
      <RedefinirSenhaContent />
    </Suspense>
  );
}
