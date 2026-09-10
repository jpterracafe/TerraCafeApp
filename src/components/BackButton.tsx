"use client";

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function BackButton({ fallback = "/irrigacao/execucao" }: { fallback?: string }) {
  const router = useRouter();

  return (
    <button
      onClick={() => {
        if (window.history.length > 2) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
      className="p-3 rounded-full border bg-white dark:bg-[#0d1527] border-slate-200 dark:border-[#1e293b] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#111a30] transition-colors shadow-sm flex items-center justify-center mr-2"
      title="Voltar"
    >
      <ArrowLeft className="w-5 h-5" />
    </button>
  );
}
