"use client";

import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';

export default function LogoutButton() {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    if (loading) return;
    setLoading(true);
    try {
      // redirect: false evita a corrida entre o redirect do NextAuth e o
      // estado de sessão do SessionProvider — navegamos manualmente depois
      await signOut({ redirect: false });
    } finally {
      // Força navegação hard para /login, limpando qualquer estado React em memória
      window.location.href = '/login';
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="p-3 rounded-full border bg-white dark:bg-[#0d1527] border-slate-200 dark:border-[#1e293b] text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors shadow-sm disabled:opacity-60"
      title="Sair do Sistema"
    >
      {loading
        ? <span className="w-5 h-5 border-2 border-rose-300 border-t-rose-500 rounded-full animate-spin block" />
        : <LogOut className="w-5 h-5" />
      }
    </button>
  );
}
