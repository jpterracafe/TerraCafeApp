import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavigationDrawer from "@/components/NavigationDrawer";
import Providers from "@/components/Providers";

export const dynamic = 'force-dynamic';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Terra Café",
  description: "Sistema de Gestão e Irrigação - Terra Café",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          Script inline bloqueante — executa ANTES do primeiro paint.
          Aplica a classe "dark" no <html> imediatamente, sem esperar o JS
          hidrate, eliminando o flash branco ao carregar qualquer página.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('terracafe_theme');var p=window.matchMedia('(prefers-color-scheme:dark)').matches;if(s==='dark'||(!s&&p)||!s){document.documentElement.classList.add('dark');}else if(s==='light'){document.documentElement.classList.remove('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-[#070c18]">
        <Providers>
          <NavigationDrawer />
          <main className="flex-1 w-full relative">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
