"use client";

import React from 'react';

// ── Bloco base pulsante ───────────────────────────────────────────────────────
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-slate-200 dark:bg-[#1e293b] ${className}`} />
  );
}

// ── Skeleton do Painel Operacional ────────────────────────────────────────────
export function PainelSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070c18] p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-2">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-7 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-5 border-l-4 border-l-slate-200 dark:border-l-slate-700">
            <div className="flex justify-between mb-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-5 rounded" />
            </div>
            <Skeleton className="h-9 w-16 mb-2" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-t-xl p-4 flex gap-3">
        <Skeleton className="h-9 w-36 rounded-lg" />
        <Skeleton className="h-9 w-36 rounded-lg" />
        <Skeleton className="h-9 w-36 rounded-lg" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] border-t-0 rounded-b-xl overflow-hidden">
        {/* Cabeçalho */}
        <div className="grid grid-cols-6 gap-4 px-6 py-3 bg-slate-50 dark:bg-[#0b1329] border-b border-slate-200 dark:border-[#1e293b]">
          {['w-24','w-28','w-20','w-16','w-20','w-16'].map((w, i) => (
            <Skeleton key={i} className={`h-3 ${w}`} />
          ))}
        </div>
        {/* Linhas */}
        {[...Array(6)].map((_, i) => (
          <div key={i} className="px-6 py-5 border-b border-slate-100 dark:border-[#1e293b] last:border-0">
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-2 w-full max-w-[140px]" />
                <Skeleton className="h-2 w-full max-w-[100px]" />
                <Skeleton className="h-1.5 w-32 mt-2" />
                <Skeleton className="h-1 w-32" />
              </div>
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <div className="flex gap-1">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Skeleton do Diário de Campo ───────────────────────────────────────────────
export function DiarioSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070c18] p-4 md:p-6 lg:p-8 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-2">
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-7 w-52" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      <div className="flex gap-6 flex-1">
        {/* Sidebar */}
        <div className="w-80 bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-4 space-y-4">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <div className="space-y-2 pt-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-[#070c18]">
                <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Conteúdo principal */}
        <div className="flex-1 flex flex-col gap-6">
          {/* Card de usuário */}
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-6 flex items-center gap-4">
            <Skeleton className="w-16 h-16 rounded-full shrink-0" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>

          {/* Formulário */}
          <div className="bg-slate-100 dark:bg-[#111a30] border border-slate-200 dark:border-[#1e293b] rounded-xl p-6 space-y-4">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <div className="flex gap-4">
              <Skeleton className="h-10 flex-1 rounded-lg" />
              <Skeleton className="h-10 w-56 rounded-lg" />
            </div>
            <div className="flex gap-4">
              <Skeleton className="h-10 flex-1 rounded-lg" />
              <Skeleton className="h-10 w-28 rounded-lg" />
              <Skeleton className="h-10 w-36 rounded-lg" />
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-6 flex-1">
            <Skeleton className="h-5 w-48 mb-6" />
            <div className="ml-4 border-l border-slate-200 dark:border-[#1e293b] space-y-8 pl-8">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-3">
                  <div className="flex justify-between">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-5 w-36 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-full max-w-md" />
                  <Skeleton className="h-3 w-64" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton do Dashboard ─────────────────────────────────────────────────────
export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070c18] p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-3 w-36" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-5 border-l-4 border-l-slate-200 dark:border-l-slate-700">
            <div className="flex justify-between mb-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-5 rounded" />
            </div>
            <Skeleton className="h-9 w-14 mb-2" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl p-6">
            <Skeleton className="h-4 w-40 mb-1" />
            <Skeleton className="h-3 w-32 mb-5" />
            <Skeleton className="h-44 w-full rounded-lg" />
            <div className="space-y-2 mt-4">
              {[...Array(3)].map((_, j) => (
                <div key={j} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-2.5 h-2.5 rounded-full" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-3 w-8" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Cards de projeto */}
      <div className="mb-6">
        <Skeleton className="h-5 w-48 mb-4" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-xl overflow-hidden">
              <div className="h-1 bg-slate-200 dark:bg-[#1e293b]" />
              <div className="p-6 space-y-5">
                <div className="flex justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-10 h-10 rounded-xl" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <div className="space-y-1 items-end flex flex-col">
                    <Skeleton className="h-7 w-12" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-2.5 w-full rounded-full" />
                <Skeleton className="h-28 w-full rounded-lg" />
                <div className="flex gap-2">
                  {[...Array(3)].map((_, j) => (
                    <Skeleton key={j} className="h-6 w-24 rounded-full" />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
