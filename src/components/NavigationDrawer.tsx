"use client";

import React, { useState } from 'react';
import { 
  Menu, X, LayoutDashboard, BarChart2, Calendar, Layers, Users, Trash2, ShieldCheck, 
  ExternalLink 
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';

export default function NavigationDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const toggleDrawer = () => setIsOpen(!isOpen);

  const role = (session?.user as { role?: string } | undefined)?.role;
  const isMasterDev = role === 'Desenvolvedor' || session?.user?.email === 'joao2005souza@gmail.com';

  const navLinks = [
    { href: '/visao-geral', label: 'Resumo Geral Executivo (Paulo)', icon: LayoutDashboard, color: 'text-blue-500' },
    { href: '/admin/dashboard', label: 'Visão do Diretor (Dashboards)', icon: BarChart2, color: 'text-cyan-500' },
    { href: '/irrigacao/diario-campo', label: 'Diário de Campo', icon: Calendar, color: 'text-amber-500' },
    { href: '/irrigacao/execucao', label: 'Cronograma & Execução', icon: Layers, color: 'text-indigo-500' },
    { href: '/irrigacao/responsaveis', label: 'Equipe & Responsáveis', icon: Users, color: 'text-emerald-500' },
    { href: '/irrigacao/lixeira', label: 'Lixeira de Projetos', icon: Trash2, color: 'text-rose-500' },
    ...(isMasterDev ? [
      { href: '/admin/usuarios', label: 'Usuários do Sistema', icon: ShieldCheck, color: 'text-purple-500' }
    ] : []),
  ];

  return (
    <>
      {/* Top Bar Unificada */}
      <header className="sticky top-0 z-40 flex items-center justify-between h-16 px-4 md:px-6 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm transition-colors">
        <div className="flex items-center">
          <button 
            onClick={toggleDrawer}
            className="p-2 -ml-2 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Abrir menu lateral"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="ml-3 font-bold text-base md:text-lg text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
            TerraCafé <span className="text-xs font-normal text-slate-400">Irrigação</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>

      {/* Overlay escuro quando o drawer está aberto */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
          onClick={toggleDrawer}
        />
      )}

      {/* Drawer (Menu Lateral) */}
      <div 
        className={`fixed top-0 left-0 h-full w-72 bg-white dark:bg-gray-900 shadow-2xl z-50 transform transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">TerraCafé</h2>
            <p className="text-xs text-slate-400">Sistema Integrado de Irrigação</p>
          </div>
          <button 
            onClick={toggleDrawer}
            className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            
            return (
              <button
                key={link.href}
                onClick={() => {
                  setIsOpen(false);
                  router.push(link.href);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 text-left ${
                  isActive 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-800'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : link.color}`} />
                <span className="truncate flex-1">{link.label}</span>
              </button>
            );
          })}

          <div className="pt-3 mt-3 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={() => {
                setIsOpen(false);
                window.open('/relatorio?projeto=__todos__', '_blank');
              }}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-800 transition-all text-left"
            >
              <ExternalLink className="w-4 h-4 text-slate-400" />
              <span>Relatório Executivo Geral</span>
            </button>
          </div>
        </nav>

        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <p className="text-[11px] text-gray-400">TerraCafé v2.0</p>
          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Online" />
        </div>
      </div>
    </>
  );
}
