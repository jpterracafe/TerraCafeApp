"use client";

import React, { useState, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, ArrowRight, ShieldCheck, Leaf, Droplets, Sprout, Coffee } from 'lucide-react';
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
      } else if (role === 'Admin') {
        // Admin NÃO é master de /admin/usuarios (a página o redirecionaria
        // para diario-campo) — vai direto para evitar o "quique" entre páginas.
        router.replace('/irrigacao/diario-campo');
      } else if (role === 'Diretor') {
        router.replace('/visao-geral');
      } else if (role === 'Agricultor') {
        router.replace('/irrigacao/diario-campo');
      } else {
        // Colaborador e outros roles vão para o diário (execução oculta)
        router.replace('/irrigacao/diario-campo');
      }
    }
  }, [session, status, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const emailNormalizado = email.trim().toLowerCase();

      const result = await signIn('credentials', {
        email: emailNormalizado,
        password: password,
        redirect: false,
      });

      if (result?.error) {
        setError('E-mail ou senha incorretos. Acesso negado.');
        setIsLoading(false);
      }
    } catch (err) {
      console.error('[login] Exceção:', err);
      setError('Erro interno. Tente novamente.');
      setIsLoading(false);
    }
  };

  // Mostra um indicador em vez de tela preta enquanto checa a sessão
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#0a0f0d] flex items-center justify-center" aria-label="Carregando">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans select-none">
      
      {/* Botão de Tema no Canto Superior */}
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Background Decorativo com Cores de Terra, Café e Irrigação */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        {/* Glow de Café / Terra Fértil (Âmbar/Marrom quente) */}
        <div className="absolute -top-32 -left-32 w-[520px] h-[520px] bg-gradient-to-br from-amber-800/25 via-amber-900/15 to-transparent rounded-full blur-[140px]" />
        
        {/* Glow de Vegetação e Lavoura (Verde Esmeralda Profundo) */}
        <div className="absolute -bottom-32 -right-32 w-[550px] h-[550px] bg-gradient-to-tl from-emerald-800/25 via-green-900/15 to-transparent rounded-full blur-[150px]" />
        
        {/* Gotas e Orvalho / Irrigação Central */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] bg-radial from-emerald-950/20 via-transparent to-transparent rounded-full blur-[100px]" />

        {/* Padrão Sutil de Linhas de Plantio / Campo */}
        <div 
          className="absolute inset-0 opacity-[0.04]" 
          style={{ 
            backgroundImage: `radial-gradient(#10b981 1px, transparent 1px), radial-gradient(#d97706 1px, transparent 1px)`,
            backgroundSize: '36px 36px',
            backgroundPosition: '0 0, 18px 18px'
          }} 
        />
      </div>

      {/* Card Principal de Login */}
      <div className="w-full max-w-md bg-[#0f1715]/90 backdrop-blur-2xl border border-emerald-900/40 rounded-3xl shadow-2xl shadow-black/80 z-10 p-8 sm:p-10 relative">
        
        {/* Detalhe superior em gradiente verde cafeeiro */}
        <div className="absolute top-0 left-10 right-10 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent" />

        {/* Cabeçalho da Marca TerraCafé */}
        <div className="flex flex-col items-center mb-8 text-center">
          
          {/* Logo Oficial TerraCafé Irrigação */}
          <div className="relative mb-5 flex items-center justify-center">
            <img
              src="/logo-terra-cafe-white.png"
              alt="TerraCafé Irrigação"
              className="h-12 sm:h-14 w-auto object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
            />
          </div>

          {/* Badge de Tecnologia Agrícola */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[11px] font-bold uppercase tracking-wider mb-2">
            <Sprout className="w-3.5 h-3.5" />
            <span>Sistema Integrado de Obras & Irrigação</span>
          </div>

          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 justify-center">
            <span>Tecnologia & Gestão Operacional</span>
            <span className="text-emerald-500">•</span>
            <span>Acesso Restrito</span>
          </p>
        </div>

        {/* Mensagem de Erro com Estilo Alerta Agrícola */}
        {error && (
          <div className="bg-rose-950/40 border border-rose-500/40 text-rose-300 p-3.5 rounded-xl text-xs font-semibold mb-6 flex items-center gap-2.5 animate-in fade-in zoom-in-95 duration-200 shadow-sm">
            <Lock className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Formulário de Autenticação */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              E-mail Corporativo
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-500/70" />
              <input 
                type="email" 
                required
                id="login-email"
                placeholder="seu.nome@terracafe.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#080d0b] border border-emerald-900/40 hover:border-emerald-700/50 focus:border-emerald-500 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Senha de Acesso
              </label>
              <a 
                href="/esqueci-minha-senha" 
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Esqueceu a senha?
              </a>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-500/70" />
              <input 
                type="password" 
                required
                id="login-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#080d0b] border border-emerald-900/40 hover:border-emerald-700/50 focus:border-emerald-500 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>
          </div>

          <button 
            type="submit"
            id="login-submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-green-600 hover:from-emerald-500 hover:to-green-500 active:scale-[0.99] text-white rounded-xl py-3.5 font-bold text-sm transition-all shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-3 border border-emerald-400/30"
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            ) : (
              <>
                <span>Acessar Plataforma</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Micro-Badges de Campo no Rodapé do Card */}
        <div className="mt-8 pt-5 border-t border-emerald-900/30 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <Coffee className="w-3.5 h-3.5 text-amber-500" />
            <span>Café & Irrigação</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Acesso Seguro</span>
          </div>
        </div>

      </div>

    </div>
  );
}
