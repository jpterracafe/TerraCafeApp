import { NextResponse } from "next/server";
import type { Session } from "next-auth";

/**
 * Valida se a sessão existe e retorna uma resposta de erro 401 se não existir.
 * Retorna `null` quando a sessão é válida.
 *
 * Evita duplicação desse boilerplate em TODAS as rotas de API do projeto
 * (antes existia uma cópia idêntica dessa função em fases, diario-logs,
 * responsaveis e diario-upload).
 */
export function requireSession(
  session: Session | null
): NextResponse | null {
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  return null;
}

/**
 * Extrai um parâmetro da query string de forma segura.
 * Retorna `null` se o parâmetro não existir.
 */
export function getQueryParam(req: Request, name: string): string | null {
  try {
    return new URL(req.url).searchParams.get(name);
  } catch {
    return null;
  }
}
