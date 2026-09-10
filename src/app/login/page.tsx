"use client";

import React, { useState, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, ArrowRight, ShieldCheck, Leaf } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const authError = searchParams.get('error');
    // Só mostra erro se vier um parâmetro de erro real do NextAuth (ex: ?error=CredentialsSignin)
    if (authError && authError !== 'processing') {
      setError('E-mail ou senha incorretos. Acesso negado.');
    }
  }, [searchParams]);

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      const role = (session.user as any).role;
      if (role === 'Desenvolvedor') {
        router.replace('/admin/usuarios');
      } else {
        router.replace('/irrigacao/execucao');
      }
    }
  }, [session, status, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const emailNormalizado = email.trim().toLowerCase();

      // redirect: false para não forçar reload de página — o useEffect acima
      // já trata o redirecionamento baseado na role assim que a sessão atualizar.
      const result = await signIn('credentials', {
        email: emailNormalizado,
        password: password,
        redirect: false,
      });

      if (result?.error) {
        setError('E-mail ou senha incorretos. Acesso negado.');
        setIsLoading(false);
      }
      // Se ok: SessionProvider atualiza a sessão → useEffect redireciona por role
    } catch (err) {
      console.error('[login] Exceção:', err);
      setError('Erro interno. Tente novamente.');
      setIsLoading(false);
    }
  };

  // Don't flash content while checking session
  if (status === 'loading') return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070c18] flex items-center justify-center p-4 relative overflow-hidden font-sans">
      
      {/* Background Ornaments */}
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Terra Café Irrigação</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Acesso Restrito ao Sistema</p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-lg text-sm mb-6 flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">E-mail Corporativo</label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="email" 
                required
                id="login-email"
                placeholder="seu.nome@terracafe.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg pl-10 pr-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Senha</label>
              <a href="/esqueci-minha-senha" className="text-xs text-blue-500 hover:text-blue-400 transition-colors">Esqueceu a senha?</a>
            </div>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="password" 
                required
                id="login-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#070c18] border border-slate-200 dark:border-[#1e293b] rounded-lg pl-10 pr-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          <button 
            type="submit"
            id="login-submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3 font-medium transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-2"
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            ) : (
              <>
                Entrar no Sistema
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4" />
          <span>Autenticação Segura via NextAuth (JWT HttpOnly)</span>
        </div>
      </div>
    </div>
  );
}
