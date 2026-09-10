"use client";

import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const savedTheme = localStorage.getItem('terracafe_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // We add the class to the document root based on selection
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    } else if (savedTheme === 'light') {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    } else {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    }
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
