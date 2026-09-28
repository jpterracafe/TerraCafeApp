"use client";

import { useEffect } from "react";
import { requestPersistentStorage } from "@/lib/idb";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    // 1. Solicita proteção de armazenamento persistente (evita que o SO limpe os dados locais no mobile)
    requestPersistentStorage();

    // 2. Registra o Service Worker para suporte offline total
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      // Registra após o carregamento da página para não disputar banda com a inicialização
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .then((reg) => {
            console.log("[PWA] Service Worker registrado com sucesso:", reg.scope);

            // Verifica se há atualização disponível
            reg.addEventListener("updatefound", () => {
              const newWorker = reg.installing;
              if (newWorker) {
                newWorker.addEventListener("statechange", () => {
                  if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                    console.log("[PWA] Nova versão do aplicativo disponível em cache.");
                  }
                });
              }
            });
          })
          .catch((err) => {
            console.warn("[PWA] Falha ao registrar Service Worker:", err);
          });
      });
    }
  }, []);

  return null;
}
