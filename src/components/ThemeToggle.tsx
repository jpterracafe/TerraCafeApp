"use client";

import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  // SSR-safe: o primeiro render (servidor) sempre assume "dark", igual ao
  // script inline do layout. O valor real do localStorage é aplicado após
  // montar, só no browser — nunca encosta em window/localStorage no SSR.
  const [isDark, setIsDark] = useState(true);

  // Sincroniza com a preferência salva ao montar (client-only)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('terracafe_theme');
      if (saved === 'dark') setIsDark(true);
      else if (saved === 'light') setIsDark(false);
      else setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch {
      // mantém dark
    }
  }, []);

  useEffect(() => {
    // Apply the initial theme class to document element
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Sync theme when system preference changes (only if user hasn't set a preference)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = () => {
      try {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (!window.localStorage?.getItem('terracafe_theme')) {
          setIsDark(prefersDark);
          document.documentElement.classList.toggle('dark', prefersDark);
        }
      } catch {}
    };
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  const setLightMode = () => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('dark');
    }
    if (typeof window !== 'undefined') {
      try {
        window.localStorage?.setItem('terracafe_theme', 'light');
      } catch {}
    }
    setIsDark(false);
  };

  const setDarkMode = () => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.add('dark');
    }
    if (typeof window !== 'undefined') {
      try {
        window.localStorage?.setItem('terracafe_theme', 'dark');
      } catch {}
    }
    setIsDark(true);
  };

  return (
    <div className="flex items-center bg-white dark:bg-[#0b1329] border border-slate-200 dark:border-[#1e293b] rounded-lg p-1 shadow-sm">
      <button
        onClick={setLightMode}
        className={`flex items-center justify-center p-1.5 rounded-md transition-all ${
          !isDark 
            ? 'bg-blue-100 text-blue-600 shadow-sm' 
            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
        }`}
        title="Modo Claro"
      >
        <Sun className="w-4 h-4" />
      </button>
      <button
        onClick={setDarkMode}
        className={`flex items-center justify-center p-1.5 rounded-md transition-all ${
          isDark 
            ? 'bg-slate-800 text-blue-400 shadow-sm' 
            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
        }`}
        title="Modo Escuro"
      >
        <Moon className="w-4 h-4" />
      </button>
    </div>
  );
}
