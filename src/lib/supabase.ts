import { createClient, SupabaseClient } from '@supabase/supabase-js';
import env from '@/lib/env';

/**
 * Singleton do cliente Supabase com service_role.
 * Reutiliza a mesma instância entre requests no mesmo worker do Node.js,
 * evitando recriar a conexão HTTP/TLS a cada chamada de API.
 * Nunca usar no lado do cliente (browser) — apenas em API routes e server components.
 */
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      `Supabase não configurado: SUPABASE_URL=${url ? 'OK' : 'FALTANDO'} | SUPABASE_SERVICE_ROLE_KEY=${key ? 'OK' : 'FALTANDO'}`
    );
  }

  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _client;
}
