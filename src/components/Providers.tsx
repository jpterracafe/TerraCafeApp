"use client";

import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/Toast";
import OfflineSyncIndicator from "@/components/OfflineSyncIndicator";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <OfflineSyncIndicator />
        {children}
      </ToastProvider>
    </SessionProvider>
  );
}
