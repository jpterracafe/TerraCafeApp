'use client';

export const dynamic = 'force-dynamic';

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html>
      <body>
        <h2>Algo deu errado!</h2>
        <button onClick={() => retry()}>Tentar novamente</button>
      </body>
    </html>
  );
}
