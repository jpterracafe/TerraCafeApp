/**
 * Validação type-safe de variáveis de ambiente.
 *
 * Valida no momento do import (startup) as variáveis NÃO-CRÍTICAS com defaults
 * conhecidos, e mantém como opcionais as variáveis que habilitam features
 * opcionais (ex: Supabase para "modo prévia" na importação CSV).
 *
 * Em runtime NÃO há mudança de comportamento — os mesmos defaults e fallbacks
 * usados em supabase.ts, auth.ts e importar-csv/route.ts foram preservados aqui.
 */

export interface EnvConfig {
  SUPABASE_URL: string | undefined;
  SUPABASE_SERVICE_ROLE_KEY: string | undefined;
  NEXTAUTH_URL: string;
  NEXTAUTH_SECRET: string;
  ADMIN_EMAIL: string | undefined;
  ADMIN_PASSWORD: string | undefined;
}

function optional(value: string | undefined): string | undefined {
  if (!value || value.trim() === "") return undefined;
  return value;
}

const raw = process.env;

const env: EnvConfig = {
  SUPABASE_URL: optional(raw.SUPABASE_URL ?? raw.NEXT_PUBLIC_SUPABASE_URL),
  SUPABASE_SERVICE_ROLE_KEY: optional(raw.SUPABASE_SERVICE_ROLE_KEY),
  NEXTAUTH_URL: raw.NEXTAUTH_URL?.trim() || "http://localhost:3000",
  NEXTAUTH_SECRET: raw.NEXTAUTH_SECRET?.trim() || "terracafe_dev_secret_key_987654321_fixed",
  ADMIN_EMAIL: optional(raw.ADMIN_EMAIL),
  ADMIN_PASSWORD: optional(raw.ADMIN_PASSWORD),
};

export default env;
