"use client";

import React, { useEffect, useState } from "react";
import { Download, X, Smartphone, Share } from "lucide-react";

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    // Verifica se já está rodando em modo standalone (PWA instalado)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      return;
    }

    // Verifica se o usuário dispensou recentemente
    try {
      const dismissedUntil = localStorage.getItem("terracafe_pwa_dismissed_until");
      if (dismissedUntil && Date.now() < Number(dismissedUntil)) {
        return;
      }
    } catch {}

    setIsDismissed(false);

    // Detecta iOS (Safari)
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIOS(isIosDevice);

    // Captura evento beforeinstallprompt no Android / Chrome / Edge
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (!deferredPrompt) {
      // Se não houver prompt nativo capturado, tenta guiar o usuário
      alert("Para instalar, abra o menu do seu navegador (três pontinhos) e toque em 'Instalar aplicativo' ou 'Adicionar à tela inicial'.");
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      // Não mostra de novo por 5 dias
      localStorage.setItem("terracafe_pwa_dismissed_until", String(Date.now() + 5 * 24 * 60 * 60 * 1000));
    } catch {}
  };

  if (isDismissed || (!isInstallable && !isIOS)) {
    return null;
  }

  return (
    <>
      {/* Barra de instalação flutuante discreta na parte inferior do mobile */}
      <div className="no-print fixed bottom-3 left-3 right-3 md:left-auto md:right-4 z-40 max-w-sm bg-slate-900/95 dark:bg-[#0d1527]/95 backdrop-blur-md text-white border border-slate-700/60 rounded-2xl p-3 shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between gap-3">
          
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-100 truncate">
                Instalar App TerraCafé
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                Acesse mais rápido em tela cheia
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-all active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Instalar</span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>

      {/* Modal explicativo para iOS (Safari) */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-[#1e293b] rounded-2xl w-full max-w-sm p-5 shadow-2xl text-slate-900 dark:text-white space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#1e293b] pb-3">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-500" />
                Como instalar no iPhone
              </h4>
              <button
                onClick={() => setShowIOSModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-2.5 list-decimal list-inside leading-relaxed">
              <li>
                No Safari, toque no botão <strong>Compartilhar</strong> (ícone <Share className="w-3.5 h-3.5 inline mx-0.5" /> na barra inferior).
              </li>
              <li>
                Role para baixo e selecione <strong>&ldquo;Adicionar à Tela de Início&rdquo;</strong>.
              </li>
              <li>
                Toque em <strong>Adicionar</strong> no canto superior direito.
              </li>
            </ol>

            <button
              type="button"
              onClick={() => {
                setShowIOSModal(false);
                handleDismiss();
              }}
              className="w-full py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
