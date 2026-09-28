"use client";

import { useEffect } from "react";
import { requestPersistentStorage } from "@/lib/idb";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    // 1. Solicita proteção de armazenamento persistente (evita que o SO limpe os dados locais no mobile)
    requestPersistentStorage();

    // 2. Registra o Service Worker imediatamente (sem depender de evento 'load' que já pode ter passado)
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const registerSW = () => {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .then((reg) => {
            console.log("[PWA] Service Worker registrado com sucesso:", reg.scope);
            // Força checagem de nova versão imediatamente
            reg.update().catch(() => {});

            reg.addEventListener("updatefound", () => {
              const newWorker = reg.installing;
              if (newWorker) {
                newWorker.addEventListener("statechange", () => {
                  if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                    console.log("[PWA] Nova versão instalada e pronta para uso offline.");
                  }
                });
              }
            });
          })
          .catch((err) => {
            console.warn("[PWA] Falha ao registrar Service Worker:", err);
          });
      };

      // Se a página já terminou de carregar (comum em React/Next.js hydration), registra na hora!
      if (document.readyState === "complete" || document.readyState === "interactive") {
        registerSW();
      } else {
        window.addEventListener("load", registerSW, { once: true });
      }
    }
  }, []);

  return null;
}
