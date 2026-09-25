"use client";

import React, { useState, useRef, useEffect } from "react";
import { useLoja } from "@/contexts/LojaContext";
import { Store, ChevronDown, Check, Globe, Building2, ExternalLink } from "lucide-react";
import Link from "next/link";

export default function LojaSelector() {
  const {
    lojas,
    selectedLoja,
    setSelectedLoja,
    userAssignedLoja,
    canSwitchLoja,
    isDiretor,
    isAdmin,
  } = useLoja();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Se não puder trocar de loja (ex: Agricultor comum)
  if (!canSwitchLoja) {
    if (!userAssignedLoja) return null;
    return (
      <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
        <Store className="w-3.5 h-3.5 text-blue-500" />
        <span className="truncate max-w-[130px]">{userAssignedLoja}</span>
      </div>
    );
  }

  const labelAtual = selectedLoja === "TODAS" ? "Todas as Lojas" : selectedLoja;

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 transition-all shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        title="Filtrar dados por Loja/Filial"
      >
        {selectedLoja === "TODAS" ? (
          <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        ) : (
          <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        )}
        <span className="truncate max-w-[80px] sm:max-w-[120px] md:max-w-[170px]">{labelAtual}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-blue-500 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 origin-top-right rounded-2xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-slate-800 shadow-2xl ring-1 ring-black/5 z-[100] py-2 divide-y divide-slate-100 dark:divide-slate-800 focus:outline-none animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3.5 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Visualização por Filial
            </p>
            {userAssignedLoja && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Sua filial: <strong className="text-slate-800 dark:text-slate-200">{userAssignedLoja}</strong>
              </p>
            )}
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                setSelectedLoja("TODAS");
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2 text-xs text-left transition-colors ${
                selectedLoja === "TODAS"
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Globe className="w-4 h-4 text-blue-500" />
                <span>🌐 Todas as Lojas (Geral)</span>
              </div>
              {selectedLoja === "TODAS" && <Check className="w-4 h-4 text-blue-500" />}
            </button>
          </div>

          <div className="py-1 max-h-56 overflow-y-auto">
            {lojas.length === 0 ? (
              <div className="px-3.5 py-2 text-xs text-slate-400 italic">
                Nenhuma loja cadastrada
              </div>
            ) : (
              lojas.map((loja) => {
                const isSelected = selectedLoja === loja.nome;
                const isMyLoja = userAssignedLoja === loja.nome;

                return (
                  <button
                    key={loja.id}
                    type="button"
                    onClick={() => {
                      setSelectedLoja(loja.nome);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2 text-xs text-left transition-colors ${
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold"
                        : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate pr-2">
                      <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="truncate">{loja.nome}</span>
                      {isMyLoja && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-medium">
                          Sua
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-500 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          {isAdmin && !isDiretor && (
            <div className="py-1.5 px-3">
              <Link
                href="/admin/usuarios"
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-500 transition-colors"
              >
                <Store className="w-3.5 h-3.5" />
                <span>Gerenciar Lojas no Admin</span>
                <ExternalLink className="w-3 h-3 text-slate-400 ml-0.5" />
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
