"use client";

import React, { useEffect, useState } from "react";
import { Smartphone, Share, X } from "lucide-react";

export default function InstallAppButton({ className = "" }: { className?: string }) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  useEffect(() => {
    // Detecta se já está rodando em modo aplicativo (PWA instalado)
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    if (standalone) return;

    // Detecta iOS (Safari)
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIOS(isIosDevice);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  // Se já estiver rodando como aplicativo instalado, oculta o botão
  if (isStandalone) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setIsStandalone(true);
      }
      setDeferredPrompt(null);
    } else {
      alert(
        "Para instalar, abra o menu do seu navegador (três pontinhos) e toque em 'Instalar aplicativo' ou 'Adicionar à tela inicial'."
      );
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className={`px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#1e293b] hover:border-emerald-500/50 bg-white dark:bg-[#0d1527] text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all active:scale-95 shrink-0 ${className}`}
        title="Instalar o TerraCafé como aplicativo no celular ou computador"
      >
        <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
        <span>Instalar App</span>
      </button>

      {/* Modal explicativo para iPhone (Safari) */}
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
              onClick={() => setShowIOSModal(false)}
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
