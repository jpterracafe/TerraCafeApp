"use client";

import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const savedInitialTheme = localStorage.getItem('terracafe_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const [isDark, setIsDark] = useState(() => {
    if (savedInitialTheme === 'dark') return true;
    if (savedInitialTheme === 'light') return false;
    return prefersDark;
  });

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
    const onChange = () => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (!localStorage.getItem('terracafe_theme')) {
        setIsDark(prefersDark);
        document.documentElement.classList.toggle('dark', prefersDark);
      }
    };
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  const setLightMode = () => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('terracafe_theme', 'light');
    setIsDark(false);
  };

  const setDarkMode = () => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('terracafe_theme', 'dark');
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
