import { useState, useEffect } from 'react';

/**
 * Hook customizado para simular dados em tempo real vindos de sensores/banco via WebSockets.
 * Em um cenário real, aqui seria feita a conexão com Socket.io ou WebSocket nativo.
 */
export function useRealtimeData<T>(initialData: T, updateIntervalMs: number = 5000, updaterFn: (prevData: T) => T) {
  const [data, setData] = useState<T>(initialData);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    // Simula a conexão inicial
    const connectTimer = setTimeout(() => {
      setIsLive(true);
    }, 1000);

    const intervalId = setInterval(() => {
      setData((prevData) => updaterFn(prevData));
    }, updateIntervalMs);

    return () => {
      clearTimeout(connectTimer);
      clearInterval(intervalId);
      setIsLive(false);
    };
  }, [updateIntervalMs, updaterFn]);

  return { data, isLive };
}
