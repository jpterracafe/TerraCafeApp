"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CloudOff, RefreshCw, UploadCloud, WifiOff, AlertTriangle, Download, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/Toast";
import {
  flushOfflineQueue,
  getPendingCount,
  isOnline,
  subscribe,
  hasAuthError,
  exportOfflineBackup,
} from "@/lib/offline";

/**
 * Indicador global de conectividade e sincronização com proteção total contra perda de dados.
 * - Mostra status de conexão e total de alterações protegidas no aparelho.
 * - Sincronização automática quando a rede voltar ou quando a tela for reaberta.
 * - Alerta de sessão expirada sem descarte de dados.
 * - Opção de download de cópia de segurança dos dados locais a qualquer momento.
 */
export default function OfflineSyncIndicator() {
  const { success, error: toastError } = useToast();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const refresh = useCallback(() => {
    setOnline(isOnline());
    setPending(getPendingCount());
    setAuthNeeded(hasAuthError());
  }, []);

  const handleFlush = useCallback(async () => {
    setSyncing(true);
    try {
      const { sent, failed, authError } = await flushOfflineQueue();
      if (sent > 0) {
        success(
          sent === 1
            ? "1 alteração sincronizada com a nuvem com sucesso!"
            : `${sent} alterações sincronizadas com a nuvem com sucesso!`
        );
      }
      if (authError) {
        toastError("Sessão expirada. Seus dados estão seguros no aparelho, faça login para sincronizar.");
      } else if (failed > 0) {
        toastError(
          `${failed} alteração(ões) com aviso mantida(s) no aparelho com segurança para revisão.`
        );
      }
    } catch {
      // noop
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [success, toastError, refresh]);

  const handleDownloadBackup = async () => {
    try {
      const jsonStr = await exportOfflineBackup();
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `terracafe-backup-offline-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      success("Cópia de segurança dos dados locais baixada!");
    } catch (e) {
      toastError("Erro ao gerar cópia de segurança.");
    }
  };

  useEffect(() => {
    const unsub = subscribe(refresh);
    let onlineStabilizeTimer: ReturnType<typeof setTimeout> | null = null;

    const onOnline = () => {
      refresh();
      if (onlineStabilizeTimer) clearTimeout(onlineStabilizeTimer);
      // Aguarda 1.5s para garantir que a rede móvel rural estabilizou
      onlineStabilizeTimer = setTimeout(() => {
        if (isOnline() && getPendingCount() > 0) {
          handleFlush();
        }
      }, 1500);
    };

    const onOffline = () => {
      if (onlineStabilizeTimer) clearTimeout(onlineStabilizeTimer);
      refresh();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
        if (isOnline() && getPendingCount() > 0) handleFlush();
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);

    const initTimer = setTimeout(() => {
      refresh();
      if (isOnline() && getPendingCount() > 0) handleFlush();
    }, 100);

    return () => {
      unsub();
      if (onlineStabilizeTimer) clearTimeout(onlineStabilizeTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(initTimer);
    };
  }, [refresh, handleFlush]);

  if (online && pending === 0 && !syncing && !authNeeded) return null;

  return (
    <div className="fixed bottom-6 left-6 z-[9998] flex flex-col gap-2 max-w-sm">
      {authNeeded ? (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-semibold shadow-2xl shadow-rose-950/40 animate-in fade-in duration-200">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-200" />
          <div className="flex-1">
            <span className="block font-bold">Sessão expirada</span>
            <span className="text-[11px] text-rose-100">
              Dados salvos no aparelho. Faça login para enviar.
            </span>
          </div>
          <Link
            href="/login"
            className="px-2.5 py-1 rounded-lg bg-white text-rose-700 hover:bg-rose-50 transition-colors text-[11px] font-black uppercase tracking-wide shrink-0"
          >
            Entrar
          </Link>
        </div>
      ) : syncing ? (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-2xl shadow-blue-900/30">
          <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
          <span>Sincronizando com a nuvem...</span>
        </div>
      ) : pending > 0 ? (
        <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-amber-500/95 dark:bg-amber-600/95 text-white text-xs font-medium shadow-2xl shadow-amber-950/30">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UploadCloud className="w-4 h-4 shrink-0" />
              <span className="font-bold">
                {pending === 1
                  ? "1 alteração salva no aparelho"
                  : `${pending} alterações salvas no aparelho`}
              </span>
            </div>
            {online && (
              <button
                type="button"
                onClick={handleFlush}
                className="px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-[11px] font-black uppercase tracking-wide shrink-0"
              >
                Enviar
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-amber-100 border-t border-white/15 pt-1.5 mt-0.5">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Armazenado com segurança
            </span>
            <button
              type="button"
              onClick={handleDownloadBackup}
              title="Baixar arquivo de backup dos dados locais"
              className="underline hover:text-white flex items-center gap-1 font-semibold"
            >
              <Download className="w-3 h-3" />
              Backup
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-800/95 text-slate-100 text-xs font-semibold shadow-2xl shadow-black/40 border border-slate-700/50">
          {online ? <CloudOff className="w-4 h-4 text-emerald-400" /> : <WifiOff className="w-4 h-4 text-amber-400" />}
          <span>Modo Offline — dados seguros no aparelho</span>
        </div>
      )}
    </div>
  );
}
