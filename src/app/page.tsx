"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'loading') return;

    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }

    // Autenticado — redireciona para a nova tela principal executiva de resumo geral (/visao-geral)
    router.replace('/visao-geral');
  }, [status, session, router]);

  return null;
}
