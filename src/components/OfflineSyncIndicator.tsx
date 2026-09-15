"use client";

import { useCallback, useEffect, useState } from 'react';
import { CloudOff, RefreshCw, UploadCloud, WifiOff } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { flushOfflineQueue, getPendingCount, isOnline, subscribe } from '@/lib/offline';

/**
 * Indicador global de conectividade e sincronização.
 * - Mostra o status da conexão e quantas alterações estão pendentes.
 * - Ao voltar a conexão (ou ao abrir o app), reenvia automaticamente
 *   as alterações feitas offline e avisa o usuário via toast.
 */
export default function OfflineSyncIndicator() {
  const { success, error: toastError } = useToast();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    setOnline(isOnline());
    setPending(getPendingCount());
  }, []);

  const handleFlush = useCallback(async () => {
    setSyncing(true);
    try {
      const { sent, failed } = await flushOfflineQueue();
      if (sent > 0) {
        success(
          sent === 1
            ? '1 alteração sincronizada com a nuvem!'
            : `${sent} alterações sincronizadas com a nuvem!`
        );
      }
      if (failed > 0) {
        toastError(
          failed === 1
            ? '1 alteração não pôde ser sincronizada e foi descartada.'
            : `${failed} alterações não puderam ser sincronizadas.`
        );
      }
    } catch {
      // noop — o indicador continua acompanhando a fila
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [success, toastError, refresh]);

  useEffect(() => {
    const unsub = subscribe(refresh);

    const onOnline = () => {
      refresh();
      handleFlush();
    };
    const onOffline = () => refresh();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
        if (isOnline() && getPendingCount() > 0) handleFlush();
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);

    // Inicialização + sincroniza pendências de sessões anteriores
    // (fora do corpo síncrono do efeito para evitar renders em cascata)
    const initTimer = setTimeout(() => {
      refresh();
      if (isOnline() && getPendingCount() > 0) handleFlush();
    }, 0);

    return () => {
      unsub();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(initTimer);
    };
  }, [refresh, handleFlush]);

  if (online && pending === 0 && !syncing) return null;

  return (
    <div className="fixed bottom-6 left-6 z-[9998] pointer-events-none">
      {syncing ? (
        <div className="pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-2xl shadow-blue-900/30">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Sincronizando alterações...</span>
        </div>
      ) : pending > 0 ? (
        <div className="pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-amber-500/95 text-white text-xs font-bold shadow-2xl shadow-amber-900/30">
          <UploadCloud className="w-4 h-4" />
          <span>
            {pending === 1
              ? '1 alteração aguardando sincronização'
              : `${pending} alterações aguardando sincronização`}
          </span>
          <button
            type="button"
            onClick={handleFlush}
            className="px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-[11px] font-black uppercase tracking-wide"
          >
            Sincronizar
          </button>
        </div>
      ) : (
        <div className="pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-800/90 text-slate-100 text-xs font-bold shadow-2xl shadow-black/30">
          {online ? <CloudOff className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
          <span>Offline — alterações salvas no dispositivo</span>
        </div>
      )}
    </div>
  );
}
