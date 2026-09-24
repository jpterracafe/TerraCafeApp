"use client";

import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/Toast";
import OfflineSyncIndicator from "@/components/OfflineSyncIndicator";
import { LojaProvider } from "@/contexts/LojaContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <LojaProvider>
          <OfflineSyncIndicator />
          {children}
        </LojaProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
