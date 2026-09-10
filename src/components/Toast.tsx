"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';

// ── Tipos ─────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
}

// ── Contexto ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'success', duration = 3500) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev.slice(-4), { id, type, message, duration }]);
    setTimeout(() => remove(id), duration);
  }, [remove]);

  const success = useCallback((msg: string) => toast(msg, 'success'), [toast]);
  const error   = useCallback((msg: string) => toast(msg, 'error',   4500), [toast]);
  const warning = useCallback((msg: string) => toast(msg, 'warning', 4000), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, warning }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={remove} />
    </ToastContext.Provider>
  );
}

// ── Container ─────────────────────────────────────────────────────────────────

function ToastContainer({ toasts, onRemove }: { toasts: ToastItem[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <ToastItem key={t.id} item={t} onRemove={onRemove} />
      ))}
    </div>
  );
}

// ── Item individual ───────────────────────────────────────────────────────────

function ToastItem({ item, onRemove }: { item: ToastItem; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Entrada suave
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onRemove(item.id), 300);
  }, [item.id, onRemove]);

  const cfg = {
    success: {
      icon:  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
      bar:   'bg-emerald-500',
      ring:  'border-emerald-500/30',
      bg:    'bg-white dark:bg-[#0d1527]',
    },
    error: {
      icon:  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />,
      bar:   'bg-rose-500',
      ring:  'border-rose-500/30',
      bg:    'bg-white dark:bg-[#0d1527]',
    },
    warning: {
      icon:  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
      bar:   'bg-amber-500',
      ring:  'border-amber-500/30',
      bg:    'bg-white dark:bg-[#0d1527]',
    },
  }[item.type];

  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl shadow-black/30 min-w-[260px] max-w-[360px] transition-all duration-300 ${cfg.bg} ${cfg.ring} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
    >
      {cfg.icon}
      <p className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">{item.message}</p>
      <button
        onClick={dismiss}
        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      {/* Barra de progresso */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl overflow-hidden">
        <div
          className={`h-full ${cfg.bar} origin-left`}
          style={{ animation: `toast-shrink ${item.duration ?? 3500}ms linear forwards` }}
        />
      </div>
      <style>{`
        @keyframes toast-shrink {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </div>
  );
}
