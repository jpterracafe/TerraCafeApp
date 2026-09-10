"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, CheckCircle2, Leaf, ArrowRight, ShieldCheck } from 'lucide-react';

import ThemeToggle from '@/components/ThemeToggle';
export default function ConvitePage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('As senhas não coincidem. Tente novamente.');
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      setIsLoading(false);
      return;
    }

    setTimeout(() => {
      setIsSuccess(true);
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070c18] flex items-center justify-center p-4 relative overflow-hidden font-sans">
      
      {/* Background Ornaments */}
      <div className="absolute top-4 right-4 z-50"><ThemeToggle /></div>
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none opacity-30">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600 rounded-full blur-[120px]"></div>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600 rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full max-w-md bg-white dark:bg-[#0d1527]/80 backdrop-blur-xl border border-slate-200 dark:border-[#1e293b] rounded-2xl shadow-2xl z-10 p-8 sm:p-10">
        
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-14 h-14 bg-emerald-600/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
            <Leaf className="w-7 h-7 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Terra Café Irrigação</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Defina sua senha corporativa</p>
        </div>

        {isSuccess ? (
          <div className="flex flex-col items-center text-center animate-in zoom-in duration-300">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30 mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Senha Definida!</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
              Sua conta foi ativada com sucesso. Agora você já pode acessar o sistema com seu e-mail e nova senha.
            </p>
            <button 
              onClick={() => router.push('/login')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-slate-900 dark:text-white rounded-lg py-3 font-medium transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
            >
              Ir para o Login
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-lg text-sm mb-6 flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSetPassword} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Criar Senha</label>
                <div className="relative">
                  <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input 
                    type="password" 
                    required
                    placeholder="Mínimo de 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg pl-10 pr-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Confirmar Senha</label>
                <div className="relative">
                  <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input 
                    type="password" 
                    required
                    placeholder="Repita a senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg pl-10 pr-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={isLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-slate-900 dark:text-white rounded-lg py-3 font-medium transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-4"
              >
                {isLoading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                ) : (
                  <>
                    Ativar Conta
                    <CheckCircle2 className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </>
        )}

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4" />
          <span>Suas credenciais serão criptografadas</span>
        </div>
      </div>
    </div>
  );
}
