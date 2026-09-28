"use client";

import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/Toast";
import OfflineSyncIndicator from "@/components/OfflineSyncIndicator";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { LojaProvider } from "@/contexts/LojaContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <LojaProvider>
          <ServiceWorkerRegister />
          <OfflineSyncIndicator />
          {children}
        </LojaProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
